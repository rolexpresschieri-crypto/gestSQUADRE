package com.ansmi.gestsquadre.kmp.data

import android.content.Context
import com.ansmi.gestsquadre.shared.model.SquadSession
import kotlinx.datetime.Instant

/**
 * Stesso formato di [gest_squadre_session_json] nell'app Flutter 1.0.12.
 */
class SessionStorage(
    context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(session: SquadSession?) {
        if (session == null) {
            prefs.edit().remove(KEY).apply()
            return
        }
        prefs.edit()
            .putString(
                KEY,
                listOf(
                    session.sessionId,
                    session.eventId,
                    session.squadId,
                    session.squadCode,
                    session.squadName,
                    session.loginAt.toString(),
                ).joinToString("|"),
            ).apply()
    }

    fun loadSessionId(): String? {
        val raw = prefs.getString(KEY, null) ?: return null
        val sessionId = raw.split("|").firstOrNull()?.trim().orEmpty()
        return sessionId.ifEmpty { null }
    }

    fun loadCached(): SquadSession? {
        val raw = prefs.getString(KEY, null) ?: return null
        val parts = raw.split("|")
        if (parts.size < 6) {
            return null
        }
        return try {
            SquadSession(
                sessionId = parts[0],
                eventId = parts[1],
                squadId = parts[2],
                squadCode = parts[3],
                squadName = parts[4],
                loginAt = Instant.parse(parts[5]),
            )
        } catch (_: Exception) {
            null
        }
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    /** Una tantum: dopo aggiornamento con log auth, forza nuovo login. */
    fun isAuthLogMigrationDone(): Boolean =
        prefs.getBoolean(KEY_AUTH_LOG_MIGRATION, false)

    fun setAuthLogMigrationDone() {
        prefs.edit().putBoolean(KEY_AUTH_LOG_MIGRATION, true).apply()
    }

    companion object {
        const val PREFS_NAME = "gest_squadre_prefs"
        const val KEY = "gest_squadre_session_json"
        private const val KEY_AUTH_LOG_MIGRATION = "kmp_auth_log_migration_v1"
    }
}
