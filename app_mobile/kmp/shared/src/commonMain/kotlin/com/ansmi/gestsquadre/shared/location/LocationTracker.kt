package com.ansmi.gestsquadre.shared.location

import com.ansmi.gestsquadre.shared.model.GpsPosition

/**
 * Provider posizione multipiattaforma (Android: FusedLocation; iOS: CoreLocation).
 *
 * @param platformContext Android [android.content.Context] o altro handle nativo.
 */
expect class LocationTracker(platformContext: Any) {
    fun isLocationServiceEnabled(): Boolean

    fun hasLocationPermission(): Boolean

    suspend fun getCurrentFix(): GpsPosition?

    /** @return funzione per fermare gli aggiornamenti */
    fun startUpdates(onFix: (GpsPosition) -> Unit): () -> Unit
}
