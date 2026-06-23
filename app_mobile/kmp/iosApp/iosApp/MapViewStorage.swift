import Foundation
import MapKit

struct MapViewState {
    let latitude: Double
    let longitude: Double
    let zoom: Double
    let layerMode: MapLayerMode

    static let defaultLat = 45.0703
    static let defaultLng = 7.6869
    static let defaultZoom = 13.0

    static let `default` = MapViewState(
        latitude: defaultLat,
        longitude: defaultLng,
        zoom: defaultZoom,
        layerMode: .standard
    )
}

enum MapLayerMode: String {
    case standard
    case orthophoto

    static func fromStorage(_ raw: String?) -> MapLayerMode {
        raw == "orthophoto" ? .orthophoto : .standard
    }

    var storageValue: String {
        self == .orthophoto ? "orthophoto" : "standard"
    }

    var mkMapType: MKMapType {
        self == .orthophoto ? .satellite : .standard
    }
}

final class MapViewStorage {
    private let defaults = UserDefaults.standard

    func load() -> MapViewState {
        MapViewState(
            latitude: Double(defaults.float(forKey: Keys.lat, defaultValue: Float(MapViewState.defaultLat))),
            longitude: Double(defaults.float(forKey: Keys.lng, defaultValue: Float(MapViewState.defaultLng))),
            zoom: Double(defaults.float(forKey: Keys.zoom, defaultValue: Float(MapViewState.defaultZoom))),
            layerMode: MapLayerMode.fromStorage(defaults.string(forKey: Keys.layer))
        )
    }

    func saveView(latitude: Double, longitude: Double, zoom: Double) {
        defaults.set(Float(latitude), forKey: Keys.lat)
        defaults.set(Float(longitude), forKey: Keys.lng)
        defaults.set(Float(zoom), forKey: Keys.zoom)
    }

    func saveLayer(_ mode: MapLayerMode) {
        defaults.set(mode.storageValue, forKey: Keys.layer)
    }

    private enum Keys {
        static let lat = "gest_toc_map_lat"
        static let lng = "gest_toc_map_lng"
        static let zoom = "gest_toc_map_zoom"
        static let layer = "gest_toc_map_layer"
    }
}

private extension UserDefaults {
    func float(forKey key: String, defaultValue: Float) -> Float {
        if object(forKey: key) == nil { return defaultValue }
        return float(forKey: key)
    }
}

func mapZoomToMeters(zoom: Double) -> CLLocationDistance {
    let clamped = min(max(zoom, 3), 20)
    return 40_075_016.686 / pow(2.0, clamped + 8.0)
}

func mapMetersToZoom(latitudinalMeters: CLLocationDistance) -> Double {
    let meters = max(latitudinalMeters, 50)
    return log2(40_075_016.686 / meters) - 8.0
}
