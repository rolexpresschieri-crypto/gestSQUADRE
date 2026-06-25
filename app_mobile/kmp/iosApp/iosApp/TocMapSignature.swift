import Foundation
import shared

enum TocMapSignature {
    static func squadsPositionSig(_ squads: [LiveSquadPin]) -> String {
        squads
            .sorted { $0.sessionId < $1.sessionId }
            .map { squad in
                let acc = squad.accuracyM.map { String(Int($0.doubleValue.rounded())) } ?? ""
                return "\(squad.sessionId):\(squad.latitude),\(squad.longitude):\(acc)"
            }
            .joined(separator: "|")
    }

    static func squadsVisualSig(
        _ squads: [LiveSquadPin],
        alarmingSessionIds: Set<String>,
        focusSessionId: String?
    ) -> String {
        squads
            .sorted { $0.sessionId < $1.sessionId }
            .map { squad in
                let alarming = alarmingSessionIds.contains(squad.sessionId)
                let isSelf = focusSessionId != nil && squad.sessionId == focusSessionId
                return "\(squad.sessionId):\(squad.mapIconKey):\(squad.mapColorArgb):\(alarming):\(isSelf):\(squad.squadCode)"
            }
            .joined(separator: "|")
    }

    static func waypointsSig(_ waypoints: [MapWaypointPin]) -> String {
        waypoints
            .sorted { $0.id < $1.id }
            .map { wp in
                "\(wp.id):\(wp.latitude),\(wp.longitude):\(wp.iconKey):\(wp.displayName)"
            }
            .joined(separator: "|")
    }

    static func routeSig(_ route: ActiveRouteAssignment?) -> String {
        guard let route else { return "" }
        let points = route.points.map { pair in
            "\(pair.first!.intValue),\(pair.second!.intValue)"
        }.joined(separator: ";")
        return "\(route.routeCode):\(route.colorArgb):\(points):\(route.targetLabel ?? "")"
    }

    static func alarmingSig(_ ids: Set<String>) -> String {
        ids.sorted().joined(separator: ",")
    }
}

func formatMapScaleLabel(latitude: Double, zoom: Double) -> String {
    let clampedZoom = min(max(zoom, 3), 20)
    let metersPerPixel = 156_543.03392 * cos(latitude * .pi / 180) / pow(2.0, clampedZoom)
    let rawMeters = metersPerPixel * 88
    let nice: Double
    if rawMeters >= 10_000 {
        nice = (rawMeters / 10_000).rounded() * 10_000
    } else if rawMeters >= 1_000 {
        nice = (rawMeters / 1_000).rounded() * 1_000
    } else if rawMeters >= 100 {
        nice = (rawMeters / 100).rounded() * 100
    } else if rawMeters >= 10 {
        nice = (rawMeters / 10).rounded() * 10
    } else {
        nice = max(1, rawMeters.rounded())
    }
    if nice >= 1_000 {
        let km = nice / 1_000
        return km == floor(km) ? "\(Int(km)) km" : String(format: "%.1f km", km)
    }
    return "\(Int(nice)) m"
}
