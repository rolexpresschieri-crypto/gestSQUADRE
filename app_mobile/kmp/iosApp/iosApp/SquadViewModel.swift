import CoreLocation
import Foundation
import shared

final class SquadViewModel: ObservableObject {
    @Published var squadCode = ""
    @Published var password = ""
    @Published var statusMessage = "Inserisci codice squadra e password."
    @Published var loginBlockingMessage: String?
    @Published var isLoggedIn = false
    @Published var sessionLabel = ""
    @Published var sessionId = ""
    @Published var gpsStatusLabel: String?
    @Published var needsLocationPermission = false
    @Published var showAlarmSheet = false
    @Published var isAlarmBusy = false

    private var facade: GestSquadreFacade?
    private var session: SquadSession?
    private let locationTracker = LocationTracker(platformContext: NSObject())
    private var stopLocationUpdates: (() -> Void)?
    private var lastPublished: GpsPosition?
    private var lastPublishedAtMs: Int64?

    init() {
        guard let url = supabaseUrl, let key = supabaseAnonKey else {
            statusMessage = Self.missingConfigMessage()
            return
        }
        let config = GestSquadreConfig(supabaseUrl: url, supabaseAnonKey: key)
        facade = GestSquadreFacade(config: config)
    }

    var isConfigured: Bool {
        supabaseUrl != nil && supabaseAnonKey != nil
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

    func login() {
        guard let facade else {
            statusMessage = Self.missingConfigMessage()
            return
        }

        statusMessage = "Accesso in corso..."
        loginBlockingMessage = nil
        facade.loginSquadSafe(
            squadCode: squadCode.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password
        ) { [weak self] session, errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                if let errorMessage {
                    self.statusMessage = errorMessage
                    self.isLoggedIn = false
                    if errorMessage == GestSquadreMessages.shared.SQUAD_ALREADY_ACTIVE {
                        self.loginBlockingMessage = errorMessage
                    }
                    return
                }
                guard let session else {
                    self.statusMessage = "Login fallito."
                    self.isLoggedIn = false
                    return
                }
                self.isLoggedIn = true
                self.session = session
                self.sessionId = session.sessionId
                self.sessionLabel = "\(session.squadName) + \(session.loginTimeLabel())"
                self.statusMessage = "Connesso. I dati vanno su Supabase (TOC Windows li vede subito)."
                self.gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
                self.startGpsTracking()
            }
        }
    }

    func logout() {
        guard isLoggedIn, let facade, let session else { return }
        stopGpsTracking()
        facade.logoutSquadSafe(session: session) { [weak self] errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isLoggedIn = false
                self.session = nil
                self.sessionId = ""
                self.sessionLabel = ""
                self.gpsStatusLabel = nil
                self.needsLocationPermission = false
                self.statusMessage = errorMessage ?? "Log-out completato."
            }
        }
    }

    func onLocationPermissionGranted() {
        guard locationTracker.hasLocationPermission() else { return }
        needsLocationPermission = false
        startGpsTracking()
    }

    func sendAlarm(
        ambulanza: Bool,
        medico: Bool,
        dae: Bool,
        forzeOrdine: Bool,
        vvf: Bool,
        altro: Bool,
        otherDetail: String,
        onComplete: @escaping (String?) -> Void
    ) {
        guard let facade, let session else {
            onComplete("Sessione non attiva.")
            return
        }

        let request = facade.makeSquadAlarmRequest(
            ambulanza: ambulanza,
            medico: medico,
            dae: dae,
            forzeOrdine: forzeOrdine,
            vvf: vvf,
            altro: altro,
            otherDetail: otherDetail
        )

        if let validationError = request.validate() {
            onComplete(validationError)
            return
        }

        isAlarmBusy = true
        facade.sendAlarmSafe(session: session, request: request) { [weak self] (errorMessage: String?) in
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                isAlarmBusy = false
                if let errorMessage {
                    onComplete(errorMessage)
                    return
                }
                showAlarmSheet = false
                let detail = request.toLogMessage()
                statusMessage = "\(SquadAlarmCopy.sentOk) \(detail)"
                onComplete(nil)
            }
        }
    }

    private func startGpsTracking() {
        guard isLoggedIn, !sessionId.isEmpty, facade != nil else { return }

        if !locationTracker.isLocationServiceEnabled() {
            gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(accuracyM: nil)
            statusMessage = "Attiva il GPS sul telefono per inviare la posizione al TOC."
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
                self.gpsStatusLabel = GpsPublishPolicy.shared.accuracyLabel(
                    accuracyM: position.accuracyMeters
                )
            }
        }
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
