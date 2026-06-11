package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.model.EventInfo
import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.ansmi.gestsquadre.shared.model.SquadSession
import com.ansmi.gestsquadre.shared.network.AlarmInsertBody
import com.ansmi.gestsquadre.shared.network.EventRow
import com.ansmi.gestsquadre.shared.network.FcmTokenUpsertBody
import com.ansmi.gestsquadre.shared.network.LogoutPatchBody
import com.ansmi.gestsquadre.shared.network.PositionPatchBody
import com.ansmi.gestsquadre.shared.network.SessionInsertBody
import com.ansmi.gestsquadre.shared.network.SessionOnlineRow
import com.ansmi.gestsquadre.shared.network.SessionRestoreRow
import com.ansmi.gestsquadre.shared.network.SessionInsertRow
import com.ansmi.gestsquadre.shared.network.SquadRow
import com.ansmi.gestsquadre.shared.network.SupabaseRestClient
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json

/**
 * Logica condivisa portata da [gest_api.dart] (Flutter 1.0.12 operativa).
 */
class GestSquadreRepository(
    config: GestSquadreConfig,
) {
    private val rest = SupabaseRestClient(config)
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun loadActiveEvent(): EventInfo? {
        val row =
            rest.getMaybeSingle(
                table = "events",
                select = "id,title",
                filters = listOf("is_active" to "true"),
            ) { body ->
                json.decodeFromString<EventRow>(body)
            } ?: return null

        return EventInfo(id = row.id, title = row.title)
    }

    suspend fun loginSquad(
        eventId: String,
        squadCode: String,
        password: String,
    ): SquadSession {
        val normalizedCode = squadCode.trim().uppercase()
        val squad =
            rest.getMaybeSingle(
                table = "squads",
                select = "id,squad_code,squad_name,password_hash,is_enabled",
                filters = listOf(
                    "squad_code" to normalizedCode,
                    "is_enabled" to "true",
                ),
            ) { body ->
                json.decodeFromString<SquadRow>(body)
            } ?: throw GestSquadreException("Squadra non trovata o non abilitata.")

        if (squad.passwordHash != password.trim()) {
            throw GestSquadreException("Password squadra non valida.")
        }

        val now = nowIso()

        rest.patch(
            table = "squad_sessions",
            filters = listOf(
                "event_id" to eventId,
                "squad_id" to squad.id,
                "is_online" to "true",
            ),
            body = LogoutPatchBody(isOnline = false, logoutAt = now),
        )

        val inserted =
            rest.insertReturning(
                table = "squad_sessions",
                body =
                    SessionInsertBody(
                        eventId = eventId,
                        squadId = squad.id,
                        isOnline = true,
                        loginAt = now,
                    ),
            ) { body ->
                json.decodeFromString<SessionInsertRow>(body)
            }

        return SquadSession(
            sessionId = inserted.id,
            eventId = inserted.eventId,
            squadId = inserted.squadId,
            squadCode = squad.squadCode.uppercase(),
            squadName = squad.squadName,
            loginAt = Instant.parse(inserted.loginAt),
        )
    }

    suspend fun restoreOnlineSession(sessionId: String): SquadSession? {
        val row =
            rest.getMaybeSingle(
                table = "squad_sessions",
                select = "id,is_online,event_id,squad_id,login_at,squads(squad_code,squad_name)",
                filters = listOf("id" to sessionId),
            ) { body ->
                json.decodeFromString<SessionRestoreRow>(body)
            } ?: return null

        if (!row.isOnline) {
            return null
        }

        return SquadSession(
            sessionId = row.id,
            eventId = row.eventId,
            squadId = row.squadId,
            squadCode = row.squads.squadCode.uppercase(),
            squadName = row.squads.squadName,
            loginAt = Instant.parse(row.loginAt),
        )
    }

    suspend fun isSessionOnline(sessionId: String): Boolean {
        val row =
            rest.getMaybeSingle(
                table = "squad_sessions",
                select = "id,is_online",
                filters = listOf("id" to sessionId),
            ) { body ->
                json.decodeFromString<SessionOnlineRow>(body)
            } ?: return false
        return row.isOnline
    }

    suspend fun logoutSquad(sessionId: String) {
        val now = nowIso()
        rest.patch(
            table = "squad_sessions",
            filters = listOf("id" to sessionId),
            body = LogoutPatchBody(isOnline = false, logoutAt = now),
        )
    }

    suspend fun updatePosition(
        sessionId: String,
        position: GpsPosition,
    ) {
        rest.patch(
            table = "squad_sessions",
            filters = listOf("id" to sessionId),
            body =
                PositionPatchBody(
                    lastLatitude = position.latitude,
                    lastLongitude = position.longitude,
                    lastAccuracy = position.accuracyMeters,
                    lastFixAt = nowIso(),
                ),
        )
    }

    suspend fun registerFcmToken(
        sessionId: String,
        squadId: String,
        token: String,
    ) {
        rest.upsert(
            table = "squad_fcm_tokens",
            onConflict = "session_id",
            body =
                FcmTokenUpsertBody(
                    sessionId = sessionId,
                    squadId = squadId,
                    fcmToken = token,
                    updatedAt = nowIso(),
                ),
        )
    }

    suspend fun sendAlarm(session: SquadSession) {
        rest.insert(
            table = "squad_alarms",
            body =
                AlarmInsertBody(
                    eventId = session.eventId,
                    sessionId = session.sessionId,
                    squadId = session.squadId,
                    squadCode = session.squadCode,
                    squadName = session.squadName,
                    message = SQUAD_ALARM_BACKEND_LABEL,
                ),
        )
    }

    private fun nowIso(): String = Clock.System.now().toString()

    companion object {
        const val SQUAD_ALARM_BACKEND_LABEL = "ALLARME"
    }
}
