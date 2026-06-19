import SwiftUI

struct AlarmRequestSheet: View {
    @ObservedObject var viewModel: SquadViewModel
    let onShowMessage: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var sanitario = false
    @State private var security = false
    @State private var vigiliFuoco = false
    @State private var strutture = false
    @State private var altro = false
    @State private var otherDetail = ""
    @State private var validationError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                TacticalColors.alarmDialogBg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(SquadAlarmCopy.dialogBody)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text("Cosa richiedi? (scelta multipla)")
                            .font(.subheadline.bold())
                            .foregroundStyle(TacticalColors.yellow)
                        alarmRow("1. Sanitario", $sanitario)
                        alarmRow("2. Security", $security)
                        alarmRow("3. Vigili del Fuoco", $vigiliFuoco)
                        alarmRow("4. Strutture", $strutture)
                        alarmRow("5. Altro", $altro)
                        if altro {
                            TextField("Descrizione breve", text: $otherDetail, axis: .vertical)
                                .lineLimit(2...5)
                                .textFieldStyle(.roundedBorder)
                        }
                        if let validationError {
                            Text(validationError)
                                .font(.footnote)
                                .foregroundStyle(TacticalColors.red)
                        }
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(SquadAlarmCopy.dialogTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                        .disabled(viewModel.isAlarmBusy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Invia", action: submit)
                        .disabled(viewModel.isAlarmBusy)
                }
            }
        }
    }

    private func alarmRow(_ label: String, _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            Text(label)
                .foregroundStyle(.white)
        }
        .tint(TacticalColors.red)
    }

    private func submit() {
        validationError = nil
        viewModel.sendAlarm(
            sanitario: sanitario,
            security: security,
            vigiliFuoco: vigiliFuoco,
            strutture: strutture,
            altro: altro,
            otherDetail: otherDetail
        ) { errorMessage in
            if let errorMessage {
                validationError = errorMessage
            } else {
                dismiss()
                onShowMessage(SquadAlarmCopy.sentOk)
            }
        }
    }
}
