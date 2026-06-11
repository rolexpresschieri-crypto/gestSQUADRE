package com.ansmi.gestsquadre.kmp.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ansmi.gestsquadre.kmp.BuildConfig
import com.ansmi.gestsquadre.kmp.R
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.GestSquadreException
import com.ansmi.gestsquadre.shared.model.SquadSession
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await

class FcmManager(
    private val context: Context,
) {
    val isConfigured: Boolean
        get() =
            BuildConfig.FIREBASE_PROJECT_ID.isNotBlank() &&
                BuildConfig.FIREBASE_ANDROID_APP_ID.isNotBlank() &&
                BuildConfig.FIREBASE_ANDROID_API_KEY.isNotBlank() &&
                FirebaseApp.getApps(context).isNotEmpty()

    suspend fun ensureNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    suspend fun registerToken(
        facade: GestSquadreFacade,
        session: SquadSession,
    ): String? {
        if (!isConfigured) {
            return "Push TOC disabilitata: configura FIREBASE_* in dart-defines.json."
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !ensureNotificationPermission()
        ) {
            return "Consenti le notifiche, poi logout/login."
        }

        var lastError: String? = null
        repeat(3) { attempt ->
            val token =
                runCatching { FirebaseMessaging.getInstance().token.await() }
                    .fold(
                        onSuccess = { it },
                        onFailure = { error ->
                            lastError = error.message ?: "Errore token Firebase."
                            null
                        },
                    )

            if (!token.isNullOrBlank()) {
                return try {
                    facade.registerFcmToken(
                        sessionId = session.sessionId,
                        squadId = session.squadId,
                        token = token,
                    )
                    null
                } catch (e: GestSquadreException) {
                    e.message ?: "Errore salvataggio token push su Supabase."
                } catch (e: Exception) {
                    e.message ?: "Errore salvataggio token push su Supabase."
                }
            }

            if (attempt < 2) {
                delay(2_000L)
            }
        }

        return lastError
            ?: "Token push non ottenuto: verifica Firebase (app KMP) e notifiche, poi logout/login."
    }

    fun showLocalNotification(
        title: String,
        body: String,
        isAlarm: Boolean,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val channelId = if (isAlarm) CHANNEL_ALARM else CHANNEL_INFO
        val notification =
            NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(
                    if (isAlarm) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH,
                )
                .setAutoCancel(true)
                .build()

        NotificationManagerCompat.from(context)
            .notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    companion object {
        const val CHANNEL_INFO = "gest_squadre_alerts"
        const val CHANNEL_ALARM = "gest_squadre_toc_alarm_v2"

        fun createNotificationChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                return
            }
            val nm = context.getSystemService(NotificationManager::class.java) ?: return

            val info =
                NotificationChannel(
                    CHANNEL_INFO,
                    "gestSQUADRE avvisi",
                    NotificationManager.IMPORTANCE_HIGH,
                )
            nm.createNotificationChannel(info)

            val alarm =
                NotificationChannel(
                    CHANNEL_ALARM,
                    "Allarme TOC (sirena)",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Push allarme dal TOC"
                    enableVibration(true)
                }
            nm.createNotificationChannel(alarm)
        }
    }
}
