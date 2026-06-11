package com.ansmi.gestsquadre.kmp.push

import com.ansmi.gestsquadre.shared.model.SquadSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Collega onNewToken (service) alla sessione attiva dopo login. */
object FcmSessionRegistry {
    @Volatile
    var session: SquadSession? = null

    @Volatile
    var scope: CoroutineScope? = null

    @Volatile
    var onToken: (suspend (SquadSession, String) -> Unit)? = null

    fun bind(
        activeSession: SquadSession,
        coroutineScope: CoroutineScope,
        register: suspend (SquadSession, String) -> Unit,
    ) {
        session = activeSession
        scope = coroutineScope
        onToken = register
    }

    fun clear() {
        session = null
        scope = null
        onToken = null
    }

    fun deliverNewToken(token: String) {
        val active = session ?: return
        val register = onToken ?: return
        val coroutineScope = scope ?: return
        coroutineScope.launch {
            runCatching { register(active, token) }
        }
    }
}
