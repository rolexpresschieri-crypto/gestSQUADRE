import Foundation
import MapKit
import shared

final class TocMapViewModel: ObservableObject {
    @Published var loading = true
    @Published var errorMessage: String?
    @Published var squads: [LiveSquadPin] = []
    @Published var waypoints: [MapWaypointPin] = []
    @Published var alarmingSessionIds: Set<String> = []
    @Published var mapType: MKMapType = .standard

    private let facade: GestSquadreFacade
    private var refreshTimer: Timer?

    init(facade: GestSquadreFacade) {
        self.facade = facade
        refresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.refresh(silent: true)
        }
    }

    deinit {
        refreshTimer?.invalidate()
    }

    func refresh(silent: Bool = false) {
        if !silent {
            loading = true
        }
        facade.refreshTocMapSafe { [weak self] squads, waypoints, alarmingIds, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.loading = false
                self.errorMessage = error
                self.squads = squads
                self.waypoints = waypoints
                self.alarmingSessionIds = Set(alarmingIds)
            }
        }
    }

    func toggleMapType() {
        mapType = mapType == .standard ? .satellite : .standard
    }
}

func uiColorFromArgb(_ argb: Int64) -> UIColor {
    let alpha = CGFloat((argb >> 24) & 0xFF) / 255.0
    let red = CGFloat((argb >> 16) & 0xFF) / 255.0
    let green = CGFloat((argb >> 8) & 0xFF) / 255.0
    let blue = CGFloat(argb & 0xFF) / 255.0
    return UIColor(red: red, green: green, blue: blue, alpha: alpha == 0 ? 1 : alpha)
}
