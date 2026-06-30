package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
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
import kotlinx.datetime.Instant

private val iosScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

private fun iosCallbackErrorMessage(e: Throwable): String {
    if (e is GestSquadreException) {
        return e.message ?: e.toString()
    }
    return NetworkErrorMessages.format(e)
}

object SessionCache {
    fun parse(raw: String): SquadSession? {
        val parts = raw.split("|")
        if (parts.size < 6) {
            return null
        }
        return runCatching {
            SquadSession(
                sessionId = parts[0],
                eventId = parts[1],
                squadId = parts[2],
                squadCode = parts[3],
                squadName = parts[4],
                loginAt = Instant.parse(parts[5]),
                canOpenOperationalEvent = parts.getOrNull(6) == "1",
            )
        }.getOrNull()
    }
}

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
            onComplete(null, iosCallbackErrorMessage(e))
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
            onComplete(iosCallbackErrorMessage(e))
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
            onComplete(iosCallbackErrorMessage(e))
        }
    }
}

/** Evita Set<Kotlin> da Swift per la scelta multipla allarme. */
fun GestSquadreFacade.makeSquadAlarmRequest(
    sanitario: Boolean,
    security: Boolean,
    vigiliFuoco: Boolean,
    strutture: Boolean,
    altro: Boolean,
    otherDetail: String?,
): SquadAlarmRequest {
    val types =
        buildSet {
            if (sanitario) add(SquadAlarmRequestType.SANITARIO)
            if (security) add(SquadAlarmRequestType.SECURITY)
            if (vigiliFuoco) add(SquadAlarmRequestType.VIGILI_FUOCO)
            if (strutture) add(SquadAlarmRequestType.STRUTTURE)
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
            onComplete(iosCallbackErrorMessage(e))
        }
    }
}

fun GestSquadreFacade.openOperationalEventFromFieldSafe(
    session: SquadSession,
    request: SquadAlarmRequest,
    onComplete: (Int?, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(openOperationalEventFromField(session, request), null)
        } catch (e: Throwable) {
            onComplete(null, iosCallbackErrorMessage(e))
        }
    }
}

fun GestSquadreFacade.dismissTocNotificationSafe(
    session: SquadSession,
    panelMessage: String?,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            dismissTocNotification(session, panelMessage)
            onComplete(null)
        } catch (e: Throwable) {
            onComplete(iosCallbackErrorMessage(e))
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
            onComplete(null, iosCallbackErrorMessage(e))
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
            // Come Android: errore di rete ≠ logout remoto (evita disconnessione locale spuria).
            onComplete(true, e.message ?: e.toString())
        }
    }
}

fun GestSquadreFacade.loadActiveRouteAssignmentSafe(
    sessionId: String,
    onComplete: (ActiveRouteAssignment?, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(loadActiveRouteAssignment(sessionId), null)
        } catch (e: Throwable) {
            onComplete(null, iosCallbackErrorMessage(e))
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
        val squadsResult = runCatching { loadMapSquads() }
        val waypointsResult = runCatching { loadMapWaypoints() }
        val alarmingResult = runCatching { loadAlarmingSessionIds() }
        val firstError =
            listOf(
                squadsResult.exceptionOrNull(),
                waypointsResult.exceptionOrNull(),
                alarmingResult.exceptionOrNull(),
            ).firstOrNull()
        onComplete(
            squadsResult.getOrElse { emptyList() },
            waypointsResult.getOrElse { emptyList() },
            alarmingResult.getOrElse { emptySet() }.toList(),
            firstError?.message?.let { msg -> "Errore mappa: $msg" },
        )
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
            onComplete(iosCallbackErrorMessage(e))
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

fun GestSquadreFacade.fetchActivePanelMessageSafe(
    session: SquadSession,
    onComplete: (String?, String?) -> Unit,
) {
    iosScope.launch {
        try {
            onComplete(fetchActivePanelMessage(session), null)
        } catch (e: Throwable) {
            onComplete(null, iosCallbackErrorMessage(e))
        }
    }
}
