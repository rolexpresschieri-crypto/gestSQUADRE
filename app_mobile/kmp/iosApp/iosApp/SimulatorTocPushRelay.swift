import Foundation

#if targetEnvironment(simulator)

// Sul simulatore FCM/APNs non sono affidabili: legge toc_push_logs e alarm_auto_notify_logs da Supabase.
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

    private struct TocPushLogRow: Decodable {
        let id: String
        let title: String
        let body: String
        let status: String
    }

    private struct AutoNotifyLogRow: Decodable {
        let id: String
        let pushTitle: String?
        let pushBody: String?
        let status: String

        enum CodingKeys: String, CodingKey {
            case id
            case pushTitle = "push_title"
            case pushBody = "push_body"
            case status
        }
    }

    private func pollOnce() {
        guard !sessionId.isEmpty,
              !supabaseUrl.isEmpty,
              !anonKey.isEmpty else { return }

        let group = DispatchGroup()
        var tocRows: [TocPushLogRow] = []
        var autoRows: [AutoNotifyLogRow] = []

        group.enter()
        fetchTocPushLogs { rows in
            tocRows = rows
            group.leave()
        }

        group.enter()
        fetchAutoNotifyLogs { rows in
            autoRows = rows
            group.leave()
        }

        group.notify(queue: .main) { [weak self] in
            self?.processRows(tocRows: tocRows, autoRows: autoRows)
        }
    }

    private func processRows(tocRows: [TocPushLogRow], autoRows: [AutoNotifyLogRow]) {
        var pending: [(id: String, title: String, body: String)] = []

        for row in tocRows where row.status == "sent" || row.status == "failed" {
            pending.append((id: "toc:\(row.id)", title: row.title, body: row.body))
        }

        for row in autoRows where row.status == "sent" {
            let title = row.pushTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let body = row.pushBody?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !title.isEmpty || !body.isEmpty else { continue }
            pending.append((id: "auto:\(row.id)", title: title, body: body))
        }

        if !baselineDone {
            for item in pending {
                deliveredIds.insert(item.id)
            }
            baselineDone = true
            return
        }

        for item in pending where !deliveredIds.contains(item.id) {
            deliveredIds.insert(item.id)
            deliver(title: item.title, body: item.body)
        }
    }

    private func fetchTocPushLogs(completion: @escaping ([TocPushLogRow]) -> Void) {
        guard let url = buildTocPushLogsUrl() else {
            completion([])
            return
        }
        fetch(url: url, completion: completion)
    }

    private func fetchAutoNotifyLogs(completion: @escaping ([AutoNotifyLogRow]) -> Void) {
        guard let url = buildAutoNotifyLogsUrl() else {
            completion([])
            return
        }
        fetch(url: url, completion: completion)
    }

    private func fetch<T: Decodable>(url: URL, completion: @escaping ([T]) -> Void) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let data,
                  let http = response as? HTTPURLResponse,
                  (200 ..< 300).contains(http.statusCode),
                  let rows = try? JSONDecoder().decode([T].self, from: data) else {
                completion([])
                return
            }
            completion(rows)
        }.resume()
    }

    private func buildTocPushLogsUrl() -> URL? {
        var components = URLComponents(string: "\(supabaseUrl)/rest/v1/toc_push_logs")
        components?.queryItems = [
            URLQueryItem(name: "select", value: "id,title,body,status"),
            URLQueryItem(name: "session_id", value: "eq.\(sessionId)"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "8"),
        ]
        return components?.url
    }

    private func buildAutoNotifyLogsUrl() -> URL? {
        var components = URLComponents(string: "\(supabaseUrl)/rest/v1/alarm_auto_notify_logs")
        components?.queryItems = [
            URLQueryItem(name: "select", value: "id,push_title,push_body,status"),
            URLQueryItem(name: "recipient_session_id", value: "eq.\(sessionId)"),
            URLQueryItem(name: "status", value: "eq.sent"),
            URLQueryItem(name: "mobile_dismissed_at", value: "is.null"),
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
            guard let message = TocMessageStorage.formatDisplayMessage(title: trimmedTitle, body: trimmedBody) else {
                return
            }
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
