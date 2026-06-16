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
