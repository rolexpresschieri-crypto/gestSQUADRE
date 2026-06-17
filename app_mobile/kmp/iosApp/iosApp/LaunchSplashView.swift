import SwiftUI

struct LaunchSplashView: View {
    @State private var progress: CGFloat = 0

    var body: some View {
        ZStack {
            GlobalAppBackground()
            GeometryReader { geo in
                let logoScale = 0.34 + (0.68 * progress)
                let logoOffsetY = geo.size.height * (-0.37 + (0.18 * progress))

                OpenGolfLogoBanner(width: 286 * logoScale)
                    .position(x: geo.size.width / 2, y: logoOffsetY)

                Text("GESTIONE\nSQUADRE")
                    .font(.system(size: 44, weight: .black))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .shadow(color: .black, radius: 8, y: 2)
                    .opacity(titleAlpha)
                    .position(x: geo.size.width / 2, y: geo.size.height * 0.56)

                Text("by R. Ronco")
                    .font(.system(size: 18, weight: .regular))
                    .italic()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.black.opacity(0.42))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .opacity(signatureAlpha)
                    .position(x: geo.size.width - 72, y: geo.size.height - 52)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 4.3)) {
                progress = 1
            }
        }
    }

    private var titleAlpha: Double {
        if progress < 0.24 { return 0 }
        if progress > 0.9 { return 1 }
        return Double((progress - 0.24) / (0.9 - 0.24))
    }

    private var signatureAlpha: Double {
        if progress < 0.58 { return 0 }
        return Double((progress - 0.58) / (1 - 0.58))
    }
}
