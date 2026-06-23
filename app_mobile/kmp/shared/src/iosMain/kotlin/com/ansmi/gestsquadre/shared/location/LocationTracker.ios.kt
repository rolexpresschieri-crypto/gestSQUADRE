@file:OptIn(ExperimentalForeignApi::class)

package com.ansmi.gestsquadre.shared.location

import com.ansmi.gestsquadre.shared.model.GpsPosition
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import platform.CoreLocation.CLLocation
import platform.CoreLocation.CLLocationManager
import platform.CoreLocation.CLLocationManagerDelegateProtocol
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedAlways
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedWhenInUse
import platform.CoreLocation.kCLAuthorizationStatusDenied
import platform.CoreLocation.kCLAuthorizationStatusNotDetermined
import platform.CoreLocation.kCLAuthorizationStatusRestricted
import platform.CoreLocation.kCLLocationAccuracyBest
import platform.Foundation.NSError
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue

private const val INITIAL_FIX_TIMEOUT_MS = 25_000L
private const val DISTANCE_FILTER_METERS = 2.0

private val locationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

/** Wrapper per Swift (suspend non esportata in modo comodo). */
fun LocationTracker.getCurrentFixSafe(onComplete: (GpsPosition?) -> Unit) {
    locationScope.launch {
        onComplete(getCurrentFix())
    }
}

actual class LocationTracker actual constructor(@Suppress("UNUSED_PARAMETER") platformContext: Any) {
    private val manager = CLLocationManager()
    private var continuousDelegate: ContinuousLocationDelegate? = null
    private var oneShotDelegate: OneShotLocationDelegate? = null

    actual fun isLocationServiceEnabled(): Boolean =
        CLLocationManager.locationServicesEnabled()

    actual fun hasLocationPermission(): Boolean =
        isAuthorized(CLLocationManager.authorizationStatus())

    fun isLocationPermissionDenied(): Boolean {
        val status = CLLocationManager.authorizationStatus()
        return status == kCLAuthorizationStatusDenied || status == kCLAuthorizationStatusRestricted
    }

    /** Richiesta permesso When-In-Use (da Swift se [hasLocationPermission] è false). */
    fun requestLocationAuthorization() {
        runOnMain {
            manager.requestWhenInUseAuthorization()
        }
    }

    actual suspend fun getCurrentFix(): GpsPosition? {
        if (!isLocationServiceEnabled()) {
            return null
        }
        if (!hasLocationPermission()) {
            if (CLLocationManager.authorizationStatus() == kCLAuthorizationStatusNotDetermined) {
                requestLocationAuthorization()
            }
            return null
        }
        return withTimeoutOrNull(INITIAL_FIX_TIMEOUT_MS) {
            suspendCoroutine { cont ->
                runOnMain {
                    clearOneShot()
                    val delegate =
                        OneShotLocationDelegate(
                            onResult = { position ->
                                clearOneShot()
                                cont.resume(position)
                            },
                        )
                    oneShotDelegate = delegate
                    configureManager(manager)
                    manager.delegate = delegate
                    manager.requestLocation()
                }
            }
        }
    }

    actual fun startUpdates(onFix: (GpsPosition) -> Unit): () -> Unit {
        if (!isLocationServiceEnabled()) {
            return {}
        }
        if (!hasLocationPermission()) {
            if (CLLocationManager.authorizationStatus() == kCLAuthorizationStatusNotDetermined) {
                requestLocationAuthorization()
            }
            return {}
        }
        runOnMain {
            stopContinuous()
            val delegate =
                ContinuousLocationDelegate { location ->
                    location.toGpsPosition()?.let(onFix)
                }
            continuousDelegate = delegate
            configureManager(manager)
            manager.delegate = delegate
            manager.startUpdatingLocation()
        }
        return {
            runOnMain { stopContinuous() }
        }
    }

    private fun configureManager(locationManager: CLLocationManager) {
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = DISTANCE_FILTER_METERS
        locationManager.pausesLocationUpdatesAutomatically = false
    }

    private fun stopContinuous() {
        manager.stopUpdatingLocation()
        manager.delegate = null
        continuousDelegate = null
    }

    private fun clearOneShot() {
        oneShotDelegate = null
        if (continuousDelegate == null) {
            manager.delegate = null
        }
    }

    private fun runOnMain(block: () -> Unit) {
        dispatch_async(dispatch_get_main_queue()) { block() }
    }
}

private fun isAuthorized(status: Int): Boolean =
    status == kCLAuthorizationStatusAuthorizedWhenInUse ||
        status == kCLAuthorizationStatusAuthorizedAlways

private fun CLLocation.toGpsPosition(): GpsPosition? {
    val accuracy = horizontalAccuracy
    return coordinate.useContents {
        GpsPosition(
            latitude = latitude,
            longitude = longitude,
            accuracyMeters = if (accuracy >= 0.0) accuracy else null,
        )
    }
}

private class ContinuousLocationDelegate(
    private val onLocation: (CLLocation) -> Unit,
) : NSObject(), CLLocationManagerDelegateProtocol {
    override fun locationManager(
        manager: CLLocationManager,
        didUpdateLocations: List<*>,
    ) {
        val location = didUpdateLocations.lastOrNull() as? CLLocation ?: return
        onLocation(location)
    }

    override fun locationManager(
        manager: CLLocationManager,
        didFailWithError: NSError,
    ) {
        // Ignora errori transienti; il chiamante gestisce assenza di fix.
    }
}

private class OneShotLocationDelegate(
    private val onResult: (GpsPosition?) -> Unit,
) : NSObject(), CLLocationManagerDelegateProtocol {
    private var finished = false

    override fun locationManager(
        manager: CLLocationManager,
        didUpdateLocations: List<*>,
    ) {
        if (finished) {
            return
        }
        val location = didUpdateLocations.lastOrNull() as? CLLocation
        finish(location?.toGpsPosition())
    }

    override fun locationManager(
        manager: CLLocationManager,
        didFailWithError: NSError,
    ) {
        finish(null)
    }

    private fun finish(position: GpsPosition?) {
        if (finished) {
            return
        }
        finished = true
        onResult(position)
    }
}
