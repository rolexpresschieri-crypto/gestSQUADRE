import Foundation

enum RouteRefreshBus {
    static let routeCleared = Notification.Name("gestSquadre.tocMap.routeClear")

    static func emitCleared(sessionId: String) {
        NotificationCenter.default.post(
            name: routeCleared,
            object: nil,
            userInfo: ["sessionId": sessionId]
        )
    }
}
