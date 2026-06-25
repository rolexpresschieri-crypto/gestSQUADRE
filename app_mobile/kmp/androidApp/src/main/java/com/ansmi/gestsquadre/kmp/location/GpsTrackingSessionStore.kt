package com.ansmi.gestsquadre.kmp.location

import android.content.Context

private const val PREFS = "gest_squadre_gps_tracking"
private const val KEY_SESSION_ID = "session_id"

object GpsTrackingSessionStore {
    fun save(
        context: Context,
        sessionId: String,
    ) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SESSION_ID, sessionId)
            .apply()
    }

    fun load(context: Context): String? =
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SESSION_ID, null)
            ?.takeIf { it.isNotBlank() }

    fun clear(context: Context) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SESSION_ID)
            .apply()
    }
}
