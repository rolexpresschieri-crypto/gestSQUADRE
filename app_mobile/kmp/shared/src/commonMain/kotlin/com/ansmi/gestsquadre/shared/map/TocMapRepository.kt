package com.ansmi.gestsquadre.shared.map

import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
import com.ansmi.gestsquadre.shared.model.ActiveSquadSummaryRow
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapRouteRow
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import com.ansmi.gestsquadre.shared.model.MapWaypointRow
import com.ansmi.gestsquadre.shared.model.RouteAssignmentRow
import com.ansmi.gestsquadre.shared.model.SquadAlarmSessionRow
import com.ansmi.gestsquadre.shared.model.toLiveSquadPin
import com.ansmi.gestsquadre.shared.model.toMapRoutePin
import com.ansmi.gestsquadre.shared.model.toMapWaypointPin
import com.ansmi.gestsquadre.shared.network.SupabaseRestClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class EventIdRow(
    val id: String,
)

@Serializable
private data class WaypointLabelRow(
    val label: String? = null,
)

class TocMapRepository(
    config: GestSquadreConfig,
) {
    private val rest = SupabaseRestClient(config)
    private val json =
        Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            explicitNulls = false
        }

    suspend fun loadLiveSquads(): List<LiveSquadPin> {
        val rows =
            rest.getList<ActiveSquadSummaryRow>(
                table = "active_squad_summaries",
                select = "*",
                order = "squad_code.asc",
            )
        return rows.mapNotNull { it.toLiveSquadPin() }
    }

    suspend fun loadAlarmingSessionIds(): Set<String> {
        val rows =
            rest.getList<SquadAlarmSessionRow>(
                table = "squad_alarms",
                select = "session_id",
                isNullColumns = listOf("acknowledged_at"),
            )
        return rows.map { it.sessionId }.toSet()
    }

    suspend fun loadWaypoints(): List<MapWaypointPin> {
        val event =
            rest.getMaybeSingle(
                table = "events",
                select = "id",
                filters = listOf("is_active" to "true"),
            ) { body ->
                json.decodeFromString<EventIdRow>(body)
            } ?: return emptyList()

        val rows =
            rest.getList<MapWaypointRow>(
                table = "squad_map_points",
                select = "id,label,icon_key,latitude,longitude",
                eqFilters = listOf("event_id" to event.id),
                limit = 400,
            )
        return rows.mapNotNull { it.toMapWaypointPin() }
    }

    suspend fun loadActiveRouteAssignment(sessionId: String): ActiveRouteAssignment? {
        return runCatching { loadActiveRouteAssignmentInternal(sessionId) }.getOrNull()
    }

    private suspend fun loadActiveRouteAssignmentInternal(
        sessionId: String,
    ): ActiveRouteAssignment? {
        val assignment =
            rest.getList<RouteAssignmentRow>(
                table = "squad_route_assignments",
                select = "id,session_id,route_id,target_waypoint_id",
                eqFilters = listOf("session_id" to sessionId),
                isNullColumns = listOf("cleared_at"),
                limit = 1,
            ).firstOrNull() ?: return null

        val route =
            rest.getList<MapRouteRow>(
                table = "map_routes",
                select = "id,route_code,route_name,color_hex,points",
                eqFilters = listOf("id" to assignment.routeId),
                limit = 1,
            ).firstOrNull()?.toMapRoutePin() ?: return null

        var targetLabel: String? = null
        val targetId = assignment.targetWaypointId
        if (!targetId.isNullOrBlank()) {
            val wp =
                rest.getList<WaypointLabelRow>(
                    table = "squad_map_points",
                    select = "label",
                    eqFilters = listOf("id" to targetId),
                    limit = 1,
                ).firstOrNull()
            targetLabel = wp?.label
        }

        return ActiveRouteAssignment(
            routeCode = route.routeCode,
            routeName = route.routeName,
            colorArgb = route.colorArgb,
            points = route.points,
            targetLabel = targetLabel,
        )
    }
}
