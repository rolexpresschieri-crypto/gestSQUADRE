import MapKit
import SwiftUI
import shared

struct TocMapView: View {
    @ObservedObject var mapViewModel: TocMapViewModel
    let focusSessionId: String?
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            if mapViewModel.viewReady {
                TocMapRepresentable(
                    squads: mapViewModel.squads,
                    waypoints: mapViewModel.waypoints,
                    alarmingSessionIds: mapViewModel.alarmingSessionIds,
                    activeRoute: mapViewModel.activeRoute,
                    focusSessionId: focusSessionId,
                    mapType: mapViewModel.mapType,
                    viewState: mapViewModel.viewState,
                    onViewChanged: { lat, lng, zoom in
                        mapViewModel.saveView(latitude: lat, longitude: lng, zoom: zoom)
                    }
                )
                .ignoresSafeArea()
            } else {
                ProgressView()
                    .tint(TacticalColors.yellow)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            VStack(spacing: 8) {
                HStack(alignment: .top) {
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("TOC — Mappa operativa")
                            .font(.subheadline.weight(.heavy))
                            .foregroundStyle(.white)
                        if let route = mapViewModel.activeRoute {
                            let target = route.targetLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                            let suffix = target.isEmpty ? "" : " → \(target)"
                            Text("Via \(route.routeCode)\(suffix)")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(TacticalColors.yellow)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: { mapViewModel.refresh() }) {
                        Image(systemName: "arrow.clockwise.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    .disabled(mapViewModel.loading)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 8)
                .padding(.top, 8)

                mapLayerPicker
                    .padding(.horizontal, 8)

                if mapViewModel.loading {
                    ProgressView()
                        .tint(TacticalColors.yellow)
                }
                Spacer()

                Text(
                    mapViewModel.errorMessage
                        ?? "\(mapViewModel.squads.count) squadre · \(mapViewModel.waypoints.count) waypoint · sposta la mappa: la posizione resta salvata"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(mapViewModel.errorMessage == nil ? Color.white.opacity(0.7) : Color(red: 1, green: 0.54, blue: 0.5))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.black.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
        }
        .background(TacticalColors.brandBase)
    }

    private var mapLayerPicker: some View {
        Picker("Layer mappa", selection: Binding(
            get: { mapViewModel.layerMode },
            set: { mapViewModel.setLayer($0) }
        )) {
            Text("Stradale").tag(MapLayerMode.standard)
            Text("Ortofoto").tag(MapLayerMode.orthophoto)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct TocMapRepresentable: UIViewRepresentable {
    let squads: [LiveSquadPin]
    let waypoints: [MapWaypointPin]
    let alarmingSessionIds: Set<String>
    let activeRoute: ActiveRouteAssignment?
    let focusSessionId: String?
    let mapType: MKMapType
    let viewState: MapViewState
    let onViewChanged: (Double, Double, Double) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onViewChanged: onViewChanged)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = mapType
        map.showsUserLocation = true
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        let meters = mapZoomToMeters(zoom: viewState.zoom)
        let center = CLLocationCoordinate2D(latitude: viewState.latitude, longitude: viewState.longitude)
        map.setRegion(
            MKCoordinateRegion(center: center, latitudinalMeters: meters, longitudinalMeters: meters),
            animated: false
        )
        context.coordinator.didApplyInitialRegion = true
        context.coordinator.lastSavedZoom = viewState.zoom
        return map
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        mapView.mapType = mapType
        context.coordinator.sync(
            mapView: mapView,
            squads: squads,
            waypoints: waypoints,
            alarmingSessionIds: alarmingSessionIds,
            activeRoute: activeRoute,
            focusSessionId: focusSessionId,
            routeColorArgb: activeRoute?.colorArgb
        )
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        let onViewChanged: (Double, Double, Double) -> Void
        var didApplyInitialRegion = false
        var lastSavedZoom: Double = MapViewState.defaultZoom
        var routeColorArgb: Int64?

        private var squadAnnotations: [String: SquadAnnotation] = [:]
        private var waypointAnnotations: [String: WaypointAnnotation] = [:]
        private var squadFingerprints: [String: String] = [:]
        private var waypointFingerprints: [String: String] = [:]
        private var circleOverlays: [String: SquadCircleOverlay] = [:]
        private var circleFingerprints: [String: String] = [:]
        private var routeOverlay: MKPolyline?
        private var routeFingerprint: String?

        init(onViewChanged: @escaping (Double, Double, Double) -> Void) {
            self.onViewChanged = onViewChanged
        }

        func sync(
            mapView: MKMapView,
            squads: [LiveSquadPin],
            waypoints: [MapWaypointPin],
            alarmingSessionIds: Set<String>,
            activeRoute: ActiveRouteAssignment?,
            focusSessionId: String?,
            routeColorArgb: Int64?
        ) {
            self.routeColorArgb = routeColorArgb

            let waypointIds = Set(waypoints.map(\.id))
            for (id, annotation) in waypointAnnotations where !waypointIds.contains(id) {
                mapView.removeAnnotation(annotation)
                waypointAnnotations.removeValue(forKey: id)
                waypointFingerprints.removeValue(forKey: id)
            }
            for waypoint in waypoints {
                let fingerprint = waypointFingerprint(waypoint)
                if let existing = waypointAnnotations[waypoint.id] {
                    if existing.waypoint.latitude != waypoint.latitude || existing.waypoint.longitude != waypoint.longitude {
                        mapView.removeAnnotation(existing)
                        let replacement = WaypointAnnotation(waypoint: waypoint)
                        waypointAnnotations[waypoint.id] = replacement
                        mapView.addAnnotation(replacement)
                    } else {
                        existing.waypoint = waypoint
                        if waypointFingerprints[waypoint.id] != fingerprint,
                           let view = mapView.view(for: existing) {
                            applyWaypointView(view, waypoint: waypoint)
                        }
                    }
                } else {
                    let annotation = WaypointAnnotation(waypoint: waypoint)
                    waypointAnnotations[waypoint.id] = annotation
                    mapView.addAnnotation(annotation)
                }
                waypointFingerprints[waypoint.id] = fingerprint
            }

            let squadIds = Set(squads.map(\.sessionId))
            for (id, annotation) in squadAnnotations where !squadIds.contains(id) {
                mapView.removeAnnotation(annotation)
                squadAnnotations.removeValue(forKey: id)
                squadFingerprints.removeValue(forKey: id)
                if let circle = circleOverlays.removeValue(forKey: id) {
                    mapView.removeOverlay(circle)
                    circleFingerprints.removeValue(forKey: id)
                }
            }

            for squad in squads {
                let alarming = alarmingSessionIds.contains(squad.sessionId)
                let isSelf = focusSessionId != nil && squad.sessionId == focusSessionId
                let fingerprint = squadFingerprint(squad: squad, alarming: alarming, isSelf: isSelf)

                if let existing = squadAnnotations[squad.sessionId] {
                    let moved = existing.squad.latitude != squad.latitude || existing.squad.longitude != squad.longitude
                    existing.squad = squad
                    existing.isAlarming = alarming
                    existing.isSelf = isSelf
                    if moved {
                        mapView.removeAnnotation(existing)
                        mapView.addAnnotation(existing)
                    } else if squadFingerprints[squad.sessionId] != fingerprint,
                              let view = mapView.view(for: existing) {
                        applySquadView(view, annotation: existing)
                    }
                } else {
                    let annotation = SquadAnnotation(squad: squad, isAlarming: alarming, isSelf: isSelf)
                    squadAnnotations[squad.sessionId] = annotation
                    mapView.addAnnotation(annotation)
                }
                squadFingerprints[squad.sessionId] = fingerprint
                syncCircle(
                    mapView: mapView,
                    squad: squad,
                    alarming: alarming,
                    squadColorArgb: squad.mapColorArgb
                )
            }

            syncRoute(mapView: mapView, activeRoute: activeRoute)
        }

        private func syncCircle(
            mapView: MKMapView,
            squad: LiveSquadPin,
            alarming: Bool,
            squadColorArgb: Int64
        ) {
            let sessionId = squad.sessionId
            let center = CLLocationCoordinate2D(latitude: squad.latitude, longitude: squad.longitude)
            if alarming {
                let fingerprint = "alarm:\(sessionId)|\(squad.latitude)|\(squad.longitude)"
                if circleFingerprints[sessionId] == fingerprint, circleOverlays[sessionId] != nil { return }
                if let circle = circleOverlays.removeValue(forKey: sessionId) {
                    mapView.removeOverlay(circle)
                }
                let circle = SquadCircleOverlay.make(center: center, radius: 80, colorArgb: squadColorArgb, isAlarm: true)
                circleOverlays[sessionId] = circle
                circleFingerprints[sessionId] = fingerprint
                mapView.addOverlay(circle)
                return
            }
            guard let accuracy = squad.accuracyM?.doubleValue, accuracy > 0, accuracy <= 120 else {
                if let circle = circleOverlays.removeValue(forKey: sessionId) {
                    mapView.removeOverlay(circle)
                    circleFingerprints.removeValue(forKey: sessionId)
                }
                return
            }
            let fingerprint = "c:\(sessionId)|\(accuracy)|\(squad.latitude)|\(squad.longitude)|\(squadColorArgb)"
            if let circle = circleOverlays[sessionId] {
                if circleFingerprints[sessionId] != fingerprint {
                    mapView.removeOverlay(circle)
                    let replacement = SquadCircleOverlay.make(
                        center: center,
                        radius: accuracy,
                        colorArgb: squadColorArgb,
                        isAlarm: false
                    )
                    circleOverlays[sessionId] = replacement
                    mapView.addOverlay(replacement)
                    circleFingerprints[sessionId] = fingerprint
                }
            } else {
                let circle = SquadCircleOverlay.make(
                    center: center,
                    radius: accuracy,
                    colorArgb: squadColorArgb,
                    isAlarm: false
                )
                circleOverlays[sessionId] = circle
                mapView.addOverlay(circle)
                circleFingerprints[sessionId] = fingerprint
            }
        }

        private func syncRoute(mapView: MKMapView, activeRoute: ActiveRouteAssignment?) {
            guard let activeRoute else {
                if let routeOverlay {
                    mapView.removeOverlay(routeOverlay)
                    self.routeOverlay = nil
                    routeFingerprint = nil
                }
                return
            }
            let coords = routeCoordinates(from: activeRoute)
            guard coords.count >= 2 else { return }
            let fingerprint = coords.map { "\($0.latitude),\($0.longitude)" }.joined(separator: "|")
            if routeFingerprint == fingerprint, routeOverlay != nil { return }
            if let routeOverlay {
                mapView.removeOverlay(routeOverlay)
            }
            let polyline = MKPolyline(coordinates: coords, count: coords.count)
            routeOverlay = polyline
            routeFingerprint = fingerprint
            mapView.addOverlay(polyline)
        }

        private func waypointFingerprint(_ waypoint: MapWaypointPin) -> String {
            "wp:\(waypoint.id)|\(waypoint.latitude)|\(waypoint.longitude)|\(waypoint.iconKey)|\(waypoint.displayName)"
        }

        private func squadFingerprint(squad: LiveSquadPin, alarming: Bool, isSelf: Bool) -> String {
            "sq:\(squad.sessionId)|\(squad.mapIconKey)|\(squad.mapColorArgb)|\(alarming)|\(isSelf)|\(squad.squadName)|\(squad.squadCode)"
        }

        private func applyWaypointView(_ view: MKAnnotationView, waypoint: MapWaypointPin) {
            view.image = MapMarkerFactory.waypointMarker(waypoint: waypoint)
            view.centerOffset = CGPoint(x: 0, y: -(view.image?.size.height ?? 0) / 2)
        }

        private func applySquadView(_ view: MKAnnotationView, annotation: SquadAnnotation) {
            view.image = MapMarkerFactory.squadMarker(
                squad: annotation.squad,
                alarming: annotation.isAlarming,
                isSelf: annotation.isSelf
            )
            view.centerOffset = CGPoint(x: 0, y: -(view.image?.size.height ?? 0) / 2)
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            guard didApplyInitialRegion else { return }
            let center = mapView.region.center
            let zoom = mapMetersToZoom(latitudinalMeters: mapView.region.span.latitudeDelta * 111_320)
            lastSavedZoom = zoom
            onViewChanged(center.latitude, center.longitude, zoom)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if annotation is MKUserLocation { return nil }

            if let waypointAnnotation = annotation as? WaypointAnnotation {
                let identifier = "waypoint"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                view.annotation = waypointAnnotation
                applyWaypointView(view, waypoint: waypointAnnotation.waypoint)
                view.canShowCallout = false
                return view
            }

            guard let squadAnnotation = annotation as? SquadAnnotation else { return nil }
            let identifier = "squad"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.annotation = squadAnnotation
            applySquadView(view, annotation: squadAnnotation)
            view.canShowCallout = true
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let circle = overlay as? SquadCircleOverlay {
                let renderer = MKCircleRenderer(circle: circle)
                if circle.isAlarmCircle {
                    renderer.fillColor = UIColor(TacticalColors.red).withAlphaComponent(0.25)
                    renderer.strokeColor = UIColor(TacticalColors.red)
                    renderer.lineWidth = 2
                } else {
                    let base = uiColorFromArgb(circle.colorArgb)
                    renderer.fillColor = base.withAlphaComponent(0.12)
                    renderer.strokeColor = base.withAlphaComponent(0.55)
                    renderer.lineWidth = 1
                }
                return renderer
            }
            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.fillColor = UIColor(TacticalColors.navy).withAlphaComponent(0.12)
                renderer.strokeColor = UIColor(TacticalColors.navy).withAlphaComponent(0.55)
                renderer.lineWidth = 1
                return renderer
            }
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                if let routeColorArgb {
                    renderer.strokeColor = uiColorFromArgb(routeColorArgb)
                } else {
                    renderer.strokeColor = UIColor(TacticalColors.yellow)
                }
                renderer.lineWidth = 9
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}

private final class WaypointAnnotation: NSObject, MKAnnotation {
    var waypoint: MapWaypointPin

    init(waypoint: MapWaypointPin) {
        self.waypoint = waypoint
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: waypoint.latitude, longitude: waypoint.longitude)
    }

    var title: String? { waypoint.displayName }
}

private final class SquadAnnotation: NSObject, MKAnnotation {
    var squad: LiveSquadPin
    var isAlarming: Bool
    var isSelf: Bool

    init(squad: LiveSquadPin, isAlarming: Bool, isSelf: Bool) {
        self.squad = squad
        self.isAlarming = isAlarming
        self.isSelf = isSelf
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: squad.latitude, longitude: squad.longitude)
    }

    var title: String? { squad.squadCode }
    var subtitle: String? { squad.squadName }
}

private final class SquadCircleOverlay: MKCircle {
    var colorArgb: Int64 = 0
    var isAlarmCircle = false

    static func make(
        center: CLLocationCoordinate2D,
        radius: CLLocationDistance,
        colorArgb: Int64,
        isAlarm: Bool
    ) -> SquadCircleOverlay {
        let circle = SquadCircleOverlay(center: center, radius: radius)
        circle.colorArgb = colorArgb
        circle.isAlarmCircle = isAlarm
        return circle
    }
}
