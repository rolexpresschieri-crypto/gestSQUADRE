package com.ansmi.gestsquadre.kmp.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansmi.gestsquadre.kmp.BuildConfig
import com.ansmi.gestsquadre.kmp.data.SessionStorage
import com.ansmi.gestsquadre.kmp.data.TocMessageStorage
import com.ansmi.gestsquadre.kmp.data.TocOperatorStorage
import com.ansmi.gestsquadre.kmp.location.AndroidPermissionHints
import com.ansmi.gestsquadre.kmp.location.GpsLocationPermissions
import com.ansmi.gestsquadre.kmp.location.GpsTrackingController
import com.ansmi.gestsquadre.kmp.location.GpsTrackingRuntime
import com.ansmi.gestsquadre.kmp.network.FieldPhotoUploadClient
import com.ansmi.gestsquadre.kmp.network.FieldPhotoUploadResult
import com.ansmi.gestsquadre.kmp.network.TocOperatorNotifyClient
import com.ansmi.gestsquadre.kmp.photo.FieldPhotoCompressor
import com.ansmi.gestsquadre.kmp.photo.FieldPhotoUploadQueue
import com.ansmi.gestsquadre.kmp.push.FcmManager
import com.ansmi.gestsquadre.kmp.map.RouteRefreshBus
import com.ansmi.gestsquadre.kmp.push.FcmPushBus
import com.ansmi.gestsquadre.kmp.push.FcmSessionRegistry
import com.ansmi.gestsquadre.shared.GestSquadreException
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.NetworkErrorMessages
import com.ansmi.gestsquadre.shared.OperationalEventActivator
import com.ansmi.gestsquadre.shared.location.GpsPublishPolicy
import com.ansmi.gestsquadre.shared.location.LocationTracker
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequest
import com.ansmi.gestsquadre.shared.model.SquadSession
import com.ansmi.gestsquadre.shared.model.formatTocPanelMessage
import com.ansmi.gestsquadre.shared.model.loginTimeLabel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class SquadUiState(
    val session: SquadSession? = null,
    val isBusy: Boolean = false,
    val isInitializing: Boolean = true,
    val bannerMessage: String? = null,
    val bannerAlert: Boolean = false,
    val lastTocMessage: String? = null,
    val backendConfigured: Boolean = false,
    val lastGpsAccuracyM: Double? = null,
    val gpsStatusLabel: String? = null,
    val requestLocationPermission: Boolean = false,
    val requestBackgroundLocationPermission: Boolean = false,
    val requestNotificationPermission: Boolean = false,
    val pushStatusLabel: String? = null,
    val pushStatusOk: Boolean = false,
    val tocOperatorAdminCode: String? = null,
    val fieldPhotoQueueCount: Int = 0,
)

class SquadViewModel(
    private val appContext: Context,
    private val facade: GestSquadreFacade,
    private val locationTracker: LocationTracker,
    private val sessionStorage: SessionStorage,
    private val tocMessageStorage: TocMessageStorage,
    private val tocOperatorStorage: TocOperatorStorage,
    private val fcmManager: FcmManager,
) : ViewModel() {

    private val fieldPhotoQueue = FieldPhotoUploadQueue(appContext)
    private var fieldPhotoQueueJob: Job? = null

    private val _uiState = MutableStateFlow(
        SquadUiState(
            backendConfigured =
                BuildConfig.SUPABASE_URL.isNotBlank() &&
                    BuildConfig.SUPABASE_ANON_KEY.isNotBlank(),
            tocOperatorAdminCode = tocOperatorStorage.registeredAdminCode(),
        ),
    )
    val uiState: StateFlow<SquadUiState> = _uiState.asStateFlow()

    private var sessionWatchJob: Job? = null
    private var pushWatchJob: Job? = null
    private var activityInForeground = false
    private var pendingGpsStart = false
    private var runtimePermissionsWereGranted = false

    init {
        viewModelScope.launch {
            restoreSessionOnStart()
            _uiState.update { it.copy(isInitializing = false) }
        }
        viewModelScope.launch {
            GpsTrackingRuntime.status.collect { status ->
                if (status == null) {
                    return@collect
                }
                _uiState.update {
                    it.copy(
                        lastGpsAccuracyM = status.accuracyM,
                        gpsStatusLabel = status.label,
                    )
                }
            }
        }
        viewModelScope.launch {
            FcmPushBus.messages.collect { push ->
                val message =
                    formatTocPanelMessage(push.title, push.body)
                        ?: return@collect
                tocMessageStorage.save(message)
                _uiState.update { it.copy(lastTocMessage = message) }
            }
        }
        viewModelScope.launch {
            FcmPushBus.panelClears.collect {
                tocMessageStorage.clear()
                _uiState.update { it.copy(lastTocMessage = null) }
                val sessionId = _uiState.value.session?.sessionId
                if (sessionId != null) {
                    RouteRefreshBus.emitCleared(sessionId)
                }
            }
        }
        startSessionWatchdog()
    }

    fun clearLastTocMessage() {
        val session = _uiState.value.session
        val panelMessage = _uiState.value.lastTocMessage
        tocMessageStorage.clear()
        _uiState.update { it.copy(lastTocMessage = null) }
        if (session == null) {
            return
        }
        viewModelScope.launch {
            runCatching { facade.dismissTocNotification(session, panelMessage) }
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
                onResult(NetworkErrorMessages.format(e))
            }
        }
    }

    fun logout(onResult: (String?) -> Unit) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            stopGpsTracking()
            _uiState.update { it.copy(isBusy = true) }
            try {
                facade.logoutSquad(session)
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

    private var bannerClearJob: Job? = null

    fun tryBeginOperationalEventAlarm(): Boolean {
        val session = _uiState.value.session ?: return false
        if (!OperationalEventActivator.isActivator(session.squadCode)) {
            showTemporaryBanner(OperationalEventActivator.UNAUTHORIZED_MESSAGE)
            return false
        }
        return true
    }

    private fun showTemporaryBanner(message: String) {
        bannerClearJob?.cancel()
        _uiState.update { it.copy(bannerMessage = message, bannerAlert = true) }
        bannerClearJob =
            viewModelScope.launch {
                delay(10_000)
                _uiState.update { state ->
                    if (state.bannerMessage == message) {
                        state.copy(bannerMessage = null, bannerAlert = false)
                    } else {
                        state
                    }
                }
            }
    }

    fun sendAlarm(
        request: SquadAlarmRequest,
        onResult: (String?) -> Unit,
    ) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            try {
                facade.sendAlarm(session, request)
                _uiState.update { it.copy(isBusy = false) }
                onResult(null)
            } catch (e: GestSquadreException) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message)
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(NetworkErrorMessages.format(e))
            }
        }
    }

    fun sendFieldPhoto(
        jpegBytes: ByteArray,
        note: String?,
        onResult: (String?) -> Unit,
    ) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            val compressed = FieldPhotoCompressor.compressJpeg(jpegBytes)
            val fix = locationTracker.getCurrentFix()
            if (fix == null) {
                _uiState.update { it.copy(isBusy = false) }
                onResult("GPS obbligatorio: attendi fix o abilita la posizione.")
                return@launch
            }
            val message =
                uploadFieldPhotoNow(
                    sessionId = session.sessionId,
                    latitude = fix.latitude,
                    longitude = fix.longitude,
                    accuracyM = fix.accuracyMeters,
                    note = note,
                    jpegBytes = compressed,
                )
            _uiState.update {
                it.copy(
                    isBusy = false,
                    fieldPhotoQueueCount = fieldPhotoQueue.pendingCount(),
                )
            }
            onResult(message)
        }
    }

    fun processFieldPhotoQueue() {
        val session = _uiState.value.session ?: return
        if (fieldPhotoQueueJob?.isActive == true) {
            return
        }
        fieldPhotoQueueJob =
            viewModelScope.launch {
                for (item in fieldPhotoQueue.listPending()) {
                    if (item.sessionId != session.sessionId) {
                        continue
                    }
                    val bytes = fieldPhotoQueue.readJpeg(item)
                    if (bytes == null) {
                        fieldPhotoQueue.remove(item)
                        continue
                    }
                    when (
                        val result =
                            FieldPhotoUploadClient.upload(
                                sessionId = item.sessionId,
                                latitude = item.latitude,
                                longitude = item.longitude,
                                accuracyM = item.accuracyM,
                                note = item.note,
                                jpegBytes = bytes,
                            )
                    ) {
                        FieldPhotoUploadResult.Success -> fieldPhotoQueue.remove(item)
                        FieldPhotoUploadResult.NetworkError -> break
                        is FieldPhotoUploadResult.PermanentError -> fieldPhotoQueue.remove(item)
                    }
                }
                _uiState.update {
                    it.copy(fieldPhotoQueueCount = fieldPhotoQueue.pendingCount())
                }
            }
    }

    private suspend fun uploadFieldPhotoNow(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegBytes: ByteArray,
    ): String? {
        when (
            val result =
                FieldPhotoUploadClient.upload(
                    sessionId = sessionId,
                    latitude = latitude,
                    longitude = longitude,
                    accuracyM = accuracyM,
                    note = note,
                    jpegBytes = jpegBytes,
                )
        ) {
            FieldPhotoUploadResult.Success -> {
                processFieldPhotoQueue()
                return null
            }
            FieldPhotoUploadResult.NetworkError -> {
                fieldPhotoQueue.enqueue(
                    sessionId = sessionId,
                    latitude = latitude,
                    longitude = longitude,
                    accuracyM = accuracyM,
                    note = note,
                    jpegBytes = jpegBytes,
                )
                return "Rete assente: foto in coda, invio automatico al ripristino."
            }
            is FieldPhotoUploadResult.PermanentError -> return result.message
        }
    }

    fun registerTocOperatorNotify(
        adminCode: String,
        password: String,
        onResult: (String?) -> Unit,
    ) {
        val code = adminCode.trim().uppercase()
        val pwd = password.trim()
        if (code.isEmpty() || pwd.isEmpty()) {
            onResult("Inserisci codice operatore e password TOC.")
            return
        }
        if (!fcmManager.isConfigured) {
            onResult("Push disabilitata: configura FIREBASE_* in dart-defines.json.")
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            try {
                if (!fcmManager.ensureNotificationPermission() &&
                    android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
                ) {
                    _uiState.update { it.copy(requestNotificationPermission = true) }
                }
                val token = fcmManager.fetchFcmToken()
                if (token.isNullOrBlank()) {
                    _uiState.update { it.copy(isBusy = false) }
                    onResult("Token push non ottenuto. Verifica Firebase e notifiche.")
                    return@launch
                }
                val err =
                    TocOperatorNotifyClient.registerOperatorFcm(
                        adminCode = code,
                        password = pwd,
                        fcmToken = token,
                        deviceLabel = android.os.Build.MODEL,
                    )
                if (err != null) {
                    _uiState.update { it.copy(isBusy = false) }
                    onResult(err)
                    return@launch
                }
                tocOperatorStorage.saveRegisteredAdminCode(code)
                _uiState.update {
                    it.copy(isBusy = false, tocOperatorAdminCode = code)
                }
                onResult(null)
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false) }
                onResult(e.message ?: "Registrazione notifiche TOC fallita.")
            }
        }
    }

    fun clearLocationPermissionRequest() {
        _uiState.update { it.copy(requestLocationPermission = false) }
    }

    fun clearNotificationPermissionRequest() {
        _uiState.update { it.copy(requestNotificationPermission = false) }
    }

    fun openAppSettings() {
        AndroidPermissionHints.openAppDetailsSettings(appContext)
    }

    private fun markRuntimePermissionsGrantedIfPresent() {
        if (AndroidPermissionHints.hasRequiredRuntimePermissions(appContext)) {
            runtimePermissionsWereGranted = true
        }
    }

    private fun checkRevokedPermissionsOnResume() {
        if (_uiState.value.session == null) {
            return
        }
        val hasNow = AndroidPermissionHints.hasRequiredRuntimePermissions(appContext)
        if (hasNow) {
            runtimePermissionsWereGranted = true
            return
        }
        if (runtimePermissionsWereGranted) {
            showTemporaryBanner(AndroidPermissionHints.PERMISSIONS_REVOKED_HINT)
        }
    }

    fun onLocationPermissionResult(granted: Boolean) {
        if (granted) {
            markRuntimePermissionsGrantedIfPresent()
            if (GpsLocationPermissions.shouldPromptBackgroundLocation(appContext)) {
                _uiState.update { it.copy(requestBackgroundLocationPermission = true) }
            }
            startGpsTracking()
        } else {
            _uiState.update {
                it.copy(
                    bannerMessage = "Permesso posizione negato: abilitalo per gestSQUADRE.",
                    bannerAlert = false,
                    gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
                )
            }
        }
    }

    fun clearBackgroundLocationPermissionRequest() {
        _uiState.update { it.copy(requestBackgroundLocationPermission = false) }
    }

    fun onBackgroundLocationPermissionResult(granted: Boolean) {
        clearBackgroundLocationPermissionRequest()
        if (!granted) {
            _uiState.update {
                it.copy(
                    bannerMessage =
                        "Per il tracking in tasca scegli «Consenti sempre» per la posizione " +
                            "(Impostazioni → gestSQUADRE → Posizione).",
                )
            }
        }
        startGpsTracking()
    }

    fun retryPushRegistration() {
        val session = _uiState.value.session ?: return
        if (!fcmManager.isConfigured) {
            return
        }
        viewModelScope.launch {
            if (!fcmManager.ensureNotificationPermission() &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
            ) {
                _uiState.update { it.copy(requestNotificationPermission = true) }
            }
            registerFcmForSession(session)
        }
    }

    /** App tornata in primo piano: avvia GPS solo ora (evita crash durante splash). */
    fun onAppResumed() {
        activityInForeground = true
        if (_uiState.value.session != null) {
            pendingGpsStart = true
            tryStartGpsIfReady()
            retryPushRegistration()
            processFieldPhotoQueue()
            checkRevokedPermissionsOnResume()
        }
    }

    fun onAppPaused() {
        activityInForeground = false
    }

    private fun tryStartGpsIfReady() {
        if (!activityInForeground || !pendingGpsStart || _uiState.value.session == null) {
            return
        }
        pendingGpsStart = false
        startGpsTracking()
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            if (granted) {
                markRuntimePermissionsGrantedIfPresent()
            }
            if (!granted) {
                _uiState.update {
                    it.copy(
                        bannerMessage =
                            "Notifiche disabilitate: abilitale in Impostazioni per vedere gli allarmi sul telefono.",
                    )
                }
            }
            registerFcmForSession(session)
        }
    }

    private suspend fun restoreSessionOnStart() {
        if (!sessionStorage.isAuthLogMigrationDone()) {
            val cached = sessionStorage.loadCached()
            if (cached != null) {
                try {
                    facade.logoutSquad(cached)
                } catch (_: Exception) {
                    // Rete assente o sessione già chiusa: pulizia locale comunque.
                }
                sessionStorage.clear()
            }
            sessionStorage.setAuthLogMigrationDone()
            return
        }

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
        val localPanel = tocMessageStorage.load()
        val serverPanel =
            runCatching { facade.fetchActivePanelMessage(session) }.getOrNull()
        val panelMessage = serverPanel ?: localPanel
        if (panelMessage != null) {
            tocMessageStorage.save(panelMessage)
        }
        _uiState.update {
            it.copy(
                session = session,
                isBusy = false,
                bannerMessage = null,
                bannerAlert = false,
                lastTocMessage = panelMessage,
                lastGpsAccuracyM = null,
                gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
            )
        }
        pendingGpsStart = true
        tryStartGpsIfReady()
        startPushWatchdog()
        if (fcmManager.isConfigured) {
            if (!fcmManager.ensureNotificationPermission() &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
            ) {
                _uiState.update { it.copy(requestNotificationPermission = true) }
            }
            registerFcmForSession(session)
        } else {
            _uiState.update {
                it.copy(
                    pushStatusLabel = "Push TOC disabilitata nell'APK (Firebase).",
                    pushStatusOk = false,
                    bannerMessage =
                        "Push TOC disabilitata: configura FIREBASE_* in dart-defines.json.",
                )
            }
        }
        markRuntimePermissionsGrantedIfPresent()
        processFieldPhotoQueue()
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
            val registeredOnServer = err.contains("Push registrata", ignoreCase = true)
            _uiState.update { state ->
                state.copy(
                    pushStatusLabel = err,
                    pushStatusOk = registeredOnServer,
                    bannerMessage = err,
                )
            }
        } else {
            _uiState.update { state ->
                state.copy(
                    pushStatusLabel = "Push TOC: attiva (il server può inviarti allarmi).",
                    pushStatusOk = true,
                    bannerMessage =
                        state.bannerMessage?.takeUnless { msg ->
                            msg.contains("token push", ignoreCase = true) ||
                                msg.contains("Push TOC", ignoreCase = true) ||
                                msg.contains("notifiche", ignoreCase = true)
                        },
                )
            }
        }
    }

    private fun startPushWatchdog() {
        pushWatchJob?.cancel()
        if (!fcmManager.isConfigured) {
            return
        }
        pushWatchJob =
            viewModelScope.launch {
                while (isActive) {
                    delay(5 * 60_000L)
                    val session = _uiState.value.session ?: continue
                    registerFcmForSession(session)
                }
            }
    }

    private fun stopPushWatchdog() {
        pushWatchJob?.cancel()
        pushWatchJob = null
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
                        continue
                    }
                    syncActivePanelMessage(session)
                }
            }
    }

    private suspend fun syncActivePanelMessage(session: SquadSession) {
        val serverMessage =
            runCatching { facade.fetchActivePanelMessage(session) }.getOrNull()
        when {
            serverMessage != null -> {
                if (_uiState.value.lastTocMessage != serverMessage) {
                    tocMessageStorage.save(serverMessage)
                    _uiState.update { it.copy(lastTocMessage = serverMessage) }
                }
            }
            _uiState.value.lastTocMessage != null -> {
                tocMessageStorage.clear()
                _uiState.update { it.copy(lastTocMessage = null) }
                RouteRefreshBus.emitCleared(session.sessionId)
            }
        }
    }

    private suspend fun handleRemoteLogout() {
        stopGpsTracking()
        stopPushWatchdog()
        FcmSessionRegistry.clear()
        sessionStorage.clear()
        _uiState.update {
            it.copy(
                session = null,
                isBusy = false,
                lastGpsAccuracyM = null,
                gpsStatusLabel = null,
                bannerMessage = "Logout effettuato dal TOC.",
                bannerAlert = false,
                pushStatusLabel = null,
                pushStatusOk = false,
            )
        }
    }

    private suspend fun clearLocalSession() {
        runtimePermissionsWereGranted = false
        stopPushWatchdog()
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
                pushStatusLabel = null,
                pushStatusOk = false,
            )
        }
    }

    private fun startGpsTracking() {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            if (!locationTracker.isLocationServiceEnabled()) {
                _uiState.update {
                    it.copy(
                        bannerMessage = "Attiva il GPS sul telefono per inviare la posizione al TOC.",
                        bannerAlert = false,
                        gpsStatusLabel = GpsPublishPolicy.accuracyLabel(null),
                    )
                }
                return@launch
            }
            if (!locationTracker.hasLocationPermission()) {
                _uiState.update { it.copy(requestLocationPermission = true) }
                return@launch
            }
            if (GpsLocationPermissions.shouldPromptBackgroundLocation(appContext)) {
                _uiState.update { it.copy(requestBackgroundLocationPermission = true) }
            }
            GpsTrackingController.start(appContext, session.sessionId)
        }
    }

    private fun stopGpsTracking() {
        GpsTrackingController.stop(appContext)
    }

    override fun onCleared() {
        stopPushWatchdog()
        sessionWatchJob?.cancel()
        super.onCleared()
    }
}
