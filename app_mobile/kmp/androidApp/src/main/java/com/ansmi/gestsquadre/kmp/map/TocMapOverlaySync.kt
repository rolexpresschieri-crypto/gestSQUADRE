package com.ansmi.gestsquadre.kmp.map

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.ansmi.gestsquadre.shared.model.ActiveRouteAssignment
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline

internal class TocMapOverlaySync(
    private val context: Context,
) {
    private val squadMarkers = mutableMapOf<String, Marker>()
    private val waypointMarkers = mutableMapOf<String, Marker>()
    private val accuracyPolygons = mutableMapOf<String, Polygon>()
    private val accuracyFingerprints = mutableMapOf<String, String>()
    private val squadVisualFingerprints = mutableMapOf<String, String>()
    private val waypointFingerprints = mutableMapOf<String, String>()
    private var routePolyline: Polyline? = null
    private var routeFingerprint: String? = null

    fun sync(
        map: MapView,
        squads: List<LiveSquadPin>,
        waypoints: List<MapWaypointPin>,
        alarmingSessionIds: Set<String>,
        focusSessionId: String?,
        activeRoute: ActiveRouteAssignment?,
    ) {
        val overlays = map.overlays

        val waypointIds = waypoints.map { it.id }.toSet()
        waypointMarkers.keys.filter { it !in waypointIds }.toList().forEach { id ->
            waypointMarkers.remove(id)?.let { overlays.remove(it) }
            waypointFingerprints.remove(id)
        }
        for (waypoint in waypoints) {
            val fingerprint = waypointFingerprint(waypoint)
            val marker =
                waypointMarkers[waypoint.id] ?: Marker(map).also { created ->
                    created.position = GeoPoint(waypoint.latitude, waypoint.longitude)
                    MapMarkerFactory.applyMarkerIcon(
                        context,
                        created,
                        MapMarkerFactory.waypointMarker(context, waypoint),
                    )
                    waypointMarkers[waypoint.id] = created
                    overlays.add(created)
                }
            val moved =
                marker.position.latitude != waypoint.latitude ||
                    marker.position.longitude != waypoint.longitude
            if (moved) {
                marker.position = GeoPoint(waypoint.latitude, waypoint.longitude)
            }
            if (waypointFingerprints[waypoint.id] != fingerprint) {
                MapMarkerFactory.applyMarkerIcon(
                    context,
                    marker,
                    MapMarkerFactory.waypointMarker(context, waypoint),
                )
                waypointFingerprints[waypoint.id] = fingerprint
            }
        }

        val squadIds = squads.map { it.sessionId }.toSet()
        squadMarkers.keys.filter { it !in squadIds }.toList().forEach { id ->
            squadMarkers.remove(id)?.let { overlays.remove(it) }
            accuracyPolygons.remove(id)?.let { overlays.remove(it) }
            squadVisualFingerprints.remove(id)
            accuracyFingerprints.remove(id)
        }

        for (squad in squads) {
            val alarming = alarmingSessionIds.contains(squad.sessionId)
            val isSelf = focusSessionId != null && squad.sessionId == focusSessionId
            val visualFingerprint = squadVisualFingerprint(squad, alarming, isSelf)

            val marker =
                squadMarkers[squad.sessionId] ?: Marker(map).also { created ->
                    created.position = GeoPoint(squad.latitude, squad.longitude)
                    MapMarkerFactory.applyMarkerIcon(
                        context,
                        created,
                        MapMarkerFactory.squadMarker(context, squad, alarming, isSelf),
                    )
                    squadMarkers[squad.sessionId] = created
                    overlays.add(created)
                }
            val moved =
                marker.position.latitude != squad.latitude ||
                    marker.position.longitude != squad.longitude
            if (moved) {
                marker.position = GeoPoint(squad.latitude, squad.longitude)
            }
            if (squadVisualFingerprints[squad.sessionId] != visualFingerprint) {
                MapMarkerFactory.applyMarkerIcon(
                    context,
                    marker,
                    MapMarkerFactory.squadMarker(context, squad, alarming, isSelf),
                )
                squadVisualFingerprints[squad.sessionId] = visualFingerprint
            }

            syncAccuracyCircle(map, squad, alarming)
        }

        syncRoute(map, activeRoute)
    }

    private fun syncAccuracyCircle(
        map: MapView,
        squad: LiveSquadPin,
        alarming: Boolean,
    ) {
        val sessionId = squad.sessionId
        val overlays = map.overlays
        if (alarming) {
            accuracyPolygons.remove(sessionId)?.let { overlays.remove(it) }
            accuracyFingerprints.remove(sessionId)
            return
        }
        val acc = squad.accuracyM
        if (acc == null || acc <= 0 || acc > 120) {
            accuracyPolygons.remove(sessionId)?.let { overlays.remove(it) }
            accuracyFingerprints.remove(sessionId)
            return
        }
        val center = GeoPoint(squad.latitude, squad.longitude)
        val fingerprint = "$acc|${squad.latitude}|${squad.longitude}|${squad.mapColorArgb}"
        val existing = accuracyPolygons[sessionId]
        if (existing != null && accuracyFingerprints[sessionId] == fingerprint) {
            return
        }
        existing?.let { overlays.remove(it) }
        val circle = Polygon(map)
        circle.points = Polygon.pointsAsCircle(center, acc)
        val base = Color(squad.mapColorArgb)
        circle.fillPaint.color = base.copy(alpha = 0.12f).toArgb()
        circle.outlinePaint.color = base.copy(alpha = 0.55f).toArgb()
        circle.outlinePaint.strokeWidth = 1f
        accuracyPolygons[sessionId] = circle
        accuracyFingerprints[sessionId] = fingerprint
        overlays.add(circle)
    }

    private fun syncRoute(
        map: MapView,
        activeRoute: ActiveRouteAssignment?,
    ) {
        val overlays = map.overlays
        if (activeRoute == null || activeRoute.points.size < 2) {
            routePolyline?.let { overlays.remove(it) }
            routePolyline = null
            routeFingerprint = null
            return
        }
        val fingerprint =
            activeRoute.points.joinToString("|") { (lat, lng) -> "$lat,$lng" } +
                ":${activeRoute.colorArgb}"
        if (routeFingerprint == fingerprint && routePolyline != null) {
            return
        }
        routePolyline?.let { overlays.remove(it) }
        val polyline = Polyline(map)
        polyline.setPoints(activeRoute.points.map { (lat, lng) -> GeoPoint(lat, lng) })
        polyline.outlinePaint.color = activeRoute.colorArgb.toInt()
        polyline.outlinePaint.strokeWidth = 9f
        polyline.outlinePaint.isAntiAlias = true
        routePolyline = polyline
        routeFingerprint = fingerprint
        overlays.add(polyline)
    }

    private fun waypointFingerprint(waypoint: MapWaypointPin): String =
        "${waypoint.latitude}|${waypoint.longitude}|${waypoint.iconKey}|${waypoint.displayName}"

    private fun squadVisualFingerprint(
        squad: LiveSquadPin,
        alarming: Boolean,
        isSelf: Boolean,
    ): String =
        "${squad.mapIconKey}|${squad.mapColorArgb}|$alarming|$isSelf|${squad.squadCode}|${squad.squadName}"
}
