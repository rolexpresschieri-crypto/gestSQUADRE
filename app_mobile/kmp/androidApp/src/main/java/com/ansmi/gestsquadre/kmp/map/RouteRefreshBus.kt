package com.ansmi.gestsquadre.kmp.map

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object RouteRefreshBus {
    private val _cleared = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val cleared: SharedFlow<String> = _cleared.asSharedFlow()

    fun emitCleared(sessionId: String) {
        _cleared.tryEmit(sessionId)
    }
}
