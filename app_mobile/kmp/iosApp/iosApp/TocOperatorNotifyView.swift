import SwiftUI

struct TocOperatorNotifyView: View {
    @ObservedObject var viewModel: SquadViewModel
    let onBack: () -> Void
    let onShowMessage: (String) -> Void

    @State private var adminCode = ""
    @State private var password = ""
    @State private var passwordVisible = false

    var body: some View {
        ScrollView {
            TacticalShell {
                VStack(spacing: 0) {
                    AppTitleBlock()
                        .padding(.bottom, 16)

                    Text("Notifiche TOC (operatore)")
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(TacticalColors.yellow)
                        .multilineTextAlignment(.center)
                        .padding(.bottom, 12)

                    TacticalBodyText(
                        text: "Registra questo telefono per ricevere in automatico le push quando un volontario segnala allarme. Non sostituisce il login squadra.",
                        fontSize: 13
                    )
                    .padding(.bottom, 12)

                    if let code = viewModel.tocOperatorAdminCode, !code.isEmpty {
                        TacticalBodyText(text: "Registrato come: \(code)", fontSize: 14)
                            .padding(.bottom, 12)
                    }

                    operatorField("Codice operatore TOC", text: $adminCode, secure: false, placeholder: "Es. GT_01_AN")
                        .padding(.bottom, 10)
                    operatorPasswordField
                        .padding(.bottom, 16)

                    if viewModel.isBusy {
                        ProgressView()
                            .tint(TacticalColors.yellow)
                            .padding(.bottom, 16)
                    }

                    MainButton(
                        label: "REGISTRA NOTIFICHE",
                        backgroundColor: TacticalColors.yellow,
                        foregroundColor: .black,
                        enabled: !viewModel.isBusy,
                        action: submitRegistration
                    )
                    .padding(.bottom, 12)

                    MainButton(
                        label: "Indietro",
                        backgroundColor: Color.black.opacity(0.5),
                        foregroundColor: .white,
                        enabled: true,
                        action: onBack
                    )
                }
            }
        }
    }

    private var operatorPasswordField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password TOC")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
            HStack(spacing: 0) {
                Group {
                    if passwordVisible {
                        TextField("", text: $password)
                    } else {
                        SecureField("", text: $password)
                    }
                }
                .padding(12)
                Button {
                    passwordVisible.toggle()
                } label: {
                    Image(systemName: passwordVisible ? "eye.slash.fill" : "eye.fill")
                        .foregroundStyle(.white.opacity(0.9))
                        .frame(width: 44, height: 44)
                }
            }
            .background(Color.black.opacity(0.25))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            }
            .foregroundStyle(.white)
        }
    }

    private func operatorField(
        _ label: String,
        text: Binding<String>,
        secure: Bool,
        placeholder: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
            Group {
                if secure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
            }
            .padding(12)
            .background(Color.black.opacity(0.25))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            }
            .foregroundStyle(.white)
            .onChange(of: text.wrappedValue) { newValue in
                text.wrappedValue = newValue.uppercased()
            }
        }
    }

    private func submitRegistration() {
        viewModel.registerTocOperatorNotify(adminCode: adminCode, password: password) { err in
            if let err {
                onShowMessage(err)
            } else {
                onShowMessage("Telefono registrato per notifiche TOC.")
                onBack()
            }
        }
    }
}
