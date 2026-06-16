import CoreLocation
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var viewModel: SquadViewModel
    @Environment(\.scenePhase) private var scenePhase

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
                        .font(.subheadline)
                        .foregroundStyle(.green)
                    if let gpsLabel = viewModel.gpsStatusLabel {
                        Label(gpsLabel, systemImage: "location.fill")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if viewModel.needsLocationPermission {
                        Text("Consenti l'accesso alla posizione per inviare il GPS al TOC.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                    Text(SquadAlarmCopy.hint)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    if let blocking = viewModel.loginBlockingMessage {
                        Text(blocking)
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                            .padding(.vertical, 12)
                            .padding(.horizontal, 14)
                            .background(Color.red)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    TextField("Codice squadra (es. SQD001)", text: $viewModel.squadCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: viewModel.squadCode) { _ in
                            viewModel.loginBlockingMessage = nil
                        }
                    SecureField("Password", text: $viewModel.password)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: viewModel.password) { _ in
                            viewModel.loginBlockingMessage = nil
                        }
                    Text(viewModel.statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Button("Log-in") {
                    viewModel.login()
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isLoggedIn || viewModel.squadCode.isEmpty || viewModel.password.isEmpty)

                Button("Log-out") {
                    viewModel.logout()
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .disabled(!viewModel.isLoggedIn)

                Button("INVIA ALLARME A TOC") {
                    viewModel.showAlarmSheet = true
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(!viewModel.isLoggedIn || viewModel.isAlarmBusy)

                Spacer()
                Text("TOC su Windows: nessuna connessione diretta. Tutto passa da Supabase in cloud.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .navigationTitle("Open Golf")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: scenePhase) { phase in
                if phase == .active, viewModel.isLoggedIn, viewModel.needsLocationPermission {
                    viewModel.onLocationPermissionGranted()
                }
            }
            .sheet(isPresented: $viewModel.showAlarmSheet) {
                AlarmRequestSheet(viewModel: viewModel)
            }
        }
    }
}

private struct AlarmRequestSheet: View {
    @ObservedObject var viewModel: SquadViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var ambulanza = false
    @State private var medico = false
    @State private var dae = false
    @State private var forzeOrdine = false
    @State private var vvf = false
    @State private var altro = false
    @State private var otherDetail = ""
    @State private var validationError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(SquadAlarmCopy.dialogBody)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Cosa richiedi? (scelta multipla)") {
                    Toggle("Ambulanza", isOn: $ambulanza)
                    Toggle("Medico", isOn: $medico)
                    Toggle("DAE", isOn: $dae)
                    Toggle("Forze dell'ordine", isOn: $forzeOrdine)
                    Toggle("V.V.F.", isOn: $vvf)
                    Toggle("Altro", isOn: $altro)
                    if altro {
                        TextField("Descrivi la richiesta", text: $otherDetail)
                    }
                }
                if let validationError {
                    Section {
                        Text(validationError)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(SquadAlarmCopy.dialogTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                        .disabled(viewModel.isAlarmBusy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Invia") { submit() }
                        .disabled(viewModel.isAlarmBusy)
                }
            }
        }
    }

    private func submit() {
        validationError = nil
        viewModel.sendAlarm(
            ambulanza: ambulanza,
            medico: medico,
            dae: dae,
            forzeOrdine: forzeOrdine,
            vvf: vvf,
            altro: altro,
            otherDetail: otherDetail
        ) { errorMessage in
            if let errorMessage {
                validationError = errorMessage
            } else {
                dismiss()
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SquadViewModel())
}
