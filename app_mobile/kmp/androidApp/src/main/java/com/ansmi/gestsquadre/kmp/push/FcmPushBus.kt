package com.ansmi.gestsquadre.kmp.push

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

data class TocPushMessage(
    val title: String,
    val body: String,
)

object FcmPushBus {
    private val _messages = MutableSharedFlow<TocPushMessage>(extraBufferCapacity = 8)
    val messages: SharedFlow<TocPushMessage> = _messages.asSharedFlow()

    private val _panelClears = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val panelClears: SharedFlow<Unit> = _panelClears.asSharedFlow()

    fun emit(
        title: String,
        body: String,
    ) {
        _messages.tryEmit(TocPushMessage(title = title, body = body))
    }

    fun emitPanelClear() {
        _panelClears.tryEmit(Unit)
    }
}
