import Foundation

enum AppBuildInfo {
    static var label: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "iOS \(version) (\(build))"
    }
}
