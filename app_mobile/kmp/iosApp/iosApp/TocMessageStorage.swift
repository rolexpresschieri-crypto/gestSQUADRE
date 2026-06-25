import Foundation

/// Ultimo messaggio TOC nel pannello blu (sopravvive a chiusura app).
final class TocMessageStorage {
    static let shared = TocMessageStorage()

    private let defaults = UserDefaults.standard
    private let key = "last_toc_message"

    private init() {}

    func save(message: String) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            clear()
            return
        }
        defaults.set(trimmed, forKey: key)
    }

    func load() -> String? {
        let raw = defaults.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return raw.isEmpty ? nil : raw
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }

    static func formatDisplayMessage(title: String, body: String) -> String? {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let b = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty && b.isEmpty { return nil }
        return b.isEmpty ? t : "\(t): \(b)"
    }
}
