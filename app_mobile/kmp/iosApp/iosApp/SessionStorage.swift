import Foundation
import shared

/// Stesso formato pipe-separated di Android `SessionStorage`.
final class SessionStorage {
    private let defaults = UserDefaults.standard
    private let key = "gest_squadre_session_json"
    private let authMigrationKey = "kmp_auth_log_migration_v1"

    func save(_ session: SquadSession?) {
        guard let session else {
            defaults.removeObject(forKey: key)
            return
        }
        let raw = [
            session.sessionId,
            session.eventId,
            session.squadId,
            session.squadCode,
            session.squadName,
            String(describing: session.loginAt),
        ].joined(separator: "|")
        defaults.set(raw, forKey: key)
    }

    func loadSessionId() -> String? {
        guard let raw = defaults.string(forKey: key) else { return nil }
        let sessionId = raw.split(separator: "|", maxSplits: 1).first.map(String.init)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let sessionId, !sessionId.isEmpty else { return nil }
        return sessionId
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }

    func isAuthLogMigrationDone() -> Bool {
        defaults.bool(forKey: authMigrationKey)
    }

    func setAuthLogMigrationDone() {
        defaults.set(true, forKey: authMigrationKey)
    }
}
