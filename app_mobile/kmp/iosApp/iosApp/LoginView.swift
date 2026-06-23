import SwiftUI
import shared

struct LoginView: View {
    @ObservedObject var viewModel: SquadViewModel
    let onBack: () -> Void
    let onLoginSuccess: () -> Void
    let onShowMessage: (String) -> Void

    @State private var squadCode = ""
    @State private var password = ""
    @State private var passwordVisible = false
    @State private var blockingAlert: String?

    var body: some View {
        ScrollView {
            TacticalShell {
                VStack(spacing: 0) {
                    TacticalTitleText(text: "Login squadra")
                        .padding(.bottom, 20)

                    if let blockingAlert {
                        SquadBlockingAlert(message: blockingAlert)
                            .padding(.bottom, 16)
                    }

                    loginField("Codice squadra", text: $squadCode, secure: false)
                        .padding(.bottom, 12)
                    passwordField
                        .padding(.bottom, 24)

                    MainButton(
                        label: "Conferma login",
                        backgroundColor: TacticalColors.green,
                        foregroundColor: .white,
                        enabled: !viewModel.isBusy,
                        action: submitLogin
                    )

                    Button("Annulla", action: onBack)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(TacticalColors.yellow)
                        .padding(.top, 12)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var passwordField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
            HStack(spacing: 0) {
                Group {
                    if passwordVisible {
                        TextField("", text: $password)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
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
            .onChange(of: password) { newValue in
                password = newValue.uppercased()
                blockingAlert = nil
            }
        }
    }

    private func loginField(_ label: String, text: Binding<String>, secure: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
            Group {
                if secure {
                    SecureField("", text: text)
                } else {
                    TextField("", text: text)
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
                blockingAlert = nil
            }
        }
    }

    private func submitLogin() {
        let code = squadCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else {
            onShowMessage("Inserisci il codice squadra.")
            return
        }
        blockingAlert = nil
        viewModel.login(squadCode: code, password: password) { err in
            if let err {
                if GestSquadreMessages.shared.isSquadAlreadyActiveMessage(message: err) {
                    blockingAlert = err
                } else {
                    onShowMessage(err)
                }
            } else {
                onLoginSuccess()
            }
        }
    }
}
