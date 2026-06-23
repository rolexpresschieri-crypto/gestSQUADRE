package com.ansmi.gestsquadre.kmp.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import com.ansmi.gestsquadre.shared.NetworkErrorMessages
import com.ansmi.gestsquadre.shared.model.SquadSession
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await

private fun Throwable.rootCause(): Throwable =
    generateSequence(this) { it.cause }.last()

fun formatFcmRegistrationError(error: Throwable): String {
    val root = error.rootCause()
    val msg = (root.message ?: error.message ?: error.toString()).trim()
    return when {
        msg.contains("SERVICE_NOT_AVAILABLE", ignoreCase = true) ->
            "Servizio Google non disponibile: aggiorna «Google Play Services», " +
                "verifica rete (Wi‑Fi o dati), riavvia il telefono e tocca «Ripara push TOC»."
        msg.contains("TOO_MANY_REGISTRATIONS", ignoreCase = true) ->
            "Troppi tentativi push: attendi qualche minuto, poi «Ripara push TOC»."
        msg.contains("MISSING_INSTANCEID_SERVICE", ignoreCase = true) ->
            "Google Play Services mancante o disattivato su questo telefono."
        msg.contains("Unable to resolve host", ignoreCase = true) ||
            msg.contains("No address associated with hostname", ignoreCase = true) ->
            NetworkErrorMessages.format(msg)
        else -> NetworkErrorMessages.format(msg.ifEmpty { "Errore registrazione push." })
    }
}

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

    suspend fun fetchFcmToken(): String? {
        if (!isConfigured) {
            return null
        }
        return runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
    }

    suspend fun registerToken(
        facade: GestSquadreFacade,
        session: SquadSession,
    ): String? {
        if (!isConfigured) {
            return "Push TOC disabilitata: configura FIREBASE_* in dart-defines.json."
        }

        val notificationsMissing =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                !ensureNotificationPermission()

        var lastError: String? = null
        val maxAttempts = 5
        repeat(maxAttempts) { attempt ->
            val token =
                runCatching { FirebaseMessaging.getInstance().token.await() }
                    .fold(
                        onSuccess = { it },
                        onFailure = { error ->
                            lastError = formatFcmRegistrationError(error)
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
                    if (notificationsMissing) {
                        "Push registrata sul server. Abilita le notifiche in Impostazioni → gestSQUADRE."
                    } else {
                        null
                    }
                } catch (e: GestSquadreException) {
                    NetworkErrorMessages.format(e.message ?: "Errore salvataggio token push su Supabase.")
                } catch (e: Exception) {
                    NetworkErrorMessages.format(e)
                }
            }

            if (attempt < maxAttempts - 1) {
                val waitMs =
                    if (lastError?.contains("Google Play Services", ignoreCase = true) == true ||
                        lastError?.contains("Servizio Google", ignoreCase = true) == true
                    ) {
                        4_000L * (attempt + 1)
                    } else {
                        2_000L
                    }
                delay(waitMs)
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
        val launchIntent = TocPushIntentHandler.buildLaunchIntent(context, title, body)
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentIntent =
            PendingIntent.getActivity(
                context,
                (title.hashCode() xor body.hashCode()),
                launchIntent,
                pendingFlags,
            )
        val notification =
            NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(contentIntent)
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
