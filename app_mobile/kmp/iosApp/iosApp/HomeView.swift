import SwiftUI

private struct ContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct ViewportHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct HomeView: View {
    @ObservedObject var viewModel: SquadViewModel
    let onNavigateLogin: () -> Void
    let onNavigateMap: () -> Void
    let onNavigateTocOperator: () -> Void
    let onShowMessage: (String) -> Void

    @State private var showAlarmSheet = false
    @State private var showScrollHint = false
    @State private var measuredContentHeight: CGFloat = 0
    @State private var measuredViewportHeight: CGFloat = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                TacticalShell {
                    VStack(spacing: 0) {
                        AppTitleBlock()
                            .padding(.bottom, 24)

                        if let banner = viewModel.bannerMessage, !banner.isEmpty {
                            TacticalBodyText(text: banner)
                                .padding(.bottom, 12)
                        }

                        TocNotificationPanel(message: viewModel.lastTocMessage)
                            .padding(.bottom, 12)

                        TacticalBodyText(
                            text: "Reset notifica: solo sul telefono (registrato su log). La chiusura evento è solo dal TOC.",
                            fontSize: 12
                        )
                        .padding(.bottom, 8)

                        MainButton(
                            label: "Reset notifica",
                            backgroundColor: TacticalColors.navy,
                            foregroundColor: .white,
                            enabled: true,
                            action: { viewModel.clearLastTocMessage() }
                        )
                        .padding(.bottom, 20)

                        squadBox
                        loggedInDetails
                        busyIndicator

                        MainButton(
                            label: "Log-in",
                            backgroundColor: viewModel.isLoggedIn ? TacticalColors.disabled : TacticalColors.green,
                            foregroundColor: viewModel.isLoggedIn ? TacticalColors.muted : .white,
                            enabled: !viewModel.isLoggedIn && !viewModel.isBusy && !viewModel.isInitializing,
                            action: onNavigateLogin
                        )
                        .padding(.top, 18)

                        MainButton(
                            label: "Log-out",
                            backgroundColor: viewModel.isLoggedIn ? TacticalColors.orange : TacticalColors.disabled,
                            foregroundColor: viewModel.isLoggedIn ? .white : TacticalColors.muted,
                            enabled: viewModel.isLoggedIn && !viewModel.isBusy,
                            action: {
                                viewModel.logout { err in
                                    if let err { onShowMessage(err) }
                                }
                            }
                        )
                        .padding(.top, 18)

                        MainButton(
                            label: "INVIA ALLARME A TOC",
                            backgroundColor: viewModel.isLoggedIn ? TacticalColors.red : TacticalColors.disabled,
                            foregroundColor: viewModel.isLoggedIn ? .white : TacticalColors.muted,
                            enabled: viewModel.isLoggedIn && !viewModel.isBusy,
                            action: { showAlarmSheet = true }
                        )
                        .padding(.top, 18)

                        MainButton(
                            label: "Tactical Operations Center",
                            backgroundColor: TacticalColors.yellow,
                            foregroundColor: .black,
                            enabled: !viewModel.isBusy && !viewModel.isInitializing && viewModel.isConfigured,
                            action: {
                                if viewModel.isConfigured {
                                    onNavigateMap()
                                } else {
                                    onShowMessage("Mappa TOC: configura SUPABASE_* in dart-defines.json.")
                                }
                            }
                        )
                        .padding(.top, 18)

                        TacticalBodyText(
                            text: "Squadre FIG/Sanitari (GT_*): login squadra = mappa, allarmi e push automatici",
                            fontSize: 12,
                            color: Color.white.opacity(0.78)
                        )
                        .multilineTextAlignment(.center)
                        .padding(.top, 14)
                        .padding(.horizontal, 8)

                        Button {
                            if !viewModel.isBusy {
                                onNavigateTocOperator()
                            }
                        } label: {
                            Text("TOC da campo (senza squadra): registra notifiche")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(TacticalColors.yellow)
                                .multilineTextAlignment(.center)
                                .padding(.vertical, 4)
                        }
                        .disabled(viewModel.isBusy)
                        .padding(.top, 8)

                        #if DEBUG
                        Text(AppBuildInfo.label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(TacticalColors.muted)
                            .padding(.top, 10)
                        #endif
                    }
                }
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(key: ContentHeightKey.self, value: proxy.size.height)
                    }
                )
            }
            .padding(.bottom, 12)

            if showScrollHint {
                Text("▼")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.72))
                    .padding(.top, 4)
                    .padding(.bottom, 6)
            }
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: ViewportHeightKey.self, value: proxy.size.height)
            }
        )
        .onPreferenceChange(ContentHeightKey.self) { contentHeight in
            updateScrollHint(contentHeight: contentHeight, viewportHeight: nil)
        }
        .onPreferenceChange(ViewportHeightKey.self) { viewportHeight in
            updateScrollHint(contentHeight: nil, viewportHeight: viewportHeight)
        }
        .sheet(isPresented: $showAlarmSheet) {
            AlarmRequestSheet(viewModel: viewModel) { message in
                onShowMessage(message)
            }
        }
    }

    private func updateScrollHint(contentHeight: CGFloat?, viewportHeight: CGFloat?) {
        if let contentHeight { measuredContentHeight = contentHeight }
        if let viewportHeight { measuredViewportHeight = viewportHeight }
        showScrollHint = measuredContentHeight > measuredViewportHeight + 20
    }

    private var squadBox: some View {
        Text(viewModel.isLoggedIn ? viewModel.sessionLabel : "Nessuna squadra loggata")
            .font(.system(size: 17, weight: .heavy))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(viewModel.isLoggedIn ? TacticalColors.green : Color.black.opacity(0.48))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(viewModel.isLoggedIn ? 0.35 : 0.55), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    @ViewBuilder
    private var loggedInDetails: some View {
        if viewModel.isLoggedIn {
            if let gpsLabel = viewModel.gpsStatusLabel {
                TacticalBodyText(
                    text: gpsLabel,
                    fontSize: 13,
                    color: gpsLabelColor(accuracyM: viewModel.lastGpsAccuracyM)
                )
                .padding(.top, 14)
                .padding(.bottom, 8)
            }
            if viewModel.needsLocationPermission {
                TacticalBodyText(
                    text: "Consenti l'accesso alla posizione per inviare il GPS al TOC.",
                    fontSize: 13,
                    color: TacticalColors.orange
                )
                .padding(.bottom, 8)
            }
            if viewModel.needsBackgroundLocationPermission {
                TacticalBodyText(
                    text: "Per il tracking con telefono in tasca scegli «Sempre» nelle impostazioni posizione.",
                    fontSize: 13,
                    color: TacticalColors.orange
                )
                .padding(.bottom, 8)
                #if !targetEnvironment(simulator)
                MainButton(
                    label: "Consenti posizione Sempre",
                    backgroundColor: TacticalColors.navy,
                    foregroundColor: .white,
                    enabled: !viewModel.isBusy,
                    action: { viewModel.requestBackgroundLocationPermission() }
                )
                .padding(.bottom, 8)
                MainButton(
                    label: "Apri Impostazioni",
                    backgroundColor: TacticalColors.navy,
                    foregroundColor: .white,
                    enabled: !viewModel.isBusy,
                    action: { viewModel.openAppSettings() }
                )
                .padding(.bottom, 8)
                #endif
            }
            if let pushLabel = viewModel.pushStatusLabel {
                TacticalBodyText(
                    text: pushLabel,
                    fontSize: 13,
                    color: viewModel.pushStatusOk ? TacticalColors.gpsGood : TacticalColors.red
                )
                .padding(.bottom, 8)
            }
            if !viewModel.pushStatusOk, viewModel.isLoggedIn {
                #if !targetEnvironment(simulator)
                MainButton(
                    label: "Ripara push TOC",
                    backgroundColor: TacticalColors.navy,
                    foregroundColor: .white,
                    enabled: !viewModel.isBusy,
                    action: { viewModel.retryPushRegistration() }
                )
                .padding(.bottom, 8)
                #endif
            }
            TacticalBodyText(text: SquadAlarmCopy.hint, fontSize: 13)
                .padding(.bottom, 8)
        }
    }

    @ViewBuilder
    private var busyIndicator: some View {
        if viewModel.isBusy {
            ProgressView()
                .tint(TacticalColors.yellow)
                .padding(.top, 18)
        }
    }
}
