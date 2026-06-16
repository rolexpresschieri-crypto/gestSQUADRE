import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var viewModel: SquadViewModel

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("gestSQUADRE")
                    .font(.largeTitle.bold())
                Text("Volontario — iOS")
                    .foregroundStyle(.secondary)

                if !viewModel.isConfigured {
                    Label("Supabase non configurato", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.subheadline)
                }

                if viewModel.isLoggedIn {
                    Label(viewModel.sessionLabel, systemImage: "person.crop.circle.badge.checkmark")
                        .font(.headline)
                    Text(viewModel.statusMessage)
                        .foregroundStyle(.green)
                    Button("Esci") {
                        viewModel.logout()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                } else {
                    TextField("Codice squadra (es. SQD001)", text: $viewModel.squadCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    SecureField("Password", text: $viewModel.password)
                        .textFieldStyle(.roundedBorder)
                    Button("Accedi") {
                        viewModel.login()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.squadCode.isEmpty || viewModel.password.isEmpty)
                    Text(viewModel.statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer()
                Text("TOC su Windows: nessuna connessione diretta. Tutto passa da Supabase in cloud.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .navigationTitle("Open Golf")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SquadViewModel())
}
