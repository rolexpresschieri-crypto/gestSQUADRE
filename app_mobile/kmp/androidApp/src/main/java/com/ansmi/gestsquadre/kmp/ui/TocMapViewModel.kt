package com.ansmi.gestsquadre.kmp.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.ansmi.gestsquadre.kmp.map.MapLayerMode
import com.ansmi.gestsquadre.kmp.map.MapViewState
import com.ansmi.gestsquadre.kmp.map.MapViewStorage
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.location.GpsPublishPolicy
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
    val alarmingSessionIds: Set<String> = emptySet(),
    val layerMode: MapLayerMode = MapLayerMode.STANDARD,
    val viewState: MapViewState = MapViewState.DEFAULT,
    val viewReady: Boolean = false,
)

class TocMapViewModel(
    private val facade: GestSquadreFacade,
    storage: MapViewStorage,
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
    }

    fun refresh(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _uiState.update { it.copy(loading = true) }
            }
            try {
                val squads = facade.loadMapSquads()
                val waypoints = facade.loadMapWaypoints()
                val alarming = facade.loadAlarmingSessionIds()
                _uiState.update {
                    it.copy(
                        loading = false,
                        error = null,
                        squads = squads,
                        waypoints = waypoints,
                        alarmingSessionIds = alarming,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        loading = false,
                        error = "Errore mappa: ${e.message}",
                    )
                }
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
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TocMapViewModel::class.java)) {
            return TocMapViewModel(facade, MapViewStorage(appContext)) as T
        }
        throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
    }
}
