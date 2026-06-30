import SwiftUI
import UIKit
import shared

final class SquadViewModel: ObservableObject {
    @Published var squadCode = ""
    @Published var password = ""
    @Published var statusMessage = ""
    @Published var loginBlockingMessage: String?
    @Published var bannerMessage: String?
    @Published var bannerAlert = false
    @Published var lastTocMessage: String?
    @Published var isLoggedIn = false
    @Published var isBusy = false
    @Published var isInitializing = true
    @Published var sessionLabel = ""
    @Published var sessionId = ""
    @Published var gpsStatusLabel: String?
    @Published var lastGpsAccuracyM: Double?
    @Published var needsLocationPermission = false
    @Published var needsBackgroundLocationPermission = false
    @Published var needsNotificationPermission = false
    @Published var pushStatusLabel: String?
    @Published var pushStatusOk = false
    @Published var tocOperatorAdminCode: String?
    @Published var showAlarmSheet = false
    @Published var isAlarmBusy = false
    @Published var fieldPhotoQueueCount = 0

    private(set) var facade: GestSquadreFacade?
    private var session: SquadSession?
    private let fieldPhotoQueue = FieldPhotoUploadQueue.shared
    private var fieldPhotoQueueProcessing = false
    private let locationTracker = LocationTracker(platformContext: NSObject())
    private let sessionStorage = SessionStorage()
    private let tocOperatorStorage = TocOperatorStorage()
    private var stopLocationUpdates: (() -> Void)?
    private var gpsHeartbeatTimer: Timer?
    private var lastPublished: GpsPosition?
    private var lastPublishedAtMs: Int64?
    private var sessionWatchTimer: Timer?
    private var pushWatchTimer: Timer?
    private var bannerClearWorkItem: DispatchWorkItem?
    private var backgroundLocationPromptPending = false

    init() {
        guard let url = supabaseUrl, let key = supabaseAnonKey else {
            statusMessage = Self.missingConfigMessage()
            isInitializing = false
            return
        }
        let tocUrl = tocBackendUrl ?? ""
        let config = GestSquadreConfig(supabaseUrl: url, supabaseAnonKey: key, tocBackendUrl: tocUrl)
        facade = GestSquadreFacade(config: config)
        tocOperatorAdminCode = tocOperatorStorage.registeredAdminCode()
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
        let session = self.session
        let panelMessage = lastTocMessage
        TocMessageStorage.shared.clear()
        lastTocMessage = nil
        guard let session, let facade else { return }
        facade.dismissTocNotificationSafe(session: session, panelMessage: panelMessage) { _ in }
    }

    func registerTocOperatorNotify(
        adminCode: String,
        password: String,
        onComplete: @escaping (String?) -> Void
    ) {
        let code = adminCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let pwd = password.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty, !pwd.isEmpty else {
            onComplete("Inserisci codice operatore e password TOC.")
            return
        }
        guard FcmManager.shared.isConfigured else {
            onComplete("Push disabilitata: configura FIREBASE_* in dart-defines.json.")
            return
        }

        isBusy = true
        FcmManager.shared.configureIfNeeded()
        FcmManager.shared.hasNotificationPermission { [weak self] granted in
            guard let self else { return }
            if !granted {
                self.needsNotificationPermission = true
                FcmManager.shared.requestNotificationPermission { _ in }
            }
            FcmManager.shared.fetchFcmToken { token, errorMessage in
                DispatchQueue.main.async {
                    guard let token, errorMessage == nil else {
                        self.isBusy = false
                        onComplete(errorMessage ?? "Token push non ottenuto. Verifica Firebase e notifiche.")
                        return
                    }
                    TocOperatorNotifyClient.registerOperatorFcm(
                        adminCode: code,
                        password: pwd,
                        fcmToken: token,
                        deviceLabel: UIDevice.current.model
                    ) { err in
                        DispatchQueue.main.async {
                            self.isBusy = false
                            if let err {
                                onComplete(err)
                                return
                            }
                            self.tocOperatorStorage.saveRegisteredAdminCode(code)
                            self.tocOperatorAdminCode = code
                            onComplete(nil)
                        }
                    }
                }
            }
        }
    }

    func onLocationPermissionGranted() {
        if locationTracker.isLocationPermissionDenied() {
            needsLocationPermission = false
            bannerMessage = "Permesso posizione negato: abilitalo per gestSQUADRE."
            bannerAlert = false
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            return
        }
        guard locationTracker.hasLocationPermission() else { return }
        needsLocationPermission = false
        if locationTracker.shouldPromptBackgroundLocation() {
            needsBackgroundLocationPermission = true
            backgroundLocationPromptPending = true
            locationTracker.requestBackgroundLocationAuthorization()
        }
        startGpsTracking()
    }

    func onBackgroundLocationPermissionGranted() {
        needsBackgroundLocationPermission = false
        startGpsTracking()
    }

    func requestBackgroundLocationPermission() {
        guard isLoggedIn, locationTracker.hasLocationPermission() else { return }
        needsBackgroundLocationPermission = true
        backgroundLocationPromptPending = true
        locationTracker.requestBackgroundLocationAuthorization()
    }

    func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func syncBackgroundPermissionFromSettings() {
        if needsBackgroundLocationPermission, locationTracker.hasBackgroundLocationPermission() {
            onBackgroundLocationPermissionGranted()
            backgroundLocationPromptPending = false
            return
        }
        if backgroundLocationPromptPending,
           locationTracker.hasLocationPermission(),
           !locationTracker.hasBackgroundLocationPermission() {
            backgroundLocationPromptPending = false
            bannerMessage =
                "Per il tracking in tasca scegli «Consenti sempre» per la posizione " +
                "(Impostazioni → gestSQUADRE → Posizione)."
            bannerAlert = false
        }
    }

    func onNotificationPermissionGranted() {
        FcmManager.shared.hasNotificationPermission { [weak self] granted in
            guard let self else { return }
            self.needsNotificationPermission = !granted
            if !granted {
                self.bannerMessage =
                    "Notifiche disabilitate: abilitale in Impostazioni per vedere gli allarmi sul telefono."
                self.bannerAlert = false
                return
            }
            guard let facade, let session = self.session else { return }
            self.registerFcmForSession(session, facade: facade)
        }
    }

    func retryPushRegistration() {
        guard let facade, let session else { return }
        registerFcmForSession(session, facade: facade)
    }

    /// App tornata in primo piano: ripristina stream GPS (come Android onAppResumed).
    func onAppResumed() {
        guard isLoggedIn, session != nil else { return }
        startGpsTracking()
        locationTracker.getCurrentFixSafe { [weak self] fix in
            DispatchQueue.main.async {
                guard let self, let fix else { return }
                self.maybePublish(position: fix)
            }
        }
        retryPushRegistration()
        processFieldPhotoQueue()
    }

    func sendFieldPhoto(
        jpegData: Data,
        note: String?,
        onComplete: @escaping (String?) -> Void
    ) {
        guard let session else {
            onComplete("Sessione non attiva.")
            return
        }

        isBusy = true
        let compressed = FieldPhotoCompressor.compressJpeg(jpegData)
        locationTracker.getCurrentFixSafe { [weak self] fix in
            guard let self else { return }
            DispatchQueue.main.async {
                guard let fix else {
                    self.isBusy = false
                    onComplete("GPS obbligatorio: attendi fix o abilita la posizione.")
                    return
                }
                self.uploadFieldPhotoNow(
                    sessionId: session.sessionId,
                    latitude: fix.latitude,
                    longitude: fix.longitude,
                    accuracyM: fix.accuracyMeters?.doubleValue,
                    note: note,
                    jpegData: compressed
                ) { message in
                    self.isBusy = false
                    self.fieldPhotoQueueCount = self.fieldPhotoQueue.pendingCount()
                    onComplete(message)
                }
            }
        }
    }

    func processFieldPhotoQueue() {
        guard let session, isLoggedIn, !fieldPhotoQueueProcessing else { return }
        fieldPhotoQueueProcessing = true

        func processNext(_ items: [PendingFieldPhoto]) {
            guard let item = items.first else {
                DispatchQueue.main.async {
                    self.fieldPhotoQueueProcessing = false
                    self.fieldPhotoQueueCount = self.fieldPhotoQueue.pendingCount()
                }
                return
            }
            guard item.sessionId == session.sessionId,
                  let bytes = fieldPhotoQueue.readJpeg(item: item) else {
                fieldPhotoQueue.remove(item: item)
                processNext(Array(items.dropFirst()))
                return
            }

            FieldPhotoUploadClient.upload(
                sessionId: item.sessionId,
                latitude: item.latitude,
                longitude: item.longitude,
                accuracyM: item.accuracyM,
                note: item.note,
                jpegData: bytes
            ) { [weak self] result in
                guard let self else { return }
                switch result {
                case .success:
                    self.fieldPhotoQueue.remove(item: item)
                    processNext(Array(items.dropFirst()))
                case .networkError:
                    DispatchQueue.main.async {
                        self.fieldPhotoQueueProcessing = false
                        self.fieldPhotoQueueCount = self.fieldPhotoQueue.pendingCount()
                    }
                case .permanentError:
                    self.fieldPhotoQueue.remove(item: item)
                    processNext(Array(items.dropFirst()))
                }
            }
        }

        processNext(fieldPhotoQueue.listPending())
    }

    private func uploadFieldPhotoNow(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegData: Data,
        onComplete: @escaping (String?) -> Void
    ) {
        FieldPhotoUploadClient.upload(
            sessionId: sessionId,
            latitude: latitude,
            longitude: longitude,
            accuracyM: accuracyM,
            note: note,
            jpegData: jpegData
        ) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.processFieldPhotoQueue()
                onComplete(nil)
            case .networkError:
                _ = self.fieldPhotoQueue.enqueue(
                    sessionId: sessionId,
                    latitude: latitude,
                    longitude: longitude,
                    accuracyM: accuracyM,
                    note: note,
                    jpegData: jpegData
                )
                onComplete("Rete assente: foto in coda, invio automatico al ripristino.")
            case .permanentError(let message):
                onComplete(message)
            }
        }
    }

    var canOpenOperationalEvent: Bool {
        session?.canOpenOperationalEvent ?? false
    }

    func openOperationalEvent(onComplete: @escaping (String?) -> Void) {
        guard let session, let facade else {
            onComplete("Sessione non attiva.")
            return
        }
        if !facade.canOpenOperationalEvent(session: session) {
            showTemporaryBanner(facade.operationalEventUnauthorizedMessage())
            onComplete(facade.operationalEventUnauthorizedMessage())
            return
        }
        isBusy = true
        facade.openOperationalEventFromFieldSafe(session: session) { [weak self] number, err in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isBusy = false
                if let err {
                    onComplete(err)
                    return
                }
                if let number {
                    self.showTemporaryBanner("EVENTO OPERATIVO n° \(number) aperto.")
                }
                onComplete(nil)
            }
        }
    }

    private func showTemporaryBanner(_ message: String) {
        bannerClearWorkItem?.cancel()
        bannerMessage = message
        bannerAlert = true
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if self.bannerMessage == message {
                self.bannerMessage = nil
                self.bannerAlert = false
            }
        }
        bannerClearWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
    }

    func sendAlarm(
        sanitario: Bool,
        security: Bool,
        vigiliFuoco: Bool,
        strutture: Bool,
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
            strutture: strutture,
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
        bannerAlert = false
        gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
        lastGpsAccuracyM = nil
        let localPanel = TocMessageStorage.shared.load()
        lastTocMessage = localPanel
        startGpsTracking()
        startSessionWatchdog()
        syncActivePanelMessage(session: session)
        setupPushForSession(session)
        startSimulatorPushRelayIfNeeded(session: session)
        fieldPhotoQueueCount = fieldPhotoQueue.pendingCount()
        processFieldPhotoQueue()
    }

    private func syncActivePanelMessage(session: SquadSession) {
        guard let facade else { return }
        facade.fetchActivePanelMessageSafe(session: session) { [weak self] serverPanel, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if let serverPanel {
                    if self.lastTocMessage != serverPanel {
                        TocMessageStorage.shared.save(message: serverPanel)
                        self.lastTocMessage = serverPanel
                    }
                } else if self.lastTocMessage != nil {
                    TocMessageStorage.shared.clear()
                    self.lastTocMessage = nil
                }
            }
        }
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
                    FcmManager.shared.requestNotificationPermission { [weak self] allowed in
                        guard let self else { return }
                        if !allowed {
                            self.bannerMessage =
                                "Notifiche disabilitate: abilitale in Impostazioni per vedere gli allarmi sul telefono."
                            self.bannerAlert = false
                        } else {
                            self.needsNotificationPermission = false
                        }
                        self.registerFcmForSession(session, facade: facade)
                    }
                } else {
                    self.needsNotificationPermission = false
                    self.registerFcmForSession(session, facade: facade)
                }
            }
        } else {
            pushStatusLabel = "Push TOC disabilitata (Firebase iOS non configurato)."
            pushStatusOk = false
            bannerMessage = "Push TOC disabilitata: aggiungi FIREBASE_IOS_* in dart-defines.json."
            bannerAlert = false
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
                self.bannerMessage = err
            } else {
                self.pushStatusLabel = "Push TOC: attiva (il server può inviarti allarmi)."
                self.pushStatusOk = true
                if let msg = self.bannerMessage {
                    let lower = msg.lowercased()
                    if lower.contains("token push") || lower.contains("push toc") || lower.contains("notifiche") {
                        self.bannerMessage = nil
                    }
                }
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
            guard let message = TocMessageStorage.formatDisplayMessage(title: title, body: body) else { return }
            TocMessageStorage.shared.save(message: message)
            self.lastTocMessage = message
        }
        NotificationCenter.default.addObserver(
            forName: FcmPushBus.panelCleared,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            TocMessageStorage.shared.clear()
            self.lastTocMessage = nil
            if !self.sessionId.isEmpty {
                RouteRefreshBus.emitCleared(sessionId: self.sessionId)
            }
        }
    }

    private func clearLocalSession() {
        stopSimulatorPushRelay()
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
        TocMessageStorage.shared.clear()
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
                    if let session = self.session {
                        self.syncActivePanelMessage(session: session)
                    }
                    if self.lastTocMessage != nil {
                        facade.isTocPanelClosedByTocSafe(sessionId: self.sessionId) { closed, _ in
                            DispatchQueue.main.async {
                                if closed.boolValue {
                                    TocMessageStorage.shared.clear()
                                    self.lastTocMessage = nil
                                    RouteRefreshBus.emitCleared(sessionId: self.sessionId)
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
        stopSimulatorPushRelay()
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
        TocMessageStorage.shared.clear()
        lastTocMessage = nil
        bannerMessage = "Logout effettuato dal TOC."
        bannerAlert = false
    }

    private func startGpsTracking() {
        guard isLoggedIn, !sessionId.isEmpty, facade != nil else { return }

        if !locationTracker.isLocationServiceEnabled() {
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            bannerMessage = "Attiva il GPS sul telefono per inviare la posizione al TOC."
            bannerAlert = false
            return
        }

        if !locationTracker.hasLocationPermission() {
            if locationTracker.isLocationPermissionDenied() {
                needsLocationPermission = false
                bannerMessage = "Permesso posizione negato: abilitalo per gestSQUADRE."
                bannerAlert = false
                gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
                return
            }
            needsLocationPermission = true
            locationTracker.requestLocationAuthorization()
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            return
        }

        needsLocationPermission = false
        if locationTracker.shouldPromptBackgroundLocation() {
            needsBackgroundLocationPermission = true
            backgroundLocationPromptPending = true
            locationTracker.requestBackgroundLocationAuthorization()
        }

        stopGpsHeartbeat()
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
        startGpsHeartbeat()
    }

    private func startGpsHeartbeat() {
        stopGpsHeartbeat()
        let interval = TimeInterval(GpsPublishPolicy.shared.MAP_REFRESH_INTERVAL_MS) / 1000.0
        gpsHeartbeatTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self, self.isLoggedIn, !self.sessionId.isEmpty else { return }
            guard self.locationTracker.hasLocationPermission() else { return }
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            if let lastAt = self.lastPublishedAtMs,
               now - lastAt < GpsPublishPolicy.shared.MAP_REFRESH_INTERVAL_MS {
                return
            }
            self.locationTracker.getCurrentFixSafe { [weak self] fix in
                DispatchQueue.main.async {
                    guard let self, let fix else { return }
                    self.maybePublish(position: fix)
                }
            }
        }
    }

    private func stopGpsHeartbeat() {
        gpsHeartbeatTimer?.invalidate()
        gpsHeartbeatTimer = nil
    }

    private func stopGpsTracking() {
        stopGpsHeartbeat()
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
                self.bannerMessage = nil
                self.bannerAlert = false
            }
        }
    }

    private func startSimulatorPushRelayIfNeeded(session: SquadSession) {
        #if targetEnvironment(simulator)
        guard let url = supabaseUrl, let key = supabaseAnonKey else { return }
        SimulatorTocPushRelay.shared.start(
            sessionId: session.sessionId,
            supabaseUrl: url,
            anonKey: key
        )
        #endif
    }

    private func stopSimulatorPushRelay() {
        #if targetEnvironment(simulator)
        SimulatorTocPushRelay.shared.stop()
        #endif
    }

    private struct SupabaseBundleConfig: Decodable {
        let supabaseUrl: String
        let supabaseAnonKey: String
        let tocBackendUrl: String?

        enum CodingKeys: String, CodingKey {
            case supabaseUrl = "SUPABASE_URL"
            case supabaseAnonKey = "SUPABASE_ANON_KEY"
            case tocBackendUrl = "TOC_BACKEND_URL"
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

    private var tocBackendUrl: String? {
        if let bundled = bundledSupabaseConfig,
           let raw = bundled.tocBackendUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty,
           !raw.hasPrefix("$(") {
            return raw
        }
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "TOC_BACKEND_URL") as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        guard !value.isEmpty, !value.hasPrefix("$(") else { return nil }
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
        "Notifica al TOC con le stesse categorie dell'app (Sanitario, Security, VVF, Strutture, Altro)."
    static let dialogTitle = "Invia notifica a TOC"
    static let dialogBody =
        "Confermi l'invio della notifica al TOC? La squadra può apparire evidenziata sulla mappa."
    static let sentOk = "Notifica inviata al TOC."
}
