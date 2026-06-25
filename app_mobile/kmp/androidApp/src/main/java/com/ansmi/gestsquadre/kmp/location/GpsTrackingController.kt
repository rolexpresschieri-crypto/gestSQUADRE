package com.ansmi.gestsquadre.kmp.location

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

object GpsTrackingController {
    private const val TAG = "GpsTrackingController"

    fun start(
        context: Context,
        sessionId: String,
    ): Boolean {
        val appContext = context.applicationContext
        if (!GpsLocationPermissions.hasFineLocation(appContext)) {
            Log.w(TAG, "start: permesso posizione fine assente")
            return false
        }
        GpsTrackingSessionStore.save(appContext, sessionId)
        val intent =
            Intent(appContext, SquadGpsForegroundService::class.java).apply {
                action = SquadGpsForegroundService.ACTION_START
                putExtra(SquadGpsForegroundService.EXTRA_SESSION_ID, sessionId)
            }
        return try {
            ContextCompat.startForegroundService(appContext, intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "startForegroundService fallito", e)
            false
        }
    }

    fun stop(context: Context) {
        val appContext = context.applicationContext
        GpsTrackingSessionStore.clear(appContext)
        GpsTrackingRuntime.clear()
        val intent =
            Intent(appContext, SquadGpsForegroundService::class.java).apply {
                action = SquadGpsForegroundService.ACTION_STOP
            }
        appContext.startService(intent)
    }
}
