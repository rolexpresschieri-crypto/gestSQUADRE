package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.map.TocMapRepository
import com.ansmi.gestsquadre.shared.model.EventInfo
import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequest
import com.ansmi.gestsquadre.shared.model.SquadSession

/**
 * API pubblica del modulo KMP per Android (Compose) e iOS (SwiftUI).
 */
class GestSquadreFacade(
    config: GestSquadreConfig,
) {
    private val repository = GestSquadreRepository(config)
    private val mapRepository = TocMapRepository(config)

    suspend fun loadActiveEvent(): EventInfo? = repository.loadActiveEvent()

    suspend fun loginSquad(
        squadCode: String,
        password: String,
    ): SquadSession {
        val event =
            repository.loadActiveEvent()
                ?: throw GestSquadreException("Nessun evento attivo su Supabase.")
        return repository.loginSquad(
            eventId = event.id,
            squadCode = squadCode,
            password = password,
        )
    }

    suspend fun logoutSquad(session: SquadSession) = repository.logoutSquad(session)

    suspend fun restoreOnlineSession(sessionId: String): SquadSession? =
        repository.restoreOnlineSession(sessionId)

    suspend fun isSessionOnline(sessionId: String): Boolean =
        repository.isSessionOnline(sessionId)

    suspend fun updatePosition(
        sessionId: String,
        position: GpsPosition,
    ) = repository.updatePosition(sessionId, position)

    suspend fun registerFcmToken(
        sessionId: String,
        squadId: String,
        token: String,
    ) = repository.registerFcmToken(sessionId, squadId, token)

    suspend fun sendAlarm(
        session: SquadSession,
        request: SquadAlarmRequest,
    ) = repository.sendAlarm(session, request)

    suspend fun dismissTocNotification(
        session: SquadSession,
        panelMessage: String?,
    ) = repository.dismissTocNotification(session, panelMessage)

    suspend fun isTocPanelClosedByToc(sessionId: String): Boolean =
        repository.isTocPanelClosedByToc(sessionId)

    suspend fun fetchActivePanelMessage(session: SquadSession): String? =
        repository.fetchActivePanelMessage(session)

    suspend fun loadMapSquads(): List<LiveSquadPin> = mapRepository.loadLiveSquads()

    suspend fun loadMapWaypoints(): List<MapWaypointPin> = mapRepository.loadWaypoints()

    suspend fun loadAlarmingSessionIds(): Set<String> = mapRepository.loadAlarmingSessionIds()

    suspend fun loadActiveRouteAssignment(sessionId: String): ActiveRouteAssignment? =
        mapRepository.loadActiveRouteAssignment(sessionId)

    suspend fun clearActiveRouteAssignment(sessionId: String) =
        mapRepository.clearActiveRouteAssignment(sessionId)
}
