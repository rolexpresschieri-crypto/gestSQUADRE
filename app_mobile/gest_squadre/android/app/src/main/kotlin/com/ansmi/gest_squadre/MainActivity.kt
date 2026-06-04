package com.ansmi.gest_squadre

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java) ?: return

            val infoCh = NotificationChannel(
                "gest_squadre_alerts",
                "gestSQUADRE avvisi",
                NotificationManager.IMPORTANCE_DEFAULT,
            )
            infoCh.description = "Avvisi informativi"
            nm.createNotificationChannel(infoCh)

            // Stesso mp3 di AllarmeApp (res/raw/siren.mp3) — nome risorsa "siren" in FCM.
            val alarmAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val soundUri =
                Uri.parse("android.resource://$packageName/${R.raw.siren}")
            val alarmCh = NotificationChannel(
                "gest_squadre_toc_alarm_v2",
                "Allarme TOC (sirena)",
                NotificationManager.IMPORTANCE_HIGH,
            )
            alarmCh.description = "Push allarme dal TOC con sirena AllarmeApp"
            alarmCh.setSound(soundUri, alarmAttrs)
            alarmCh.enableVibration(true)
            alarmCh.enableLights(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                alarmCh.setBypassDnd(true)
            }
            nm.createNotificationChannel(alarmCh)
        }
    }
}
