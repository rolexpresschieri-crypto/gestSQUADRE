package com.ansmi.gestsquadre.shared.map

import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import kotlin.math.roundToInt

/** Firme per evitare refresh mappa inutili (stesso concetto di liveSquadsPollSig sul TOC web). */
object TocMapSnapshotSignature {
    fun squadsPositionSig(squads: List<LiveSquadPin>): String =
        squads
            .sortedBy { it.sessionId }
            .joinToString("|") { squad ->
                val acc = squad.accuracyM?.roundToInt()?.toString().orEmpty()
                "${squad.sessionId}:${squad.latitude},${squad.longitude}:$acc"
            }

    fun squadsVisualSig(
        squads: List<LiveSquadPin>,
        alarmingSessionIds: Set<String>,
        focusSessionId: String?,
    ): String =
        squads
            .sortedBy { it.sessionId }
            .joinToString("|") { squad ->
                val alarming = alarmingSessionIds.contains(squad.sessionId)
                val isSelf = focusSessionId != null && squad.sessionId == focusSessionId
                "${squad.sessionId}:${squad.mapIconKey}:${squad.mapColorArgb}:$alarming:$isSelf:${squad.squadCode}"
            }

    fun waypointsSig(waypoints: List<MapWaypointPin>): String =
        waypoints
            .sortedBy { it.id }
            .joinToString("|") { wp ->
                "${wp.id}:${wp.latitude},${wp.longitude}:${wp.iconKey}:${wp.displayName}"
            }

    fun routeSig(route: ActiveRouteAssignment?): String {
        if (route == null) {
            return ""
        }
        val points =
            route.points.joinToString(";") { (lat, lng) ->
                "${lat.roundToInt()},${lng.roundToInt()}"
            }
        return "${route.routeCode}:${route.colorArgb}:$points:${route.targetLabel.orEmpty()}"
    }

    fun alarmingSig(alarmingSessionIds: Set<String>): String =
        alarmingSessionIds.sorted().joinToString(",")
}
