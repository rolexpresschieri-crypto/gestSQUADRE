import FirebaseCore
import FirebaseMessaging
import Foundation
import shared
import UIKit
import UserNotifications

struct FirebaseBundleConfig: Decodable {
    let projectId: String
    let iosAppId: String
    let iosApiKey: String
    let messagingSenderId: String
    let storageBucket: String?

    enum CodingKeys: String, CodingKey {
        case projectId = "FIREBASE_PROJECT_ID"
        case iosAppId = "FIREBASE_IOS_APP_ID"
        case iosApiKey = "FIREBASE_IOS_API_KEY"
        case messagingSenderId = "FIREBASE_MESSAGING_SENDER_ID"
        case storageBucket = "FIREBASE_STORAGE_BUCKET"
    }
}

enum TocPushParser {
    static func tocTitle(from userInfo: [AnyHashable: Any]) -> String {
        let title = (userInfo["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "TOC — ALLARME" : title
    }

    static func tocBody(from userInfo: [AnyHashable: Any]) -> String {
        (userInfo["body"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    static func tocBodyForDisplay(from userInfo: [AnyHashable: Any]) -> String {
        let base = tocBody(from: userInfo)
        let target = (userInfo["target_waypoint_label"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !target.isEmpty else { return base }
        if base.localizedCaseInsensitiveContains(target) { return base }
        return "\(base) — TARGET \(target.uppercased(with: Locale(identifier: "it_IT")))"
    }

    static func isTocAlarm(from userInfo: [AnyHashable: Any]) -> Bool {
        let type = (userInfo["type"] as? String)?.lowercased()
        return type == "toc_alarm" || type == "volunteer_alarm"
    }

    static func isPanelClear(from userInfo: [AnyHashable: Any]) -> Bool {
        (userInfo["type"] as? String)?.lowercased() == "toc_clear_panel"
    }
}

final class FcmManager {
    static let shared = FcmManager()

    private(set) var isConfigured = false
    private var pendingTokenUpload: (() -> Void)?

    private init() {}

    func onApnsTokenRegistered() {
        pendingTokenUpload?()
        pendingTokenUpload = nil
    }

    func configureIfNeeded() {
        guard !isConfigured else { return }
        guard let config = loadFirebaseConfig() else { return }

        if FirebaseApp.app() == nil {
            let options = FirebaseOptions(
                googleAppID: config.iosAppId,
                gcmSenderID: config.messagingSenderId
            )
            options.apiKey = config.iosApiKey
            options.projectID = config.projectId
            options.storageBucket = config.storageBucket ?? "\(config.projectId).firebasestorage.app"
            FirebaseApp.configure(options: options)
        }
        isConfigured = FirebaseApp.app() != nil
    }

    func hasNotificationPermission(completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                completion(settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
            }
        }
    }

    func requestNotificationPermission(completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                completion(granted)
            }
        }
    }

    func registerToken(
        facade: GestSquadreFacade,
        session: SquadSession,
        completion: @escaping (String?) -> Void
    ) {
        guard isConfigured else {
            completion("Push TOC disabilitata: configura FIREBASE_IOS_* in dart-defines.json.")
            return
        }

        hasNotificationPermission { [weak self] granted in
            guard let self else { return }
            if !granted {
                completion("Abilita le notifiche in Impostazioni → gestSQUADRE, poi tocca «Ripara push TOC».")
                return
            }
            UIApplication.shared.registerForRemoteNotifications()
            self.fetchAndUploadToken(facade: facade, session: session, notificationsMissing: false, completion: completion)
        }
    }

    func fetchFcmToken(completion: @escaping (String?, String?) -> Void) {
        guard isConfigured else {
            completion(nil, "Push disabilitata: configura FIREBASE_IOS_* in dart-defines.json.")
            return
        }
        hasNotificationPermission { granted in
            if !granted {
                completion(nil, "Abilita le notifiche in Impostazioni → gestSQUADRE.")
                return
            }
            UIApplication.shared.registerForRemoteNotifications()
            self.fetchTokenOnly(attempt: 0, completion: completion)
        }
    }

    private func fetchTokenOnly(attempt: Int, completion: @escaping (String?, String?) -> Void) {
        if Messaging.messaging().apnsToken == nil {
            if attempt < 10 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                    self?.fetchTokenOnly(attempt: attempt + 1, completion: completion)
                }
                return
            }
            completion(nil, "Token push non ottenuto. Verifica Firebase e notifiche.")
            return
        }
        Messaging.messaging().token { token, _ in
            DispatchQueue.main.async {
                if let token, !token.isEmpty {
                    completion(token, nil)
                } else {
                    completion(nil, "Token push non ottenuto. Verifica Firebase e notifiche.")
                }
            }
        }
    }

    func onNewToken(_ token: String?) {
        guard let token, !token.isEmpty else { return }
        FcmSessionRegistry.shared.deliverNewToken(token)
    }

    func handleRemoteUserInfo(_ userInfo: [AnyHashable: Any]) {
        if TocPushParser.isPanelClear(from: userInfo) {
            TocMessageStorage.shared.clear()
            FcmPushBus.emitPanelClear()
            return
        }

        let title = TocPushParser.tocTitle(from: userInfo)
        let body = TocPushParser.tocBodyForDisplay(from: userInfo)
        guard let message = TocMessageStorage.formatDisplayMessage(title: title, body: body) else { return }
        TocMessageStorage.shared.save(message: message)
        FcmPushBus.emit(title: title, body: body)
        showLocalNotification(
            title: title,
            body: body,
            isAlarm: TocPushParser.isTocAlarm(from: userInfo)
        )
    }

    func showLocalNotification(title: String, body: String, isAlarm: Bool) {
        hasNotificationPermission { granted in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }

    private func fetchAndUploadToken(
        facade: GestSquadreFacade,
        session: SquadSession,
        notificationsMissing: Bool,
        attempt: Int = 0,
        completion: @escaping (String?) -> Void
    ) {
        if !notificationsMissing, Messaging.messaging().apnsToken == nil {
            if attempt < 10 {
                pendingTokenUpload = { [weak self] in
                    self?.fetchAndUploadToken(
                        facade: facade,
                        session: session,
                        notificationsMissing: notificationsMissing,
                        attempt: attempt + 1,
                        completion: completion
                    )
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    if Messaging.messaging().apnsToken != nil {
                        self.onApnsTokenRegistered()
                    }
                }
                return
            }
            DispatchQueue.main.async {
                completion(
                    "Push in attesa: consenti le notifiche, chiudi e riapri l'app, poi tocca «Ripara push TOC»."
                )
            }
            return
        }

        Messaging.messaging().token { token, error in
            if let token, !token.isEmpty {
                facade.registerFcmTokenSafe(
                    sessionId: session.sessionId,
                    squadId: session.squadId,
                    token: token
                ) { uploadError in
                    DispatchQueue.main.async {
                        if let uploadError {
                            completion(NetworkErrorMessages.shared.format(message: uploadError))
                            return
                        }
                        if notificationsMissing {
                            completion("Push registrata sul server. Abilita le notifiche in Impostazioni → gestSQUADRE.")
                        } else {
                            completion(nil)
                        }
                    }
                }
                return
            }

            if attempt < 2 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    self.fetchAndUploadToken(
                        facade: facade,
                        session: session,
                        notificationsMissing: notificationsMissing,
                        attempt: attempt + 1,
                        completion: completion
                    )
                }
                return
            }

            DispatchQueue.main.async {
                let raw = error?.localizedDescription ?? "Token push non ottenuto: verifica Firebase iOS e rifai login."
                completion(NetworkErrorMessages.shared.format(message: raw))
            }
        }
    }

    private func loadFirebaseConfig() -> FirebaseBundleConfig? {
        guard let url = Bundle.main.url(forResource: "firebase-config", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let config = try? JSONDecoder().decode(FirebaseBundleConfig.self, from: data) else {
            return nil
        }
        guard !config.projectId.isEmpty,
              !config.iosAppId.isEmpty,
              !config.iosApiKey.isEmpty,
              !config.messagingSenderId.isEmpty,
              !config.iosAppId.hasPrefix("$("),
              config.iosAppId != "1:000000000000:ios:0000000000000000000000" else {
            return nil
        }
        return config
    }
}
