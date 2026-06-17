import SwiftUI

struct LaunchSplashView: View {
    @State private var progress: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let height = geo.size.height
            let width = geo.size.width
            let logoScale = 0.34 + (0.68 * progress)
            let logoAlignY = -0.74 + (0.36 * progress)
            let logoY = height * ((1 + logoAlignY) / 2)

            ZStack {
                GlobalAppBackground()

                OpenGolfLogoBanner(width: 286 * logoScale)
                    .position(x: width / 2, y: logoY)

                Text("GESTIONE\nSQUADRE")
                    .font(.system(size: 44, weight: .black))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .shadow(color: .black, radius: 8, y: 2)
                    .opacity(titleAlpha)
                    .position(x: width / 2, y: height / 2 + 123)

                Text("by R. Ronco")
                    .font(.system(size: 18, weight: .regular))
                    .italic()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.black.opacity(0.42))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .opacity(signatureAlpha)
                    .position(x: width - 72, y: height - 52)
            }
        }
        .ignoresSafeArea()
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
