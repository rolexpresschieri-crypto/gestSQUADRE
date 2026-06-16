package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.model.GpsPosition
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
    sessionId: String,
    onComplete: (String?) -> Unit,
) {
    iosScope.launch {
        try {
            logoutSquad(sessionId)
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
    ambulanza: Boolean,
    medico: Boolean,
    dae: Boolean,
    forzeOrdine: Boolean,
    vvf: Boolean,
    altro: Boolean,
    otherDetail: String?,
): SquadAlarmRequest {
    val types =
        buildSet {
            if (ambulanza) add(SquadAlarmRequestType.AMBULANZA)
            if (medico) add(SquadAlarmRequestType.MEDICO)
            if (dae) add(SquadAlarmRequestType.DAE)
            if (forzeOrdine) add(SquadAlarmRequestType.FORZE_ORDINE)
            if (vvf) add(SquadAlarmRequestType.VVF)
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
