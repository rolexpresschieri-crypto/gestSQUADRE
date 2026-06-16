import Foundation
import shared

final class SquadViewModel: ObservableObject {
    @Published var squadCode = ""
    @Published var password = ""
    @Published var statusMessage = "Inserisci codice squadra e password."
    @Published var isLoggedIn = false
    @Published var sessionLabel = ""
    @Published var sessionId = ""

    private var facade: GestSquadreFacade?

    init() {
        guard let url = supabaseUrl, let key = supabaseAnonKey else {
            statusMessage = "Configura Supabase: esegui iosApp/sync-config.sh sul Mac."
            return
        }
        let config = GestSquadreConfig(supabaseUrl: url, supabaseAnonKey: key)
        facade = GestSquadreFacade(config: config)
    }

    var isConfigured: Bool {
        supabaseUrl != nil && supabaseAnonKey != nil
    }

    private var supabaseUrl: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty,
              !value.hasPrefix("$("),
              value != "https://YOUR-PROJECT-REF.supabase.co" else { return nil }
        return value
    }

    private var supabaseAnonKey: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !value.hasPrefix("$("), value != "YOUR_ANON_KEY" else { return nil }
        return value
    }

    func login() {
        guard let facade else {
            statusMessage = "Configura Supabase: esegui iosApp/sync-config.sh sul Mac."
            return
        }

        statusMessage = "Accesso in corso..."
        facade.loginSquadSafe(
            squadCode: squadCode.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password
        ) { [weak self] session, errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                if let errorMessage {
                    self.statusMessage = errorMessage
                    self.isLoggedIn = false
                    return
                }
                guard let session else {
                    self.statusMessage = "Login fallito."
                    self.isLoggedIn = false
                    return
                }
                self.isLoggedIn = true
                self.sessionId = session.sessionId
                self.sessionLabel = "\(session.squadCode) — \(session.squadName)"
                self.statusMessage = "Connesso. I dati vanno su Supabase (TOC Windows li vede subito)."
            }
        }
    }

    func logout() {
        guard isLoggedIn, !sessionId.isEmpty, let facade else { return }
        let id = sessionId
        facade.logoutSquadSafe(sessionId: id) { [weak self] errorMessage in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isLoggedIn = false
                self.sessionId = ""
                self.sessionLabel = ""
                self.statusMessage = errorMessage ?? "Disconnesso."
            }
        }
    }
}
