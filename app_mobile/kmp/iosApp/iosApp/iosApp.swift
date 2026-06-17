import SwiftUI

@main
struct GestSquadreIosApp: App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
    @StateObject private var viewModel = SquadViewModel()

    var body: some Scene {
        WindowGroup {
            GestSquadreRootView()
                .environmentObject(viewModel)
        }
    }
}
