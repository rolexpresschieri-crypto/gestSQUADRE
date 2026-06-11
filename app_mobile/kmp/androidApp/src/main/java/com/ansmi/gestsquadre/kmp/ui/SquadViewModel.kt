package com.ansmi.gestsquadre.kmp.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansmi.gestsquadre.kmp.BuildConfig
import com.ansmi.gestsquadre.kmp.data.SessionStorage
import com.ansmi.gestsquadre.kmp.data.TocMessageStorage
import com.ansmi.gestsquadre.kmp.push.FcmManager
import com.ansmi.gestsquadre.kmp.map.RouteRefreshBus
import com.ansmi.gestsquadre.kmp.push.FcmPushBus
import com.ansmi.gestsquadre.kmp.push.FcmSessionRegistry
import com.ansmi.gestsquadre.shared.GestSquadreException
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.location.GpsPublishPolicy
import com.ansmi.gestsquadre.shared.location.LocationTracker
import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.ansmi.gestsquadre.shared.model.SquadSession
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

data class SquadUiState(
    val session: SquadSession? = null,
    val isBusy: Boolean = false,
    val isInitializing: Boolean = true,
    val bannerMessage: String? = null,
    val lastTocMessage: String? = null,
    val backendConfigured: Boolean = false,
    val lastGpsAccuracyM: Double? = null,
    val gpsStatusLabel: String? = null,
    val requestLocationPermission: Boolean = false,
    val requestNotificationPermission: Boolean = false,
)

class SquadViewModel(
    private val facade: GestSquadreFacade,
    private val locationTracker: LocationTracker,
    private val sessionStorage: SessionStorage,
    private val tocMessageStorage: TocMessageStorage,
    private val fcmManager: FcmManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SquadUiState(
            backendConfigured =
                BuildConfig.SUPABASE_URL.isNotBlank() &&
                    BuildConfig.SUPABASE_ANON_KEY.isNotBlank(),
        ),
    )
    val uiState: StateFlow<SquadUiState> = _uiState.asStateFlow()

    private var stopLocationUpdates: (() -> Unit)? = null
    private var lastPublished: GpsPosition? = null
    private var lastPublishedAtMs: Long? = null
    private var gpsJob: Job? = null
    private var sessionWatchJob: Job? = null

    init {
        viewModelScope.launch {
            restoreSessionOnStart()
            _uiState.update { it.copy(isInitializing = false) }
        }
        viewModelScope.launch {
            FcmPushBus.messages.collect { push ->
                val body = push.body.trim()
                val title = push.title.trim()
                val message = if (body.isEmpty()) title else "$title: $body"
                // Notifica visiva solo in GestSquadreMessagingService (come Flutter fcm_service).
                _uiState.update { it.copy(lastTocMessage = message) }
            }
        }
        startSessionWatchdog()
    }

    fun clearLastTocMessage() {
        tocMessageStorage.clear()
        _uiState.update { it.copy(lastTocMessage = null) }
        val sessionId = _uiState.value.session?.sessionId ?: return
        viewModelScope.launch {
            runCatching { facade.clearActiveRouteAssignment(sessionId) }
                .onSuccess { RouteRefreshBus.emitCleared(sessionId) }
        }
    }

    fun login(squadCode: String, password: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            try {
                val session = facade.loginSquad(squadCode, password)
                onSessionReady(session)
                onResult(null)
            } catch (e: GestSquadreException) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message)
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message ?: "Login fallito.")
            }
        }
    }

    fun logout(onResult: (String?) -> Unit) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            stopGpsTracking()
            _uiState.update { it.copy(isBusy = true) }
            try {
                facade.logoutSquad(session.sessionId)
                clearLocalSession()
                onResult(null)
            } catch (e: GestSquadreException) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message)
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message ?: "Logout fallito.")
            }
        }
    }

    fun sendAlarm(onResult: (String?) -> Unit) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            try {
                facade.sendAlarm(session)
                _uiState.update { it.copy(isBusy = false) }
                onResult(null)
            } catch (e: GestSquadreException) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message)
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message ?: "Invio allarme fallito.")
            }
        }
    }

    fun clearLocationPermissionRequest() {
        _uiState.update { it.copy(requestLocationPermission = false) }
    }

    fun clearNotificationPermissionRequest() {
        _uiState.update { it.copy(requestNotificationPermission = false) }
    }

    fun onLocationPermissionResult(granted: Boolean) {
        if (granted) {
            startGpsTracking()
        } else {
            _uiState.update {
                it.copy(
                    bannerMessage = "Permesso posizione negato: abilitalo per gestSQUADRE.",
                    gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
                )
            }
        }
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        val session = _uiState.value.session ?: return
        if (!granted) {
            _uiState.update {
                it.copy(
                    bannerMessage = "Notifiche disabilitate: il TOC non potrà inviarti push.",
                )
            }
            return
        }
        viewModelScope.launch {
            registerFcmForSession(session)
        }
    }

    private suspend fun restoreSessionOnStart() {
        val sessionId = sessionStorage.loadSessionId() ?: return
        try {
            val session = facade.restoreOnlineSession(sessionId) ?: run {
                sessionStorage.clear()
                return
            }
            onSessionReady(session)
        } catch (_: Exception) {
            sessionStorage.clear()
        }
    }

    private suspend fun onSessionReady(session: SquadSession) {
        sessionStorage.save(session)
        bindFcmSession(session)
        val pendingToc = tocMessageStorage.load()
        _uiState.update {
            it.copy(
                session = session,
                isBusy = false,
                bannerMessage = null,
                lastTocMessage = pendingToc,
                lastGpsAccuracyM = null,
                gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
            )
        }
        startGpsTracking()
        if (fcmManager.isConfigured) {
            if (!fcmManager.ensureNotificationPermission() &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
            ) {
                _uiState.update { it.copy(requestNotificationPermission = true) }
            } else {
                registerFcmForSession(session)
            }
        } else {
            _uiState.update {
                it.copy(
                    bannerMessage =
                        "Push TOC disabilitata: configura FIREBASE_* in dart-defines.json.",
                )
            }
        }
    }

    private fun bindFcmSession(session: SquadSession) {
        FcmSessionRegistry.bind(
            activeSession = session,
            coroutineScope = viewModelScope,
        ) { active, token ->
            facade.registerFcmToken(
                sessionId = active.sessionId,
                squadId = active.squadId,
                token = token,
            )
        }
    }

    private suspend fun registerFcmForSession(session: SquadSession) {
        bindFcmSession(session)
        val err = fcmManager.registerToken(facade, session)
        if (err != null) {
            _uiState.update { state ->
                state.copy(
                    bannerMessage =
                        if (state.bannerMessage == null) err else state.bannerMessage,
                )
            }
        } else {
            _uiState.update { state ->
                val banner = state.bannerMessage
                if (banner != null && banner.contains("token push", ignoreCase = true)) {
                    state.copy(bannerMessage = null)
                } else {
                    state
                }
            }
        }
    }

    private fun startSessionWatchdog() {
        sessionWatchJob?.cancel()
        sessionWatchJob =
            viewModelScope.launch {
                while (isActive) {
                    delay(15_000)
                    val session = _uiState.value.session ?: continue
                    val online =
                        runCatching { facade.isSessionOnline(session.sessionId) }
                            .getOrDefault(true)
                    if (!online) {
                        handleRemoteLogout()
                    }
                }
            }
    }

    private suspend fun handleRemoteLogout() {
        stopGpsTracking()
        FcmSessionRegistry.clear()
        sessionStorage.clear()
        _uiState.update {
            it.copy(
                session = null,
                isBusy = false,
                lastGpsAccuracyM = null,
                gpsStatusLabel = null,
                bannerMessage = "Logout effettuato dal TOC.",
            )
        }
    }

    private suspend fun clearLocalSession() {
        FcmSessionRegistry.clear()
        sessionStorage.clear()
        tocMessageStorage.clear()
        _uiState.update {
            it.copy(
                session = null,
                isBusy = false,
                lastTocMessage = null,
                lastGpsAccuracyM = null,
                gpsStatusLabel = null,
            )
        }
    }

    private fun startGpsTracking() {
        if (_uiState.value.session == null) {
            return
        }
        gpsJob?.cancel()
        gpsJob =
            viewModelScope.launch {
                if (!locationTracker.isLocationServiceEnabled()) {
                    _uiState.update {
                        it.copy(
                            bannerMessage = "Attiva il GPS sul telefono per inviare la posizione al TOC.",
                            gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
                        )
                    }
                    return@launch
                }
                if (!locationTracker.hasLocationPermission()) {
                    _uiState.update { it.copy(requestLocationPermission = true) }
                    return@launch
                }
                stopLocationUpdates?.invoke()
                stopLocationUpdates = null
                val initial = locationTracker.getCurrentFix()
                if (initial != null) {
                    maybePublishPosition(initial)
                }
                stopLocationUpdates =
                    locationTracker.startUpdates { fix ->
                        viewModelScope.launch {
                            maybePublishPosition(fix)
                        }
                    }
            }
    }

    private suspend fun maybePublishPosition(position: GpsPosition) {
        val session = _uiState.value.session ?: return
        val now = System.currentTimeMillis()
        if (
            !GpsPublishPolicy.shouldPublish(
                position = position,
                lastPublished = lastPublished,
                lastPublishedAtMs = lastPublishedAtMs,
                nowMs = now,
            )
        ) {
            return
        }
        try {
            facade.updatePosition(session.sessionId, position)
            lastPublished = position
            lastPublishedAtMs = now
            val accuracy = position.accuracyMeters
            _uiState.update {
                it.copy(
                    lastGpsAccuracyM = accuracy,
                    gpsStatusLabel = GpsPublishPolicy.accuracyLabel(accuracy),
                    bannerMessage = null,
                )
            }
        } catch (_: Exception) {
        }
    }

    private fun stopGpsTracking() {
        gpsJob?.cancel()
        gpsJob = null
        stopLocationUpdates?.invoke()
        stopLocationUpdates = null
        lastPublished = null
        lastPublishedAtMs = null
    }

    override fun onCleared() {
        stopGpsTracking()
        sessionWatchJob?.cancel()
        super.onCleared()
    }
}

fun SquadSession.loginTimeLabel(): String {
    val local = loginAt.toLocalDateTime(TimeZone.currentSystemDefault())
    val h = local.hour.toString().padStart(2, '0')
    val m = local.minute.toString().padStart(2, '0')
    return "$h:$m"
}
