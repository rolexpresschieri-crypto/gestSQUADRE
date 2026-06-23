package com.ansmi.gestsquadre.shared.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class EventRow(
    val id: String,
    val title: String,
)

@Serializable
internal data class SquadRow(
    val id: String,
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
    @SerialName("password_hash") val passwordHash: String,
    @SerialName("is_enabled") val isEnabled: Boolean = true,
)

@Serializable
internal data class SessionRestoreRow(
    val id: String,
    @SerialName("is_online") val isOnline: Boolean,
    @SerialName("event_id") val eventId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("login_at") val loginAt: String,
    val squads: SquadCodeNameRow,
)

@Serializable
internal data class SquadCodeNameRow(
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
)

@Serializable
internal data class SessionOnlineRow(
    val id: String,
    @SerialName("is_online") val isOnline: Boolean,
)

@Serializable
internal data class SessionInsertRow(
    val id: String,
    @SerialName("event_id") val eventId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("login_at") val loginAt: String,
)

@Serializable
internal data class SessionInsertBody(
    @SerialName("event_id") val eventId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("is_online") val isOnline: Boolean,
    @SerialName("login_at") val loginAt: String,
)

@Serializable
internal data class LogoutPatchBody(
    @SerialName("is_online") val isOnline: Boolean,
    @SerialName("logout_at") val logoutAt: String,
)

@Serializable
internal data class PositionPatchBody(
    @SerialName("last_latitude") val lastLatitude: Double,
    @SerialName("last_longitude") val lastLongitude: Double,
    @SerialName("last_accuracy") val lastAccuracy: Double?,
    @SerialName("last_fix_at") val lastFixAt: String,
)

@Serializable
internal data class FcmTokenUpsertBody(
    @SerialName("session_id") val sessionId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("fcm_token") val fcmToken: String,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
internal data class MobileDismissInsertBody(
    @SerialName("event_id") val eventId: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
    @SerialName("panel_message") val panelMessage: String? = null,
)

@Serializable
internal data class TocPushIdRow(
    val id: String,
)

@Serializable
internal data class TocPushClosedRow(
    @SerialName("closed_at") val closedAt: String? = null,
)

@Serializable
internal data class TocPushPanelRow(
    val title: String? = null,
    val body: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
internal data class AutoNotifyPanelRow(
    @SerialName("push_title") val pushTitle: String? = null,
    @SerialName("push_body") val pushBody: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
internal data class MobileDismissedAtPatch(
    @SerialName("mobile_dismissed_at") val mobileDismissedAt: String,
)

@Serializable
internal data class AlarmInsertBody(
    @SerialName("event_id") val eventId: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
    val message: String,
    @SerialName("request_types") val requestTypes: List<String> = emptyList(),
    @SerialName("other_detail") val otherDetail: String? = null,
)

@Serializable
internal data class SessionLogoutRow(
    val id: String,
    @SerialName("event_id") val eventId: String,
    @SerialName("squad_id") val squadId: String,
    val squads: SquadCodeNameRow,
)

@Serializable
internal data class SessionAuthLogInsertBody(
    @SerialName("event_id") val eventId: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("squad_id") val squadId: String,
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
    val action: String,
)
