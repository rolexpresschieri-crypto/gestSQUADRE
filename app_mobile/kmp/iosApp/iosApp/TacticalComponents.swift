import SwiftUI

struct TacticalShell<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity)
            .background(Color.clear)
            .overlay {
                RoundedRectangle(cornerRadius: 42, style: .continuous)
                    .stroke(TacticalColors.frame, lineWidth: 3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
    }
}

struct MainButton: View {
    let label: String
    let backgroundColor: Color
    let foregroundColor: Color
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(foregroundColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(backgroundColor)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.92)
    }
}

struct OpenGolfLogoBanner: View {
    var width: CGFloat?

    var body: some View {
        Group {
            if let uiImage = UIImage(named: "logo_open_golf_2026") {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 7)
            } else {
                Text("Open d'Italia 2026")
                    .font(.headline.bold())
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            }
        }
        .frame(width: width)
        .frame(maxWidth: width == nil ? .infinity : nil)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.25), radius: 6, y: 2)
    }
}

struct AppTitleBlock: View {
    var body: some View {
        VStack(spacing: 0) {
            OpenGolfLogoBanner()
            Text("Tracking")
                .font(.system(size: 32, weight: .heavy))
                .foregroundStyle(.white)
                .shadow(color: .black, radius: 4, y: 1)
                .padding(.top, 18)
            Text("SQUADRE")
                .font(.system(size: 36, weight: .black))
                .foregroundStyle(.white)
                .shadow(color: .black, radius: 4, y: 1)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
    }
}

struct TacticalTitleText: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 24, weight: .heavy))
            .foregroundStyle(.white)
            .shadow(color: .black, radius: 4, y: 1)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }
}

struct TacticalBodyText: View {
    let text: String
    var fontSize: CGFloat = 14
    var color: Color = .white

    var body: some View {
        Text(text)
            .font(.system(size: fontSize, weight: .semibold))
            .foregroundStyle(color)
            .shadow(color: .black.opacity(0.8), radius: 3, y: 1)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }
}

struct TocNotificationPanel: View {
    let message: String?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(TacticalColors.navy)
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.28), lineWidth: 1)
                }
            if let message, !message.isEmpty {
                Text(message)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
            }
        }
        .frame(minHeight: 72)
        .frame(maxWidth: .infinity)
    }
}

struct SquadBlockingAlert: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(TacticalColors.red)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
