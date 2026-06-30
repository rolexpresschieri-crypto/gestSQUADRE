import SwiftUI

enum AlarmRequestSheetPurpose {
    case notifyToc
    case openEvent
}

struct AlarmRequestSheet: View {
    @ObservedObject var viewModel: SquadViewModel
    let purpose: AlarmRequestSheetPurpose
    let onShowMessage: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var sanitario = false
    @State private var security = false
    @State private var vigiliFuoco = false
    @State private var strutture = false
    @State private var altro = false
    @State private var otherDetail = ""
    @State private var validationError: String?

    private var dialogTitle: String {
        purpose == .openEvent ? SquadAlarmCopy.openEventTitle : SquadAlarmCopy.dialogTitle
    }

    private var dialogBody: String {
        purpose == .openEvent ? SquadAlarmCopy.openEventBody : SquadAlarmCopy.dialogBody
    }

    private var confirmLabel: String {
        purpose == .openEvent ? SquadAlarmCopy.openEventConfirm : "Invia"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                TacticalColors.alarmDialogBg.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(dialogBody)
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
                                    .id("altroField")
                            }
                            if let validationError {
                                Text(validationError)
                                    .font(.footnote)
                                    .foregroundStyle(TacticalColors.red)
                                    .id("validationError")
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding()
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: altro) { isOn in
                        if isOn {
                            scrollToBottom(proxy)
                        }
                    }
                    .onChange(of: validationError) { error in
                        if error != nil {
                            scrollToBottom(proxy)
                        }
                    }
                }
            }
            .navigationTitle(dialogTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                        .disabled(viewModel.isBusy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(confirmLabel, action: submit)
                        .disabled(viewModel.isBusy)
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
        .onChange(of: value.wrappedValue) { _ in
            validationError = nil
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeOut(duration: 0.25)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func submit() {
        validationError = nil
        switch purpose {
        case .notifyToc:
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
        case .openEvent:
            viewModel.openOperationalEvent(
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
                }
            }
        }
    }
}
