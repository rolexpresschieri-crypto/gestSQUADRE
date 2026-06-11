package com.ansmi.gestsquadre.shared.model

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class EventInfo(
    val id: String,
    val title: String,
)

data class SquadSession(
    val sessionId: String,
    val eventId: String,
    val squadId: String,
    val squadCode: String,
    val squadName: String,
    val loginAt: Instant,
)

data class GpsPosition(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Double?,
)
