import SwiftUI

struct AlarmRequestSheet: View {
    @ObservedObject var viewModel: SquadViewModel
    let onShowMessage: (String) -> Void
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
                        alarmRow("1. Ambulanza", $ambulanza, highlighted: false)
                        alarmRow("2. Medico", $medico, highlighted: false)
                        alarmRow("3. DAE", $dae, highlighted: false)
                        alarmRow("4. Forze dell'ordine", $forzeOrdine, highlighted: true)
                        alarmRow("5. V.V.F.", $vvf, highlighted: true)
                        alarmRow("6. Altro", $altro, highlighted: false)
                        if altro {
                            TextField("Descrivi la richiesta", text: $otherDetail)
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

    private func alarmRow(_ label: String, _ value: Binding<Bool>, highlighted: Bool) -> some View {
        Toggle(isOn: value) {
            Text(label)
                .foregroundStyle(highlighted ? TacticalColors.alarmHighlightYellow : .white)
                .fontWeight(highlighted ? .bold : .regular)
        }
        .tint(TacticalColors.red)
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
                onShowMessage(SquadAlarmCopy.sentOk)
            }
        }
    }
}
