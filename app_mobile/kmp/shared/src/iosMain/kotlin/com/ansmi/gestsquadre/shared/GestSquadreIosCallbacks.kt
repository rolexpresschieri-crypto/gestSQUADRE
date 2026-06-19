package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequest
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequestType
import com.ansmi.gestsquadre.shared.model.SquadSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private val iosScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

/**
 * Wrapper per Swift: evita il crash in ObjCExportCoroutines quando una suspend fallisce.
 */
fun GestSquadreFacade.loginSquadSafe(
    squadCode: String,
    password: String,
    onComplete: (SquadSession?, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(loginSquad(squadCode, password), null)
        } catch (e: Throwable) {
            onComplete(null, e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.logoutSquadSafe(
    session: SquadSession,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            logoutSquad(session)
            onComplete(null)
        } catch (e: Throwable) {
            onComplete(e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.updatePositionSafe(
    sessionId: String,
    position: GpsPosition,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            updatePosition(sessionId, position)
            onComplete(null)
        } catch (e: Throwable) {
            onComplete(e.message ?: e.toString())
        }
    }
}

/** Evita Set<Kotlin> da Swift per la scelta multipla allarme. */
fun GestSquadreFacade.makeSquadAlarmRequest(
    sanitario: Boolean,
    security: Boolean,
    vigiliFuoco: Boolean,
    altro: Boolean,
    otherDetail: String?,
): SquadAlarmRequest {
    val types =
        buildSet {
            if (sanitario) add(SquadAlarmRequestType.SANITARIO)
            if (security) add(SquadAlarmRequestType.SECURITY)
            if (vigiliFuoco) add(SquadAlarmRequestType.VIGILI_FUOCO)
            if (altro) add(SquadAlarmRequestType.ALTRO)
        }
    return SquadAlarmRequest(
        types = types,
        otherDetail = otherDetail?.trim()?.takeIf { it.isNotEmpty() },
    )
}

fun GestSquadreFacade.sendAlarmSafe(
    session: SquadSession,
    request: SquadAlarmRequest,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            sendAlarm(session, request)
            onComplete(null)
        } catch (e: Throwable) {
            onComplete(e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.restoreOnlineSessionSafe(
    sessionId: String,
    onComplete: (SquadSession?, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(restoreOnlineSession(sessionId), null)
        } catch (e: Throwable) {
            onComplete(null, e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.isSessionOnlineSafe(
    sessionId: String,
    onComplete: (Boolean, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(isSessionOnline(sessionId), null)
        } catch (e: Throwable) {
            onComplete(false, e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.refreshTocMapSafe(
    onComplete: (
        squads: List<LiveSquadPin>,
        waypoints: List<MapWaypointPin>,
        alarmingSessionIds: List<String>,
        errorMessage: String?,
    ) -> Unit,
) {
    iosScope.launch {
        try {
            val squads = loadMapSquads()
            val waypoints = loadMapWaypoints()
            val alarming = loadAlarmingSessionIds().toList()
            onComplete(squads, waypoints, alarming, null)
        } catch (e: Throwable) {
            onComplete(emptyList(), emptyList(), emptyList(), e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.registerFcmTokenSafe(
    sessionId: String,
    squadId: String,
    token: String,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            registerFcmToken(sessionId, squadId, token)
            onComplete(null)
        } catch (e: Throwable) {
            onComplete(e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.isTocPanelClosedByTocSafe(
    sessionId: String,
    onComplete: (Boolean, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(isTocPanelClosedByToc(sessionId), null)
        } catch (e: Throwable) {
            onComplete(false, e.message ?: e.toString())
        }
    }
}
