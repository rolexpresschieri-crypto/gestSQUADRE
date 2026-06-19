import SwiftUI
import shared

final class SquadViewModel: ObservableObject {
    @Published var squadCode = ""
    @Published var password = ""
    @Published var statusMessage = ""
    @Published var loginBlockingMessage: String?
    @Published var bannerMessage: String?
    @Published var lastTocMessage: String?
    @Published var isLoggedIn = false
    @Published var isBusy = false
    @Published var isInitializing = true
    @Published var sessionLabel = ""
    @Published var sessionId = ""
    @Published var gpsStatusLabel: String?
    @Published var lastGpsAccuracyM: Double?
    @Published var needsLocationPermission = false
    @Published var needsNotificationPermission = false
    @Published var pushStatusLabel: String?
    @Published var pushStatusOk = false
    @Published var showAlarmSheet = false
    @Published var isAlarmBusy = false

    private(set) var facade: GestSquadreFacade?
    private var session: SquadSession?
    private let locationTracker = LocationTracker(platformContext: NSObject())
    private let sessionStorage = SessionStorage()
    private var stopLocationUpdates: (() -> Void)?
    private var lastPublished: GpsPosition?
    private var lastPublishedAtMs: Int64?
    private var sessionWatchTimer: Timer?
    private var pushWatchTimer: Timer?

    init() {
        guard let url = supabaseUrl, let key = supabaseAnonKey else {
            statusMessage = Self.missingConfigMessage()
            isInitializing = false
            return
        }
        let config = GestSquadreConfig(supabaseUrl: url, supabaseAnonKey: key)
        facade = GestSquadreFacade(config: config)
        observePushBus()
        restoreSessionOnStart()
    }

    var isConfigured: Bool {
        supabaseUrl != nil && supabaseAnonKey != nil
    }

    func login(squadCode: String, password: String, onComplete: @escaping (String?) -> Void) {
        guard let facade else {
            onComplete(Self.missingConfigMessage())
            return
        }

        isBusy = true
        loginBlockingMessage = nil
        facade.loginSquadSafe(squadCode: squadCode, password: password) { [weak self] session, errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isBusy = false
                if let errorMessage {
                    if GestSquadreMessages.shared.isSquadAlreadyActiveMessage(message: errorMessage) {
                        self.loginBlockingMessage = errorMessage
                    }
                    onComplete(errorMessage)
                    return
                }
                guard let session else {
                    onComplete("Login fallito.")
                    return
                }
                self.onSessionReady(session)
                onComplete(nil)
            }
        }
    }

    func logout(onComplete: @escaping (String?) -> Void) {
        guard isLoggedIn, let facade, let session else { return }
        isBusy = true
        stopGpsTracking()
        stopSessionWatchdog()
        stopPushWatchdog()
        facade.logoutSquadSafe(session: session) { [weak self] errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isBusy = false
                self.clearLocalSession()
                onComplete(errorMessage)
            }
        }
    }

    func clearLastTocMessage() {
        lastTocMessage = nil
    }

    func onLocationPermissionGranted() {
        guard locationTracker.hasLocationPermission() else { return }
        needsLocationPermission = false
        startGpsTracking()
    }

    func onNotificationPermissionGranted() {
        needsNotificationPermission = false
        guard let facade, let session else { return }
        registerFcmForSession(session, facade: facade)
    }

    func retryPushRegistration() {
        guard let facade, let session else { return }
        registerFcmForSession(session, facade: facade)
    }

    func sendAlarm(
        sanitario: Bool,
        security: Bool,
        vigiliFuoco: Bool,
        altro: Bool,
        otherDetail: String,
        onComplete: @escaping (String?) -> Void
    ) {
        guard let facade, let session else {
            onComplete("Sessione non attiva.")
            return
        }

        let request = facade.makeSquadAlarmRequest(
            sanitario: sanitario,
            security: security,
            vigiliFuoco: vigiliFuoco,
            altro: altro,
            otherDetail: otherDetail
        )

        if let validationError = request.validate() {
            onComplete(validationError)
            return
        }

        isAlarmBusy = true
        facade.sendAlarmSafe(session: session, request: request) { [weak self] errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isAlarmBusy = false
                if let errorMessage {
                    onComplete(errorMessage)
                    return
                }
                self.showAlarmSheet = false
                let detail = request.toLogMessage()
                self.statusMessage = "\(SquadAlarmCopy.sentOk) \(detail)"
                onComplete(nil)
            }
        }
    }

    private func restoreSessionOnStart() {
        guard let facade else {
            isInitializing = false
            return
        }

        if !sessionStorage.isAuthLogMigrationDone() {
            if let sessionId = sessionStorage.loadSessionId() {
                facade.restoreOnlineSessionSafe(sessionId: sessionId) { [weak self] session, _ in
                    DispatchQueue.main.async {
                        guard let self else { return }
                        if let session {
                            facade.logoutSquadSafe(session: session) { _ in }
                        }
                        self.sessionStorage.clear()
                        self.sessionStorage.setAuthLogMigrationDone()
                        self.isInitializing = false
                    }
                }
            } else {
                sessionStorage.setAuthLogMigrationDone()
                isInitializing = false
            }
            return
        }

        guard let sessionId = sessionStorage.loadSessionId() else {
            isInitializing = false
            return
        }

        facade.restoreOnlineSessionSafe(sessionId: sessionId) { [weak self] session, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if let session {
                    self.onSessionReady(session)
                } else {
                    self.sessionStorage.clear()
                }
                self.isInitializing = false
            }
        }
    }

    private func onSessionReady(_ session: SquadSession) {
        self.session = session
        sessionStorage.save(session)
        isLoggedIn = true
        sessionId = session.sessionId
        sessionLabel = "\(session.squadName) + \(session.loginTimeLabel())"
        statusMessage = "Connesso. I dati vanno su Supabase (TOC Windows li vede subito)."
        bannerMessage = nil
        gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
        lastGpsAccuracyM = nil
        lastTocMessage = TocMessageStorage.shared.load()
        startGpsTracking()
        startSessionWatchdog()
        setupPushForSession(session)
    }

    private func setupPushForSession(_ session: SquadSession) {
        guard let facade else { return }
        FcmManager.shared.configureIfNeeded()
        if FcmManager.shared.isConfigured {
            bindFcmSession(session, facade: facade)
            FcmManager.shared.hasNotificationPermission { [weak self] granted in
                guard let self else { return }
                if !granted {
                    self.needsNotificationPermission = true
                    FcmManager.shared.requestNotificationPermission { _ in }
                }
                self.registerFcmForSession(session, facade: facade)
            }
        } else {
            pushStatusLabel = "Push TOC disabilitata (Firebase iOS non configurato)."
            pushStatusOk = false
            bannerMessage = "Push TOC disabilitata: aggiungi FIREBASE_IOS_* in dart-defines.json."
        }
    }

    private func bindFcmSession(_ session: SquadSession, facade: GestSquadreFacade) {
        FcmSessionRegistry.shared.bind(session: session) { active, token in
            facade.registerFcmTokenSafe(
                sessionId: active.sessionId,
                squadId: active.squadId,
                token: token
            ) { _ in }
        }
    }

    private func registerFcmForSession(_ session: SquadSession, facade: GestSquadreFacade) {
        bindFcmSession(session, facade: facade)
        FcmManager.shared.registerToken(facade: facade, session: session) { [weak self] err in
            guard let self else { return }
            if let err {
                let registeredOnServer = err.localizedCaseInsensitiveContains("Push registrata")
                self.pushStatusLabel = err
                self.pushStatusOk = registeredOnServer
            } else {
                self.pushStatusLabel = "Push TOC: attiva (il server può inviarti allarmi)."
                self.pushStatusOk = true
            }
            self.startPushWatchdog(session: session, facade: facade)
        }
    }

    private func startPushWatchdog(session: SquadSession, facade: GestSquadreFacade) {
        stopPushWatchdog()
        guard FcmManager.shared.isConfigured else { return }
        pushWatchTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            guard let self, self.isLoggedIn else { return }
            self.registerFcmForSession(session, facade: facade)
        }
    }

    private func stopPushWatchdog() {
        pushWatchTimer?.invalidate()
        pushWatchTimer = nil
    }

    private func observePushBus() {
        NotificationCenter.default.addObserver(
            forName: FcmPushBus.messageReceived,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            let title = notification.userInfo?["title"] as? String ?? ""
            let body = notification.userInfo?["body"] as? String ?? ""
            self.lastTocMessage = TocMessageStorage.formatDisplayMessage(title: title, body: body)
        }
        NotificationCenter.default.addObserver(
            forName: FcmPushBus.panelCleared,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.lastTocMessage = nil
        }
    }

    private func clearLocalSession() {
        stopPushWatchdog()
        FcmSessionRegistry.shared.clear()
        session = nil
        sessionStorage.clear()
        isLoggedIn = false
        sessionId = ""
        sessionLabel = ""
        gpsStatusLabel = nil
        lastGpsAccuracyM = nil
        needsLocationPermission = false
        needsNotificationPermission = false
        pushStatusLabel = nil
        pushStatusOk = false
        lastTocMessage = nil
        statusMessage = "Log-out completato."
    }

    private func startSessionWatchdog() {
        stopSessionWatchdog()
        sessionWatchTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let self, self.isLoggedIn, let facade, !self.sessionId.isEmpty else { return }
            facade.isSessionOnlineSafe(sessionId: self.sessionId) { online, _ in
                DispatchQueue.main.async {
                    if !online.boolValue {
                        self.handleRemoteLogout()
                        return
                    }
                    if self.lastTocMessage != nil {
                        facade.isTocPanelClosedByTocSafe(sessionId: self.sessionId) { closed, _ in
                            DispatchQueue.main.async {
                                if closed.boolValue {
                                    TocMessageStorage.shared.clear()
                                    self.lastTocMessage = nil
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func stopSessionWatchdog() {
        sessionWatchTimer?.invalidate()
        sessionWatchTimer = nil
    }

    private func handleRemoteLogout() {
        stopGpsTracking()
        stopSessionWatchdog()
        stopPushWatchdog()
        FcmSessionRegistry.shared.clear()
        sessionStorage.clear()
        session = nil
        isLoggedIn = false
        sessionId = ""
        sessionLabel = ""
        gpsStatusLabel = nil
        lastGpsAccuracyM = nil
        pushStatusLabel = nil
        pushStatusOk = false
        lastTocMessage = nil
        bannerMessage = "Sessione chiusa: login su un altro telefono o logout dal TOC."
    }

    private func startGpsTracking() {
        guard isLoggedIn, !sessionId.isEmpty, facade != nil else { return }

        if !locationTracker.isLocationServiceEnabled() {
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            bannerMessage = "Attiva il GPS sul telefono per inviare la posizione al TOC."
            return
        }

        if !locationTracker.hasLocationPermission() {
            needsLocationPermission = true
            locationTracker.requestLocationAuthorization()
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            return
        }

        needsLocationPermission = false
        stopLocationUpdates?()
        stopLocationUpdates = nil

        locationTracker.getCurrentFixSafe { [weak self] initial in
            DispatchQueue.main.async {
                guard let self, let initial else { return }
                self.maybePublish(position: initial)
            }
        }

        let kotlinStop = locationTracker.startUpdates { [weak self] fix in
            DispatchQueue.main.async {
                self?.maybePublish(position: fix)
            }
        }
        stopLocationUpdates = { _ = kotlinStop() }
    }

    private func stopGpsTracking() {
        stopLocationUpdates?()
        stopLocationUpdates = nil
        lastPublished = nil
        lastPublishedAtMs = nil
    }

    private func maybePublish(position: GpsPosition) {
        guard isLoggedIn, !sessionId.isEmpty, let facade else { return }

        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let shouldPublish = GpsPublishPolicy.shared.shouldPublish(
            position: position,
            lastPublished: lastPublished,
            lastPublishedAtMs: lastPublishedAtMs.map(KotlinLong.init),
            nowMs: now
        )
        guard shouldPublish else { return }

        facade.updatePositionSafe(sessionId: sessionId, position: position) { [weak self] errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                if let errorMessage {
                    self.gpsStatusLabel = "GPS: errore invio (\(errorMessage))"
                    return
                }
                self.lastPublished = position
                self.lastPublishedAtMs = now
                if let accuracy = position.accuracyMeters {
                    self.lastGpsAccuracyM = accuracy.doubleValue
                }
                self.gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(
                    accuracyM: position.accuracyMeters
                )
            }
        }
    }

    private struct SupabaseBundleConfig: Decodable {
        let supabaseUrl: String
        let supabaseAnonKey: String

        enum CodingKeys: String, CodingKey {
            case supabaseUrl = "SUPABASE_URL"
            case supabaseAnonKey = "SUPABASE_ANON_KEY"
        }
    }

    private var bundledSupabaseConfig: SupabaseBundleConfig? {
        guard let url = Bundle.main.url(forResource: "supabase-config", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let config = try? JSONDecoder().decode(SupabaseBundleConfig.self, from: data) else {
            return nil
        }
        return config
    }

    private var supabaseUrl: String? {
        if let bundled = bundledSupabaseConfig {
            let value = bundled.supabaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            guard Self.isValidSupabaseUrl(value) else { return nil }
            return value
        }
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        guard Self.isValidSupabaseUrl(value) else { return nil }
        return value
    }

    private var supabaseAnonKey: String? {
        if let bundled = bundledSupabaseConfig {
            let value = bundled.supabaseAnonKey.trimmingCharacters(in: .whitespacesAndNewlines)
            guard Self.isValidSupabaseAnonKey(value) else { return nil }
            return value
        }
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        guard Self.isValidSupabaseAnonKey(value) else { return nil }
        return value
    }

    private static func missingConfigMessage() -> String {
        "Manca dart-defines.json sul Mac. Copialo in gest_squadre/ poi: bash iosApp/sync-config.sh e rebuild."
    }

    private static func isValidSupabaseUrl(_ value: String) -> Bool {
        guard !value.isEmpty,
              !value.hasPrefix("$("),
              value != "https://YOUR-PROJECT-REF.supabase.co",
              value.hasPrefix("https://"),
              value.contains(".supabase.co"),
              URL(string: value) != nil else { return false }
        return true
    }

    private static func isValidSupabaseAnonKey(_ value: String) -> Bool {
        guard !value.isEmpty, !value.hasPrefix("$("), value != "YOUR_ANON_KEY" else { return false }
        return true
    }
}

enum SquadAlarmCopy {
    static let hint =
        "Segnalazione solo per la mappa TOC: cerchio rosso con nome squadra. Nessun SMS né notifica push."
    static let dialogTitle = "Segnala allarme su mappa TOC"
    static let dialogBody =
        "Confermi? Sul backend TOC la squadra apparirà con cerchio rosso fino a «Preso in carico»."
    static let sentOk = "Segnalazione inviata. Il TOC vede la squadra in rosso sulla mappa."
}
