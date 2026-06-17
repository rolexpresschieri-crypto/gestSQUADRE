import Foundation

struct TocPushMessage {
    let title: String
    let body: String
}

enum FcmPushBus {
    static let messageReceived = Notification.Name("gestSquadre.tocPush.message")
    static let panelCleared = Notification.Name("gestSquadre.tocPush.panelClear")

    static func emit(title: String, body: String) {
        NotificationCenter.default.post(
            name: messageReceived,
            object: nil,
            userInfo: ["title": title, "body": body]
        )
    }

    static func emitPanelClear() {
        NotificationCenter.default.post(name: panelCleared, object: nil)
    }
}
