package com.ansmi.gestsquadre.shared

import com.ansmi.gestsquadre.shared.model.EventInfo
import com.ansmi.gestsquadre.shared.model.GpsPosition
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequest
import com.ansmi.gestsquadre.shared.model.SquadSession
import com.ansmi.gestsquadre.shared.network.AlarmInsertBody
import com.ansmi.gestsquadre.shared.network.EventRow
import com.ansmi.gestsquadre.shared.network.FcmTokenUpsertBody
import com.ansmi.gestsquadre.shared.network.LogoutPatchBody
import com.ansmi.gestsquadre.shared.network.MobileDismissInsertBody
import com.ansmi.gestsquadre.shared.network.MobileDismissedAtPatch
import com.ansmi.gestsquadre.shared.network.PositionPatchBody
import com.ansmi.gestsquadre.shared.network.TocPushClosedRow
import com.ansmi.gestsquadre.shared.network.TocPushIdRow
import com.ansmi.gestsquadre.shared.network.SessionAuthLogInsertBody
import com.ansmi.gestsquadre.shared.network.SessionInsertBody
import com.ansmi.gestsquadre.shared.network.SessionInsertRow
import com.ansmi.gestsquadre.shared.network.SessionOnlineRow
import com.ansmi.gestsquadre.shared.network.SessionRestoreRow
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

        if (hasActiveSession(eventId = eventId, squadId = squad.id)) {
            throw GestSquadreException(GestSquadreMessages.SQUAD_ALREADY_ACTIVE)
        }

        val now = nowIso()

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

        val session =
            SquadSession(
                sessionId = inserted.id,
                eventId = inserted.eventId,
                squadId = inserted.squadId,
                squadCode = squad.squadCode.uppercase(),
                squadName = squad.squadName,
                loginAt = Instant.parse(inserted.loginAt),
            )
        insertSessionAuthLog(session, ACTION_LOGIN)
        return session
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

    suspend fun logoutSquad(session: SquadSession) {
        val now = nowIso()
        rest.patch(
            table = "squad_sessions",
            filters = listOf("id" to session.sessionId),
            body = LogoutPatchBody(isOnline = false, logoutAt = now),
        )
        insertSessionAuthLog(session, ACTION_LOGOUT)
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

    suspend fun dismissTocNotification(
        session: SquadSession,
        panelMessage: String?,
    ) {
        val message = panelMessage?.trim()?.takeIf { it.isNotEmpty() }
        rest.insert(
            table = "squad_mobile_dismiss_logs",
            body =
                MobileDismissInsertBody(
                    eventId = session.eventId,
                    sessionId = session.sessionId,
                    squadId = session.squadId,
                    squadCode = session.squadCode,
                    squadName = session.squadName,
                    panelMessage = message,
                ),
        )
        val latest =
            rest.getList<TocPushIdRow>(
                table = "toc_push_logs",
                select = "id",
                eqFilters = listOf("session_id" to session.sessionId),
                isNullColumns = listOf("mobile_dismissed_at"),
                order = "created_at.desc",
                limit = 1,
            ).firstOrNull()
        if (latest != null) {
            rest.patch(
                table = "toc_push_logs",
                filters = listOf("id" to latest.id),
                body = MobileDismissedAtPatch(mobileDismissedAt = nowIso()),
            )
        }
        rest.patch(
            table = "alarm_auto_notify_logs",
            filters =
                listOf(
                    "recipient_session_id" to session.sessionId,
                    "status" to "sent",
                ),
            isNullColumns = listOf("mobile_dismissed_at"),
            body = MobileDismissedAtPatch(mobileDismissedAt = nowIso()),
        )
    }

    suspend fun isTocPanelClosedByToc(sessionId: String): Boolean {
        val row =
            rest.getList<TocPushClosedRow>(
                table = "toc_push_logs",
                select = "closed_at",
                eqFilters = listOf("session_id" to sessionId),
                order = "created_at.desc",
                limit = 1,
            ).firstOrNull() ?: return false
        return !row.closedAt.isNullOrBlank()
    }

    suspend fun sendAlarm(
        session: SquadSession,
        request: SquadAlarmRequest,
    ) {
        request.validate()?.let { throw GestSquadreException(it) }
        val detail = request.toLogMessage()
        rest.insert(
            table = "squad_alarms",
            body =
                AlarmInsertBody(
                    eventId = session.eventId,
                    sessionId = session.sessionId,
                    squadId = session.squadId,
                    squadCode = session.squadCode,
                    squadName = session.squadName,
                    message = "${SQUAD_ALARM_BACKEND_LABEL} — $detail",
                    requestTypes = request.typeCodes(),
                    otherDetail = request.otherDetail?.trim()?.takeIf { it.isNotEmpty() },
                ),
        )
    }

    private suspend fun insertSessionAuthLog(
        session: SquadSession,
        action: String,
    ) {
        insertSessionAuthLog(
            eventId = session.eventId,
            sessionId = session.sessionId,
            squadId = session.squadId,
            squadCode = session.squadCode,
            squadName = session.squadName,
            action = action,
        )
    }

    private suspend fun insertSessionAuthLog(
        eventId: String,
        sessionId: String,
        squadId: String,
        squadCode: String,
        squadName: String,
        action: String,
    ) {
        rest.insert(
            table = "squad_session_auth_logs",
            body =
                SessionAuthLogInsertBody(
                    eventId = eventId,
                    sessionId = sessionId,
                    squadId = squadId,
                    squadCode = squadCode,
                    squadName = squadName,
                    action = action,
                ),
        )
    }

    private suspend fun hasActiveSession(
        eventId: String,
        squadId: String,
    ): Boolean {
        val rows =
            rest.getList<SessionOnlineRow>(
                table = "squad_sessions",
                select = "id,is_online",
                eqFilters =
                    listOf(
                        "event_id" to eventId,
                        "squad_id" to squadId,
                        "is_online" to "true",
                    ),
                limit = 1,
            )
        return rows.isNotEmpty()
    }

    private fun nowIso(): String = Clock.System.now().toString()

    companion object {
        const val SQUAD_ALARM_BACKEND_LABEL = "ALLARME"
        private const val ACTION_LOGIN = "login"
        private const val ACTION_LOGOUT = "logout"
    }
}
