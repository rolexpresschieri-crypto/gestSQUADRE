package com.ansmi.gestsquadre.kmp.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.ansmi.gestsquadre.kmp.map.MapLayerMode
import com.ansmi.gestsquadre.kmp.map.MapViewState
import com.ansmi.gestsquadre.kmp.map.MapViewStorage
import com.ansmi.gestsquadre.kmp.map.RouteRefreshBus
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.location.GpsPublishPolicy
import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TocMapUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val squads: List<LiveSquadPin> = emptyList(),
    val waypoints: List<MapWaypointPin> = emptyList(),
    val activeRoute: ActiveRouteAssignment? = null,
    val alarmingSessionIds: Set<String> = emptySet(),
    val layerMode: MapLayerMode = MapLayerMode.STANDARD,
    val viewState: MapViewState = MapViewState.DEFAULT,
    val viewReady: Boolean = false,
)

class TocMapViewModel(
    private val facade: GestSquadreFacade,
    storage: MapViewStorage,
    private val focusSessionId: String?,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TocMapUiState())
    val uiState: StateFlow<TocMapUiState> = _uiState.asStateFlow()

    private var refreshJob: Job? = null

    init {
        val saved = storage.load()
        _uiState.update {
            it.copy(
                viewState = saved,
                layerMode = saved.layerMode,
                viewReady = true,
            )
        }
        refresh()
        refreshJob =
            viewModelScope.launch {
                while (isActive) {
                    delay(GpsPublishPolicy.MAP_REFRESH_INTERVAL_MS)
                    refresh(silent = true)
                }
            }
        viewModelScope.launch {
            RouteRefreshBus.cleared.collect { sessionId ->
                if (sessionId == focusSessionId) {
                    _uiState.update { it.copy(activeRoute = null) }
                }
            }
        }
    }

    fun refresh(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _uiState.update { it.copy(loading = true) }
            }
            val squadsResult = runCatching { facade.loadMapSquads() }
            val waypointsResult = runCatching { facade.loadMapWaypoints() }
            val alarmingResult = runCatching { facade.loadAlarmingSessionIds() }
            val activeRoute =
                focusSessionId?.let { sessionId ->
                    runCatching { facade.loadActiveRouteAssignment(sessionId) }
                        .getOrNull()
                }
            val firstError =
                listOf(
                    squadsResult.exceptionOrNull(),
                    waypointsResult.exceptionOrNull(),
                    alarmingResult.exceptionOrNull(),
                ).firstOrNull()
            _uiState.update {
                it.copy(
                    loading = false,
                    error = firstError?.message?.let { msg -> "Errore mappa: $msg" },
                    squads = squadsResult.getOrElse { emptyList() },
                    waypoints = waypointsResult.getOrElse { emptyList() },
                    activeRoute = activeRoute,
                    alarmingSessionIds = alarmingResult.getOrElse { emptySet() },
                )
            }
        }
    }

    fun setLayer(
        mode: MapLayerMode,
        storage: MapViewStorage,
    ) {
        _uiState.update { state ->
            state.copy(
                layerMode = mode,
                viewState = state.viewState.copy(layerMode = mode),
            )
        }
        storage.saveLayer(mode)
    }

    fun saveView(
        latitude: Double,
        longitude: Double,
        zoom: Double,
        storage: MapViewStorage,
    ) {
        storage.saveView(latitude, longitude, zoom)
        _uiState.update { state ->
            state.copy(
                viewState =
                    state.viewState.copy(
                        latitude = latitude,
                        longitude = longitude,
                        zoom = zoom,
                    ),
            )
        }
    }

    override fun onCleared() {
        refreshJob?.cancel()
        super.onCleared()
    }
}

class TocMapViewModelFactory(
    private val facade: GestSquadreFacade,
    private val appContext: Context,
    private val focusSessionId: String? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TocMapViewModel::class.java)) {
            return TocMapViewModel(
                facade,
                MapViewStorage(appContext),
                focusSessionId,
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
    }
}
