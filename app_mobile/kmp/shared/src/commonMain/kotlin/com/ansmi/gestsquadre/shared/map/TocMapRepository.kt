package com.ansmi.gestsquadre.shared.map

import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.model.ActiveSquadSummaryRow
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import com.ansmi.gestsquadre.shared.model.MapWaypointRow
import com.ansmi.gestsquadre.shared.model.SquadAlarmSessionRow
import com.ansmi.gestsquadre.shared.model.toLiveSquadPin
import com.ansmi.gestsquadre.shared.model.toMapWaypointPin
import com.ansmi.gestsquadre.shared.network.SupabaseRestClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class EventIdRow(
    val id: String,
)

class TocMapRepository(
    config: GestSquadreConfig,
) {
    private val rest = SupabaseRestClient(config)
    private val json = Json { ignoreUnknownKeys = true }

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
}
