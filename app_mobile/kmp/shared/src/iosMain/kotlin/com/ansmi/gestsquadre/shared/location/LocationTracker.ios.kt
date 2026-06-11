package com.ansmi.gestsquadre.shared.location

import com.ansmi.gestsquadre.shared.model.GpsPosition

actual class LocationTracker actual constructor(platformContext: Any) {
    actual fun isLocationServiceEnabled(): Boolean = false

    actual fun hasLocationPermission(): Boolean = false

    actual suspend fun getCurrentFix(): GpsPosition? = null

    actual fun startUpdates(onFix: (GpsPosition) -> Unit): () -> Unit = {}
}
