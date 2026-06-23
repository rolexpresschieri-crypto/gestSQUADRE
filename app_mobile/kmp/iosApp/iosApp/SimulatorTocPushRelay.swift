import Foundation

#if targetEnvironment(simulator)

// Sul simulatore FCM/APNs non sono affidabili: legge toc_push_logs da Supabase.
final class SimulatorTocPushRelay {
    static let shared = SimulatorTocPushRelay()

    private var timer: Timer?
    private var sessionId = ""
    private var supabaseUrl = ""
    private var anonKey = ""
    private var baselineDone = false
    private var deliveredIds = Set<String>()

    private init() {}

    func start(sessionId: String, supabaseUrl: String, anonKey: String) {
        stop()
        self.sessionId = sessionId
        self.supabaseUrl = supabaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        self.anonKey = anonKey.trimmingCharacters(in: .whitespacesAndNewlines)
        baselineDone = false
        deliveredIds.removeAll()
        pollOnce()
        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
            self?.pollOnce()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        sessionId = ""
        baselineDone = false
        deliveredIds.removeAll()
    }

    private struct PushLogRow: Decodable {
        let id: String
        let title: String
        let body: String
        let status: String

        enum CodingKeys: String, CodingKey {
            case id
            case title
            case body
            case status
        }
    }

    private func pollOnce() {
        guard !sessionId.isEmpty,
              !supabaseUrl.isEmpty,
              !anonKey.isEmpty,
              let url = buildRequestUrl() else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let self,
                  let data,
                  let http = response as? HTTPURLResponse,
                  (200 ..< 300).contains(http.statusCode),
                  let rows = try? JSONDecoder().decode([PushLogRow].self, from: data) else {
                return
            }

            let relevant = rows.filter { $0.status == "sent" || $0.status == "failed" }

            if !self.baselineDone {
                for row in relevant {
                    self.deliveredIds.insert(row.id)
                }
                self.baselineDone = true
                return
            }

            for row in relevant where !self.deliveredIds.contains(row.id) {
                self.deliveredIds.insert(row.id)
                self.deliver(title: row.title, body: row.body)
            }
        }.resume()
    }

    private func buildRequestUrl() -> URL? {
        var components = URLComponents(string: "\(supabaseUrl)/rest/v1/toc_push_logs")
        components?.queryItems = [
            URLQueryItem(name: "select", value: "id,title,body,status"),
            URLQueryItem(name: "session_id", value: "eq.\(sessionId)"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "8"),
        ]
        return components?.url
    }

    private func deliver(title: String, body: String) {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = "TOC - ALLARME"
        DispatchQueue.main.async {
            let message = TocMessageStorage.formatDisplayMessage(title: trimmedTitle, body: trimmedBody)
            TocMessageStorage.shared.save(message: message)
            FcmPushBus.emit(title: trimmedTitle, body: trimmedBody)
            FcmManager.shared.showLocalNotification(
                title: trimmedTitle.isEmpty ? fallbackTitle : trimmedTitle,
                body: trimmedBody,
                isAlarm: true
            )
        }
    }
}

#endif
