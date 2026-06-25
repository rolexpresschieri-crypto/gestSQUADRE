package com.ansmi.gestsquadre.kmp.location

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object GpsTrackingRuntime {
    data class Status(
        val accuracyM: Double?,
        val label: String,
    )

    private val _status = MutableStateFlow<Status?>(null)
    val status: StateFlow<Status?> = _status.asStateFlow()

    internal fun update(accuracyM: Double?, label: String) {
        _status.value = Status(accuracyM = accuracyM, label = label)
    }

    internal fun clear() {
        _status.value = null
    }
}
