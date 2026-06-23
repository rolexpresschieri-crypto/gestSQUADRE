import Foundation
import MapKit
import shared

final class TocMapViewModel: ObservableObject {
    @Published var loading = true
    @Published var errorMessage: String?
    @Published var squads: [LiveSquadPin] = []
    @Published var waypoints: [MapWaypointPin] = []
    @Published var activeRoute: ActiveRouteAssignment?
    @Published var alarmingSessionIds: Set<String> = []
    @Published var layerMode: MapLayerMode = .standard
    @Published var viewState: MapViewState = .default
    @Published var viewReady = false

    private let facade: GestSquadreFacade
    private let focusSessionId: String?
    private let storage = MapViewStorage()
    private var refreshTimer: Timer?
    private var routeClearObserver: NSObjectProtocol?

    init(facade: GestSquadreFacade, focusSessionId: String?) {
        self.facade = facade
        self.focusSessionId = focusSessionId
        let saved = storage.load()
        layerMode = saved.layerMode
        viewState = saved
        viewReady = true
        observeRouteClear()
        refresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.refresh(silent: true)
        }
    }

    deinit {
        refreshTimer?.invalidate()
        if let routeClearObserver {
            NotificationCenter.default.removeObserver(routeClearObserver)
        }
    }

    var mapType: MKMapType {
        layerMode.mkMapType
    }

    func refresh(silent: Bool = false) {
        if !silent {
            loading = true
        }
        facade.refreshTocMapSafe { [weak self] squads, waypoints, alarmingIds, error in
            guard let self else { return }
            self.loadRouteIfNeeded { route in
                DispatchQueue.main.async {
                    self.loading = false
                    self.errorMessage = error
                    self.squads = squads
                    self.waypoints = waypoints
                    self.alarmingSessionIds = Set(alarmingIds)
                    self.activeRoute = route
                }
            }
        }
    }

    func toggleMapType() {
        let next: MapLayerMode = layerMode == .standard ? .orthophoto : .standard
        setLayer(next)
    }

    func setLayer(_ mode: MapLayerMode) {
        layerMode = mode
        storage.saveLayer(mode)
        viewState = MapViewState(
            latitude: viewState.latitude,
            longitude: viewState.longitude,
            zoom: viewState.zoom,
            layerMode: mode
        )
    }

    func saveView(latitude: Double, longitude: Double, zoom: Double) {
        storage.saveView(latitude: latitude, longitude: longitude, zoom: zoom)
        viewState = MapViewState(
            latitude: latitude,
            longitude: longitude,
            zoom: zoom,
            layerMode: layerMode
        )
    }

    private func loadRouteIfNeeded(completion: @escaping (ActiveRouteAssignment?) -> Void) {
        guard let focusSessionId else {
            completion(nil)
            return
        }
        facade.loadActiveRouteAssignmentSafe(sessionId: focusSessionId) { route, _ in
            completion(route)
        }
    }

    private func observeRouteClear() {
        routeClearObserver = NotificationCenter.default.addObserver(
            forName: RouteRefreshBus.routeCleared,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self,
                  let clearedId = notification.userInfo?["sessionId"] as? String,
                  clearedId == self.focusSessionId else { return }
            self.activeRoute = nil
        }
    }
}

func routeCoordinates(from route: ActiveRouteAssignment) -> [CLLocationCoordinate2D] {
    route.points.map { pair in
        CLLocationCoordinate2D(latitude: pair.first!.doubleValue, longitude: pair.second!.doubleValue)
    }
}

func uiColorFromArgb(_ argb: Int64) -> UIColor {
    let alpha = CGFloat((argb >> 24) & 0xFF) / 255.0
    let red = CGFloat((argb >> 16) & 0xFF) / 255.0
    let green = CGFloat((argb >> 8) & 0xFF) / 255.0
    let blue = CGFloat(argb & 0xFF) / 255.0
    return UIColor(red: red, green: green, blue: blue, alpha: alpha == 0 ? 1 : alpha)
}
