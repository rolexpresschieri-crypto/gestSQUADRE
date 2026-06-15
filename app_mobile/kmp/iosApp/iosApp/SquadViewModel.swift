import Foundation
import shared

@MainActor
final class SquadViewModel: ObservableObject {
    @Published var squadCode = ""
    @Published var password = ""
    @Published var statusMessage = "Inserisci codice squadra e password."
    @Published var isLoggedIn = false
    @Published var sessionLabel = ""
    @Published var sessionId = ""

    private let facade: GestSquadreFacade

    init() {
        let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String ?? ""
        let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? ""
        let config = GestSquadreConfig(supabaseUrl: url, supabaseAnonKey: key)
        facade = GestSquadreFacade(config: config)
    }

    var isConfigured: Bool {
        guard
            let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String
        else { return false }
        return !url.isEmpty && !key.isEmpty && url != "https://YOUR-PROJECT-REF.supabase.co"
    }

    func login() {
        guard isConfigured else {
            statusMessage = "Configura Supabase: esegui iosApp/sync-config.sh sul Mac."
            return
        }

        statusMessage = "Accesso in corso..."
        facade.loginSquad(squadCode: squadCode.trimmingCharacters(in: .whitespacesAndNewlines),
                          password: password) { [weak self] session, error in
            Task { @MainActor in
                guard let self else { return }
                if let error {
                    self.statusMessage = error.localizedDescription
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
        guard isLoggedIn, !sessionId.isEmpty else { return }
        let id = sessionId
        facade.logoutSquad(sessionId: id) { [weak self] error in
            Task { @MainActor in
                self?.isLoggedIn = false
                self?.sessionId = ""
                self?.sessionLabel = ""
                self?.statusMessage = error == nil ? "Disconnesso." : error!.localizedDescription
            }
        }
    }
}
