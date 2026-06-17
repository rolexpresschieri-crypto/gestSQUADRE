import SwiftUI

@main
struct GestSquadreIosApp: App {
    @StateObject private var viewModel = SquadViewModel()

    var body: some Scene {
        WindowGroup {
            GestSquadreRootView()
                .environmentObject(viewModel)
        }
    }
}
