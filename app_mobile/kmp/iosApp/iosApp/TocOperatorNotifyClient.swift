import Foundation
import UIKit

enum TocOperatorNotifyClient {
    private static let defaultBackendUrl = "https://gest-squadre.vercel.app"

    private struct AppBundleConfig: Decodable {
        let tocBackendUrl: String?

        enum CodingKeys: String, CodingKey {
            case tocBackendUrl = "TOC_BACKEND_URL"
        }
    }

    private static var backendBaseUrl: String {
        if let url = Bundle.main.url(forResource: "supabase-config", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let config = try? JSONDecoder().decode(AppBundleConfig.self, from: data),
           let value = config.tocBackendUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
           !value.isEmpty {
            return value.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        return defaultBackendUrl
    }

    static func registerOperatorFcm(
        adminCode: String,
        password: String,
        fcmToken: String,
        deviceLabel: String?,
        completion: @escaping (String?) -> Void
    ) {
        let base = backendBaseUrl
        guard !base.isEmpty else {
            completion("Configura TOC_BACKEND_URL in dart-defines.json.")
            return
        }
        guard let url = URL(string: "\(base)/api/register-toc-admin-fcm") else {
            completion("TOC_BACKEND_URL non valido.")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "adminCode": adminCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(),
            "password": password,
            "fcmToken": fcmToken,
            "deviceLabel": deviceLabel ?? UIDevice.current.model,
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
            completion("Errore preparazione richiesta.")
            return
        }
        request.httpBody = body

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                DispatchQueue.main.async {
                    completion(error.localizedDescription)
                }
                return
            }
            guard let http = response as? HTTPURLResponse else {
                DispatchQueue.main.async { completion("Risposta server non valida.") }
                return
            }
            let responseText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            if (200 ..< 300).contains(http.statusCode) {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let serverError = (try? JSONSerialization.jsonObject(with: Data(responseText.utf8)) as? [String: Any])?["error"] as? String
            let trimmedError = serverError?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let message = trimmedError.isEmpty
                ? "Registrazione fallita (\(http.statusCode))."
                : trimmedError
            DispatchQueue.main.async { completion(message) }
        }.resume()
    }
}
