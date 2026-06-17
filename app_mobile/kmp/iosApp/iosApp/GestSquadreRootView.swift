import SwiftUI
import shared

private enum AppScreen {
    case splash
    case home
    case login
    case map
}

struct GestSquadreRootView: View {
    @EnvironmentObject private var viewModel: SquadViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var screen: AppScreen = .splash
    @State private var toastMessage: String?
    @StateObject private var mapViewModelHolder = MapViewModelHolder()

    var body: some View {
        ZStack {
            if screen != .splash {
                GlobalAppBackground()
            }
            switch screen {
            case .splash:
                LaunchSplashView()
            case .home:
                HomeView(
                    viewModel: viewModel,
                    onNavigateLogin: { screen = .login },
                    onNavigateMap: {
                        if let facade = viewModel.facade {
                            mapViewModelHolder.ensure(facade: facade)
                            screen = .map
                        }
                    },
                    onShowMessage: showToast
                )
            case .login:
                LoginView(
                    viewModel: viewModel,
                    onBack: { screen = .home },
                    onLoginSuccess: { screen = .home },
                    onShowMessage: showToast
                )
            case .map:
                if let mapVM = mapViewModelHolder.model {
                    TocMapView(
                        mapViewModel: mapVM,
                        focusSessionId: viewModel.isLoggedIn ? viewModel.sessionId : nil,
                        onClose: { screen = .home }
                    )
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let toastMessage {
                Text(toastMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.75))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.bottom, 24)
                    .onTapGesture { self.toastMessage = nil }
            }
        }
        .task(id: screen) {
            guard screen == .splash else { return }
            try? await Task.sleep(nanoseconds: 5_500_000_000)
            if screen == .splash {
                screen = .home
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                if viewModel.isLoggedIn, viewModel.needsLocationPermission {
                    viewModel.onLocationPermissionGranted()
                }
                if viewModel.isLoggedIn, viewModel.needsNotificationPermission {
                    viewModel.onNotificationPermissionGranted()
                }
            }
        }
    }

    private func showToast(_ message: String) {
        toastMessage = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            if toastMessage == message {
                toastMessage = nil
            }
        }
    }
}

private final class MapViewModelHolder: ObservableObject {
    @Published var model: TocMapViewModel?

    func ensure(facade: GestSquadreFacade) {
        if model == nil {
            model = TocMapViewModel(facade: facade)
        }
    }
}
