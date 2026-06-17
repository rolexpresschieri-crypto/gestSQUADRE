import SwiftUI

enum TacticalColors {
    static let brandTint = Color(red: 0.65, green: 0.0, blue: 0.21)
    static let brandBase = Color(red: 0.04, green: 0.02, blue: 0.03)
    static let brandBackgroundAlpha: Double = 0.48

    static let frame = Color(red: 0.08, green: 0.16, blue: 0.36)
    static let green = Color(red: 0.03, green: 0.61, blue: 0.26)
    static let yellow = Color(red: 0.88, green: 0.75, blue: 0.23)
    static let alarmHighlightYellow = Color(red: 1.0, green: 1.0, blue: 0.0)
    static let red = Color(red: 0.78, green: 0.16, blue: 0.16)
    static let orange = Color(red: 1.0, green: 0.60, blue: 0.02)
    static let navy = Color(red: 0.10, green: 0.19, blue: 0.40)
    static let muted = Color(red: 0.54, green: 0.60, blue: 0.67)
    static let disabled = Color(red: 0.29, green: 0.33, blue: 0.41)
    static let gpsGood = Color(red: 0.56, green: 0.91, blue: 0.56)
    static let alarmDialogBg = Color(red: 0.10, green: 0.18, blue: 0.10)

    static let mapDefaultLat = 45.0703
    static let mapDefaultLng = 7.6869
}

struct GlobalAppBackground: View {
    var body: some View {
        ZStack {
            TacticalColors.brandBase.ignoresSafeArea()
            TacticalColors.brandTint.opacity(TacticalColors.brandBackgroundAlpha).ignoresSafeArea()
        }
    }
}

func gpsLabelColor(accuracyM: Double?) -> Color {
    guard let accuracyM, accuracyM > 0 else { return TacticalColors.yellow }
    if accuracyM <= 20 { return TacticalColors.gpsGood }
    if accuracyM <= 45 { return TacticalColors.yellow }
    return TacticalColors.red
}
