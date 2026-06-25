package com.ansmi.gestsquadre.kmp.location

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.ansmi.gestsquadre.kmp.BuildConfig
import com.ansmi.gestsquadre.kmp.MainActivity
import com.ansmi.gestsquadre.kmp.R
import com.ansmi.gestsquadre.kmp.push.FcmManager
import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.location.GpsPublishPolicy
import com.ansmi.gestsquadre.shared.location.LocationTracker
import com.ansmi.gestsquadre.shared.model.GpsPosition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Tracking GPS continuo verso Supabase: resta attivo con schermo spento / app in tasca.
 */
class SquadGpsForegroundService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var locationTracker: LocationTracker
    private val facade by lazy {
        GestSquadreFacade(
            GestSquadreConfig(
                supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://placeholder.invalid" },
                supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY.ifBlank { "missing" },
            ),
        )
    }

    private var sessionId: String? = null
    private var stopLocationUpdates: (() -> Unit)? = null
    private var heartbeatJob: Job? = null
    private var lastPublished: GpsPosition? = null
    private var lastPublishedAtMs: Long? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        locationTracker = LocationTracker(applicationContext)
        FcmManager.createGpsTrackingChannel(this)
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown()
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val id = intent.getStringExtra(EXTRA_SESSION_ID)
                if (id.isNullOrBlank()) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                if (!beginTracking(id)) {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
            else -> {
                stopSelf()
                return START_NOT_STICKY
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        shutdown()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun beginTracking(id: String): Boolean {
        if (!locationTracker.hasLocationPermission()) {
            Log.w(TAG, "beginTracking: permesso posizione assente")
            return false
        }
        return try {
            sessionId = id
            GpsTrackingSessionStore.save(this, id)
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            shutdownStreams()
            if (!locationTracker.isLocationServiceEnabled()) {
                GpsTrackingRuntime.update(
                    accuracyM = null,
                    label = GpsPublishPolicy.accuracyLabel(null),
                )
                return true
            }

            serviceScope.launch {
                val initial = locationTracker.getCurrentFix()
                if (initial != null) {
                    maybePublish(initial)
                }
            }

            stopLocationUpdates =
                locationTracker.startUpdates { fix ->
                    serviceScope.launch {
                        maybePublish(fix)
                    }
                }

            heartbeatJob =
                serviceScope.launch {
                    while (isActive) {
                        delay(GpsPublishPolicy.MAP_REFRESH_INTERVAL_MS)
                        if (sessionId == null) {
                            continue
                        }
                        if (!locationTracker.hasLocationPermission()) {
                            continue
                        }
                        val now = System.currentTimeMillis()
                        val lastAt = lastPublishedAtMs
                        if (lastAt != null && now - lastAt < GpsPublishPolicy.MAP_REFRESH_INTERVAL_MS) {
                            continue
                        }
                        val fix = locationTracker.getCurrentFix() ?: continue
                        maybePublish(fix)
                    }
                }
            true
        } catch (e: Exception) {
            Log.e(TAG, "beginTracking fallito", e)
            false
        }
    }

    private suspend fun maybePublish(position: GpsPosition) {
        val sid = sessionId ?: return
        val now = System.currentTimeMillis()
        if (
            !GpsPublishPolicy.shouldPublish(
                position = position,
                lastPublished = lastPublished,
                lastPublishedAtMs = lastPublishedAtMs,
                nowMs = now,
            )
        ) {
            return
        }
        try {
            facade.updatePosition(sid, position)
            lastPublished = position
            lastPublishedAtMs = now
            val accuracy = position.accuracyMeters
            GpsTrackingRuntime.update(
                accuracyM = accuracy,
                label = GpsPublishPolicy.accuracyLabel(accuracy),
            )
        } catch (_: Exception) {
            // Rete assente: riprova al prossimo fix.
        }
    }

    private fun buildNotification(): Notification {
        val openApp =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        return NotificationCompat
            .Builder(this, FcmManager.CHANNEL_GPS_TRACKING)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle("Tracking squadra attivo")
            .setContentText("Posizione inviata al TOC (anche con schermo spento)")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun shutdownStreams() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        stopLocationUpdates?.invoke()
        stopLocationUpdates = null
        lastPublished = null
        lastPublishedAtMs = null
    }

    private fun shutdown() {
        shutdownStreams()
        sessionId = null
        GpsTrackingRuntime.clear()
    }

    companion object {
        private const val TAG = "SquadGpsFgService"
        const val ACTION_START = "com.ansmi.gest_squadre.gps.START"
        const val ACTION_STOP = "com.ansmi.gest_squadre.gps.STOP"
        const val EXTRA_SESSION_ID = "session_id"
        private const val NOTIFICATION_ID = 41001
    }
}
