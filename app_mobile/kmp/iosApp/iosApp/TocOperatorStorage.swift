import Foundation

/// Stesso formato di Android `TocOperatorStorage`.
final class TocOperatorStorage {
    private let defaults = UserDefaults.standard
    private let adminCodeKey = "toc_operator_admin_code"

    func saveRegisteredAdminCode(_ adminCode: String?) {
        guard let adminCode, !adminCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            defaults.removeObject(forKey: adminCodeKey)
            return
        }
        defaults.set(adminCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), forKey: adminCodeKey)
    }

    func registeredAdminCode() -> String? {
        guard let raw = defaults.string(forKey: adminCodeKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else {
            return nil
        }
        return raw
    }
}
