package com.ansmi.gestsquadre.shared.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

actual class LocationTracker actual constructor(platformContext: Any) {
    private val context = platformContext as Context
    private val fused = LocationServices.getFusedLocationProviderClient(context)

    actual fun isLocationServiceEnabled(): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    actual fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    actual suspend fun getCurrentFix(): GpsPosition? {
        if (!hasLocationPermission()) {
            return null
        }
        return suspendCoroutine { cont ->
            val cancel = CancellationTokenSource()
            fused
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancel.token)
                .addOnSuccessListener { location ->
                    cont.resume(location?.toGpsPosition())
                }.addOnFailureListener {
                    cont.resume(null)
                }
        }
    }

    actual fun startUpdates(onFix: (GpsPosition) -> Unit): () -> Unit {
        if (!hasLocationPermission()) {
            return {}
        }
        val request =
            LocationRequest
                .Builder(Priority.PRIORITY_HIGH_ACCURACY, 2_000L)
                .setMinUpdateDistanceMeters(2f)
                .build()
        val callback =
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    result.lastLocation?.toGpsPosition()?.let(onFix)
                }
            }
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
        return { fused.removeLocationUpdates(callback) }
    }

    private fun android.location.Location.toGpsPosition(): GpsPosition =
        GpsPosition(
            latitude = latitude,
            longitude = longitude,
            accuracyMeters = if (hasAccuracy() && accuracy > 0f) accuracy.toDouble() else null,
        )
}
