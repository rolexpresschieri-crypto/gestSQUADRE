package com.ansmi.gestsquadre.shared

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
