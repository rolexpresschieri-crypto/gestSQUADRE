package com.ansmi.gestsquadre.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ActiveSquadSummaryRow(
    @SerialName("session_id") val sessionId: String,
    @SerialName("squad_code") val squadCode: String,
    @SerialName("squad_name") val squadName: String,
    @SerialName("last_latitude") val lastLatitude: Double? = null,
    @SerialName("last_longitude") val lastLongitude: Double? = null,
    @SerialName("map_color") val mapColor: String? = null,
    @SerialName("last_accuracy") val lastAccuracy: Double? = null,
)

@Serializable
data class SquadAlarmSessionRow(
    @SerialName("session_id") val sessionId: String,
)

@Serializable
data class MapWaypointRow(
    val id: String,
    val label: String? = null,
    @SerialName("icon_key") val iconKey: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class LiveSquadPin(
    val sessionId: String,
    val squadCode: String,
    val squadName: String,
    val latitude: Double,
    val longitude: Double,
    val mapColorArgb: Long,
    val accuracyM: Double?,
)

data class MapWaypointPin(
    val id: String,
    val label: String,
    val iconKey: String,
    val latitude: Double,
    val longitude: Double,
) {
    val displayName: String
        get() = label.trim().ifEmpty { "Buca" }
}

fun ActiveSquadSummaryRow.toLiveSquadPin(): LiveSquadPin? {
    val lat = lastLatitude ?: return null
    val lon = lastLongitude ?: return null
    if (!lat.isFinite() || !lon.isFinite()) {
        return null
    }
    return LiveSquadPin(
        sessionId = sessionId,
        squadCode = squadCode.uppercase(),
        squadName = squadName,
        latitude = lat,
        longitude = lon,
        mapColorArgb = parseMapColorArgb(mapColor),
        accuracyM = lastAccuracy,
    )
}

fun MapWaypointRow.toMapWaypointPin(): MapWaypointPin? {
    val lat = latitude ?: return null
    val lon = longitude ?: return null
    if (!lat.isFinite() || !lon.isFinite()) {
        return null
    }
    return MapWaypointPin(
        id = id,
        label = label.orEmpty(),
        iconKey = iconKey?.trim()?.ifEmpty { "buche" } ?: "buche",
        latitude = lat,
        longitude = lon,
    )
}

@Serializable
data class MapRoutePointRow(
    val lat: Double,
    val lng: Double,
)

@Serializable
data class MapRouteRow(
    val id: String,
    @SerialName("route_code") val routeCode: String,
    @SerialName("route_name") val routeName: String? = null,
    @SerialName("color_hex") val colorHex: String? = null,
    val points: List<MapRoutePointRow> = emptyList(),
)

@Serializable
data class RouteAssignmentRow(
    val id: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("route_id") val routeId: String,
    @SerialName("target_waypoint_id") val targetWaypointId: String? = null,
)

data class MapRoutePin(
    val id: String,
    val routeCode: String,
    val routeName: String,
    val colorArgb: Long,
    val points: List<Pair<Double, Double>>,
)

data class ActiveRouteAssignment(
    val routeCode: String,
    val routeName: String,
    val colorArgb: Long,
    val points: List<Pair<Double, Double>>,
    val targetLabel: String? = null,
)

fun MapRouteRow.toMapRoutePin(): MapRoutePin? {
    val coords =
        points.mapNotNull { p ->
            if (p.lat.isFinite() && p.lng.isFinite()) p.lat to p.lng else null
        }
    if (coords.size < 2) {
        return null
    }
    return MapRoutePin(
        id = id,
        routeCode = routeCode,
        routeName = routeName?.trim().orEmpty().ifEmpty { routeCode },
        colorArgb = parseMapColorArgb(colorHex),
        points = coords,
    )
}

fun parseMapColorArgb(raw: String?): Long {
    val value = raw?.trim().orEmpty()
    if (value.length == 7 && value.startsWith("#")) {
        val hex = value.substring(1).toLongOrNull(16)
        if (hex != null) {
            return 0xFF000000L or hex
        }
    }
    return 0xFF079B42L
}
