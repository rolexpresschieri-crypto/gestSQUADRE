import Foundation
import shared

/// Collega onNewToken (Firebase) alla sessione attiva dopo login.
final class FcmSessionRegistry {
    static let shared = FcmSessionRegistry()

    private var session: SquadSession?
    private var onToken: ((SquadSession, String) -> Void)?

    private init() {}

    func bind(session: SquadSession, onToken: @escaping (SquadSession, String) -> Void) {
        self.session = session
        self.onToken = onToken
    }

    func clear() {
        session = nil
        onToken = nil
    }

    func deliverNewToken(_ token: String) {
        guard let session, let onToken else { return }
        onToken(session, token)
    }
}
