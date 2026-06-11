package com.ansmi.gestsquadre.kmp

import android.app.Application
import com.ansmi.gestsquadre.kmp.push.FcmManager
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class GestSquadreApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FcmManager.createNotificationChannels(this)
        initFirebaseIfConfigured()
    }

    private fun initFirebaseIfConfigured() {
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            return
        }
        val projectId = BuildConfig.FIREBASE_PROJECT_ID
        val appId = BuildConfig.FIREBASE_ANDROID_APP_ID
        val apiKey = BuildConfig.FIREBASE_ANDROID_API_KEY
        val senderId = BuildConfig.FIREBASE_MESSAGING_SENDER_ID
        if (projectId.isBlank() || appId.isBlank() || apiKey.isBlank() || senderId.isBlank()) {
            return
        }
        val bucket =
            BuildConfig.FIREBASE_STORAGE_BUCKET.ifBlank {
                "$projectId.firebasestorage.app"
            }
        FirebaseApp.initializeApp(
            this,
            FirebaseOptions.Builder()
                .setProjectId(projectId)
                .setApplicationId(appId)
                .setApiKey(apiKey)
                .setGcmSenderId(senderId)
                .setStorageBucket(bucket)
                .build(),
        )
    }
}
