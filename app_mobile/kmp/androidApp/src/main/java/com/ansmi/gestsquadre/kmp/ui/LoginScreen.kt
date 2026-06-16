package com.ansmi.gestsquadre.kmp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ansmi.gestsquadre.kmp.ui.components.MainButton
import com.ansmi.gestsquadre.kmp.ui.components.SquadBlockingAlert
import com.ansmi.gestsquadre.kmp.ui.components.TacticalShell
import com.ansmi.gestsquadre.kmp.ui.components.TacticalTitleText
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalGreen
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalYellow
import com.ansmi.gestsquadre.shared.GestSquadreMessages

@Composable
fun LoginScreen(
    viewModel: SquadViewModel,
    onBack: () -> Unit,
    onShowMessage: (String) -> Unit,
    onLoginSuccess: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var squadCode by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    var blockingAlert by rememberSaveable { mutableStateOf<String?>(null) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        focusedLabelColor = Color.White.copy(alpha = 0.85f),
        unfocusedLabelColor = Color.White.copy(alpha = 0.85f),
        focusedBorderColor = Color.White,
        unfocusedBorderColor = Color.White.copy(alpha = 0.55f),
        cursorColor = Color.White,
    )

    TacticalShell {
        Column(modifier = Modifier.fillMaxWidth()) {
            TacticalTitleText(text = "Login squadra", fontSize = 24)
            Spacer(modifier = Modifier.height(20.dp))

            blockingAlert?.let { message ->
                SquadBlockingAlert(message = message)
                Spacer(modifier = Modifier.height(16.dp))
            }

            OutlinedTextField(
                value = squadCode,
                onValueChange = {
                    squadCode = it.uppercase()
                    blockingAlert = null
                },
                label = { Text("Codice squadra") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    keyboardType = KeyboardType.Password,
                    autoCorrectEnabled = false,
                ),
            )
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = {
                    password = it.uppercase()
                    blockingAlert = null
                },
                label = { Text("Password") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors,
                visualTransformation =
                    if (passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    autoCorrectEnabled = false,
                ),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector =
                                if (passwordVisible) {
                                    Icons.Default.VisibilityOff
                                } else {
                                    Icons.Default.Visibility
                                },
                            contentDescription =
                                if (passwordVisible) {
                                    "Nascondi password"
                                } else {
                                    "Mostra password"
                                },
                            tint = Color.White.copy(alpha = 0.9f),
                        )
                    }
                },
            )
            Spacer(modifier = Modifier.height(24.dp))

            MainButton(
                label = "Conferma login",
                backgroundColor = TacticalGreen,
                foregroundColor = Color.White,
                onClick = if (uiState.isBusy) {
                    null
                } else {
                    {
                        val code = squadCode.trim()
                        if (code.isEmpty()) {
                            onShowMessage("Inserisci il codice squadra.")
                        } else {
                            blockingAlert = null
                            viewModel.login(code, password) { err ->
                                if (err == null) {
                                    onLoginSuccess()
                                } else if (GestSquadreMessages.isSquadAlreadyActiveMessage(err)) {
                                    blockingAlert = err
                                } else {
                                    onShowMessage(err)
                                }
                            }
                        }
                    }
                },
            )
            Spacer(modifier = Modifier.height(12.dp))

            TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text(text = "Annulla", color = TacticalYellow)
            }
        }
    }
}
