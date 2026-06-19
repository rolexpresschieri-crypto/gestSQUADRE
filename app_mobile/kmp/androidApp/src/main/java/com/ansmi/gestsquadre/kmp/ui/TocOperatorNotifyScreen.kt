package com.ansmi.gestsquadre.kmp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ansmi.gestsquadre.kmp.ui.components.AppTitleBlock
import com.ansmi.gestsquadre.kmp.ui.components.MainButton
import com.ansmi.gestsquadre.kmp.ui.components.TacticalBodyText
import com.ansmi.gestsquadre.kmp.ui.components.TacticalShell
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalMuted
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalYellow

@Composable
fun TocOperatorNotifyScreen(
    viewModel: SquadViewModel,
    onBack: () -> Unit,
    onShowMessage: (String) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var adminCode by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TacticalShell {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AppTitleBlock()
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Notifiche TOC (operatore)",
                    color = TacticalYellow,
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(12.dp))

                TacticalBodyText(
                    text =
                        "Registra questo telefono per ricevere in automatico le push " +
                            "quando un volontario segnala allarme. Non sostituisce il login squadra.",
                    fontSize = 13,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                uiState.tocOperatorAdminCode?.let { code ->
                    TacticalBodyText(
                        text = "Registrato come: $code",
                        fontSize = 14,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }

                OutlinedTextField(
                    value = adminCode,
                    onValueChange = { adminCode = it.uppercase() },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Codice operatore TOC") },
                    placeholder = { Text("Es. GT_01_AN") },
                    singleLine = true,
                    colors =
                        OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = TacticalYellow,
                            unfocusedBorderColor = TacticalMuted,
                            focusedLabelColor = TacticalYellow,
                            unfocusedLabelColor = TacticalMuted,
                            cursorColor = TacticalYellow,
                        ),
                    textStyle = TextStyle(color = Color.White),
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Password TOC") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    colors =
                        OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = TacticalYellow,
                            unfocusedBorderColor = TacticalMuted,
                            focusedLabelColor = TacticalYellow,
                            unfocusedLabelColor = TacticalMuted,
                            cursorColor = TacticalYellow,
                        ),
                    textStyle = TextStyle(color = Color.White),
                )
                Spacer(modifier = Modifier.height(16.dp))

                if (uiState.isBusy) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = TacticalYellow,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                MainButton(
                    label = "REGISTRA NOTIFICHE",
                    backgroundColor = TacticalYellow,
                    foregroundColor = Color.Black,
                    fontWeight = FontWeight.Black,
                    onClick =
                        if (!uiState.isBusy) {
                            {
                                viewModel.registerTocOperatorNotify(
                                    adminCode = adminCode,
                                    password = password,
                                ) { err ->
                                    if (err != null) {
                                        onShowMessage(err)
                                    } else {
                                        onShowMessage("Telefono registrato per notifiche TOC.")
                                        onBack()
                                    }
                                }
                            }
                        } else {
                            null
                        },
                )
                Spacer(modifier = Modifier.height(12.dp))

                MainButton(
                    label = "Indietro",
                    backgroundColor = Color.Black.copy(alpha = 0.5f),
                    foregroundColor = Color.White,
                    onClick = onBack,
                )
            }
        }
    }
}
