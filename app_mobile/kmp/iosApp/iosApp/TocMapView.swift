import MapKit
import SwiftUI
import shared

struct TocMapView: View {
    @ObservedObject var mapViewModel: TocMapViewModel
    let focusSessionId: String?
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            TocMapRepresentable(
                squads: mapViewModel.squads,
                waypoints: mapViewModel.waypoints,
                alarmingSessionIds: mapViewModel.alarmingSessionIds,
                focusSessionId: focusSessionId,
                mapType: mapViewModel.mapType
            )
            .ignoresSafeArea()

            VStack(spacing: 8) {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    Spacer()
                    Button(action: { mapViewModel.refresh() }) {
                        Image(systemName: "arrow.clockwise.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    Button(action: { mapViewModel.toggleMapType() }) {
                        Image(systemName: mapViewModel.mapType == .standard ? "globe.americas.fill" : "map.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                if mapViewModel.loading {
                    ProgressView()
                        .tint(TacticalColors.yellow)
                }
                if let error = mapViewModel.errorMessage {
                    Text(error)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(Color.black.opacity(0.55))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Spacer()
            }
        }
        .background(TacticalColors.brandBase)
    }
}

private struct TocMapRepresentable: UIViewRepresentable {
    let squads: [LiveSquadPin]
    let waypoints: [MapWaypointPin]
    let alarmingSessionIds: Set<String>
    let focusSessionId: String?
    let mapType: MKMapType

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = mapType
        map.showsUserLocation = true
        let center = CLLocationCoordinate2D(
            latitude: TacticalColors.mapDefaultLat,
            longitude: TacticalColors.mapDefaultLng
        )
        map.setRegion(MKCoordinateRegion(center: center, latitudinalMeters: 4000, longitudinalMeters: 4000), animated: false)
        return map
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        mapView.mapType = mapType
        mapView.removeAnnotations(mapView.annotations)
        mapView.removeOverlays(mapView.overlays)

        for waypoint in waypoints {
            let annotation = MKPointAnnotation()
            annotation.coordinate = CLLocationCoordinate2D(latitude: waypoint.latitude, longitude: waypoint.longitude)
            annotation.title = waypoint.displayName
            mapView.addAnnotation(annotation)
        }

        for squad in squads {
            let annotation = SquadAnnotation(squad: squad, isAlarming: alarmingSessionIds.contains(squad.sessionId))
            mapView.addAnnotation(annotation)

            if alarmingSessionIds.contains(squad.sessionId) {
                let circle = MKCircle(center: annotation.coordinate, radius: 80)
                mapView.addOverlay(circle)
            }
        }

        if let focusSessionId,
           let squad = squads.first(where: { $0.sessionId == focusSessionId }) {
            let center = CLLocationCoordinate2D(latitude: squad.latitude, longitude: squad.longitude)
            mapView.setCenter(center, animated: true)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let squadAnnotation = annotation as? SquadAnnotation else {
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: "waypoint") as? MKMarkerAnnotationView
                    ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: "waypoint")
                view.markerTintColor = UIColor(TacticalColors.navy)
                view.glyphImage = nil
                return view
            }

            let identifier = "squad"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView
                ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.annotation = squadAnnotation
            view.markerTintColor = uiColorFromArgb(squadAnnotation.squad.mapColorArgb)
            view.glyphText = String(squadAnnotation.squad.squadCode.prefix(3))
            view.canShowCallout = true
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.fillColor = UIColor(TacticalColors.red).withAlphaComponent(0.25)
                renderer.strokeColor = UIColor(TacticalColors.red)
                renderer.lineWidth = 2
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}

private final class SquadAnnotation: NSObject, MKAnnotation {
    let squad: LiveSquadPin
    let isAlarming: Bool

    init(squad: LiveSquadPin, isAlarming: Bool) {
        self.squad = squad
        self.isAlarming = isAlarming
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: squad.latitude, longitude: squad.longitude)
    }

    var title: String? { squad.squadCode }
    var subtitle: String? { squad.squadName }
}
