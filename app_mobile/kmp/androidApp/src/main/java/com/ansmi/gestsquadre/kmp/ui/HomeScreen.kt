package com.ansmi.gestsquadre.kmp.ui

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ansmi.gestsquadre.kmp.ui.components.AppTitleBlock
import com.ansmi.gestsquadre.kmp.ui.components.MainButton
import com.ansmi.gestsquadre.kmp.ui.components.TacticalBodyText
import com.ansmi.gestsquadre.kmp.ui.components.TocNotificationPanel
import com.ansmi.gestsquadre.kmp.ui.components.TacticalShell
import com.ansmi.gestsquadre.kmp.ui.theme.GlobalAppBackground
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalDisabled
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalGreen
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalMuted
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalNavy
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalRed
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalYellow
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequest
import com.ansmi.gestsquadre.shared.model.SquadAlarmRequestType
import kotlinx.coroutines.launch

private const val SquadAlarmHint =
    "Segnalazione solo per la mappa TOC: cerchio rosso con nome squadra. Nessun SMS né notifica push."
private const val SquadAlarmDialogTitle = "Segnala allarme su mappa TOC"
private const val SquadAlarmDialogBody =
    "Confermi? Sul backend TOC la squadra apparirà con cerchio rosso fino a «Preso in carico»."
private const val SquadAlarmSentOk =
    "Segnalazione inviata. Il TOC vede la squadra in rosso sulla mappa."

enum class AppScreen {
    Splash,
    Home,
    Login,
    Map,
}

private fun gpsLabelColor(accuracyM: Double?): Color {
    if (accuracyM == null || accuracyM <= 0) {
        return TacticalYellow
    }
    if (accuracyM <= 20) {
        return Color(0xFF8FE88F)
    }
    if (accuracyM <= 45) {
        return TacticalYellow
    }
    return TacticalRed
}

@Composable
fun GestSquadreApp(
    viewModel: SquadViewModel,
    facade: GestSquadreFacade,
) {
    var screen by remember { mutableStateOf(AppScreen.Splash) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner, viewModel) {
        val observer =
            LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) {
                    viewModel.retryPushRegistration()
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(5_500)
        if (screen == AppScreen.Splash) {
            screen = AppScreen.Home
        }
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions(),
        ) { result ->
            val granted =
                result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                    result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            viewModel.onLocationPermissionResult(granted)
        }

    val notificationLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted ->
            viewModel.onNotificationPermissionResult(granted)
        }

    LaunchedEffect(uiState.requestLocationPermission) {
        if (uiState.requestLocationPermission) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
            viewModel.clearLocationPermissionRequest()
        }
    }

    LaunchedEffect(uiState.requestNotificationPermission) {
        if (uiState.requestNotificationPermission) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            viewModel.clearNotificationPermissionRequest()
        }
    }

    fun showSnack(message: String) {
        scope.launch { snackbarHostState.showSnackbar(message) }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.Transparent,
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        GlobalAppBackground()
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding),
        ) {
            when (screen) {
                AppScreen.Splash -> LaunchSplashScreen()
                AppScreen.Home ->
                    HomeScreen(
                        viewModel = viewModel,
                        onNavigateLogin = { screen = AppScreen.Login },
                        onNavigateMap = { screen = AppScreen.Map },
                        onShowMessage = ::showSnack,
                    )
                AppScreen.Login ->
                    LoginScreen(
                        viewModel = viewModel,
                        onBack = { screen = AppScreen.Home },
                        onShowMessage = ::showSnack,
                        onLoginSuccess = { screen = AppScreen.Home },
                    )
                AppScreen.Map ->
                    TocMapScreen(
                        facade = facade,
                        currentSession = uiState.session,
                        onClose = { screen = AppScreen.Home },
                    )
            }
        }
    }
}

@Composable
fun HomeScreen(
    viewModel: SquadViewModel,
    onNavigateLogin: () -> Unit,
    onNavigateMap: () -> Unit,
    onShowMessage: (String) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val session = uiState.session
    val isLogged = session != null
    var showAlarmDialog by remember { mutableStateOf(false) }

    if (showAlarmDialog) {
        SquadAlarmRequestDialog(
            onDismiss = { showAlarmDialog = false },
            onConfirm = { request ->
                showAlarmDialog = false
                viewModel.sendAlarm(request) { err ->
                    onShowMessage(err ?: SquadAlarmSentOk)
                }
            },
        )
    }

    val scrollState = rememberScrollState()
    val showScrollHint by remember {
        derivedStateOf { scrollState.canScrollForward }
    }

    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TacticalShell {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AppTitleBlock()
                Spacer(modifier = Modifier.height(24.dp))

                uiState.bannerMessage?.let { msg ->
                    TacticalBodyText(text = msg, modifier = Modifier.padding(bottom = 12.dp))
                }

                TocNotificationPanel(
                    message = uiState.lastTocMessage,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                MainButton(
                    label = "Reset notifica",
                    backgroundColor = TacticalNavy,
                    foregroundColor = Color.White,
                    onClick = { viewModel.clearLastTocMessage() },
                    modifier = Modifier.padding(bottom = 20.dp),
                    fontWeight = FontWeight.Bold,
                )

                val squadBoxColor = if (isLogged) TacticalGreen else Color.Black.copy(alpha = 0.48f)
                val squadBorderColor = Color.White.copy(alpha = if (isLogged) 0.35f else 0.55f)
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(squadBoxColor, RoundedCornerShape(12.dp))
                            .border(1.dp, squadBorderColor, RoundedCornerShape(12.dp))
                            .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text =
                            if (isLogged) {
                                "${session!!.squadName} + ${session.loginTimeLabel()}"
                            } else {
                                "Nessuna squadra loggata"
                            },
                        textAlign = TextAlign.Center,
                        style =
                            TextStyle(
                                color = Color.White,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp,
                            ),
                    )
                }

                if (isLogged) {
                    Spacer(modifier = Modifier.height(14.dp))
                    uiState.gpsStatusLabel?.let { label ->
                        TacticalBodyText(
                            text = label,
                            fontSize = 13,
                            color = gpsLabelColor(uiState.lastGpsAccuracyM),
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    TacticalBodyText(
                        text = SquadAlarmHint,
                        fontSize = 13,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }

                Spacer(modifier = Modifier.height(18.dp))
                if (uiState.isBusy) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = TacticalYellow,
                    )
                    Spacer(modifier = Modifier.height(18.dp))
                }

                MainButton(
                    label = "Log-in",
                    backgroundColor = if (isLogged) TacticalDisabled else TacticalGreen,
                    foregroundColor = if (isLogged) TacticalMuted else Color.White,
                    onClick = if (!isLogged && !uiState.isBusy && !uiState.isInitializing) onNavigateLogin else null,
                )
                Spacer(modifier = Modifier.height(18.dp))

                MainButton(
                    label = "Log-out",
                    backgroundColor = if (isLogged) TacticalRed else TacticalDisabled,
                    foregroundColor = if (isLogged) Color.White else TacticalMuted,
                    onClick =
                        if (isLogged) {
                            {
                                viewModel.logout { err ->
                                    err?.let(onShowMessage)
                                }
                            }
                        } else {
                            null
                        },
                )
                Spacer(modifier = Modifier.height(18.dp))

                MainButton(
                    label = "INVIA ALLARME A TOC",
                    backgroundColor = if (isLogged) TacticalRed else TacticalDisabled,
                    foregroundColor = if (isLogged) Color.White else TacticalMuted,
                    fontWeight = FontWeight.Black,
                    onClick = if (isLogged) { { showAlarmDialog = true } } else null,
                )
                Spacer(modifier = Modifier.height(18.dp))

                MainButton(
                    label = "Tactical Operations Center",
                    backgroundColor = TacticalYellow,
                    foregroundColor = Color.Black,
                    onClick =
                        if (uiState.isBusy || uiState.isInitializing) {
                            null
                        } else if (!uiState.backendConfigured) {
                            {
                                onShowMessage("Mappa TOC: configura SUPABASE_* in dart-defines.json.")
                            }
                        } else {
                            onNavigateMap
                        },
                )
            }
        }

        if (showScrollHint) {
            Text(
                text = "▼",
                modifier = Modifier.padding(top = 4.dp, bottom = 6.dp),
                color = Color.White.copy(alpha = 0.72f),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun SquadAlarmRequestDialog(
    onDismiss: () -> Unit,
    onConfirm: (SquadAlarmRequest) -> Unit,
) {
    var ambulanza by remember { mutableStateOf(false) }
    var medico by remember { mutableStateOf(false) }
    var dae by remember { mutableStateOf(false) }
    var altro by remember { mutableStateOf(false) }
    var otherDetail by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    fun buildRequest(): SquadAlarmRequest {
        val types = buildSet {
            if (ambulanza) add(SquadAlarmRequestType.AMBULANZA)
            if (medico) add(SquadAlarmRequestType.MEDICO)
            if (dae) add(SquadAlarmRequestType.DAE)
            if (altro) add(SquadAlarmRequestType.ALTRO)
        }
        return SquadAlarmRequest(
            types = types,
            otherDetail = otherDetail.takeIf { altro },
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF1A2E1A),
        title = {
            Text(
                text = SquadAlarmDialogTitle,
                color = Color.White,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = SquadAlarmDialogBody,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Cosa richiedi? (scelta multipla)",
                    color = TacticalYellow,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                )
                Spacer(modifier = Modifier.height(8.dp))
                AlarmRequestCheckboxRow(
                    label = "1. Ambulanza",
                    checked = ambulanza,
                    onCheckedChange = {
                        ambulanza = it
                        validationError = null
                    },
                )
                AlarmRequestCheckboxRow(
                    label = "2. Medico",
                    checked = medico,
                    onCheckedChange = {
                        medico = it
                        validationError = null
                    },
                )
                AlarmRequestCheckboxRow(
                    label = "3. DAE",
                    checked = dae,
                    onCheckedChange = {
                        dae = it
                        validationError = null
                    },
                )
                AlarmRequestCheckboxRow(
                    label = "4. Altro",
                    checked = altro,
                    onCheckedChange = {
                        altro = it
                        validationError = null
                    },
                )
                if (altro) {
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = otherDetail,
                        onValueChange = {
                            otherDetail = it
                            validationError = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Descrizione breve") },
                        singleLine = false,
                        maxLines = 3,
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
                    )
                }
                validationError?.let { err ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = err,
                        color = TacticalRed,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val request = buildRequest()
                    val err = request.validate()
                    if (err != null) {
                        validationError = err
                    } else {
                        onConfirm(request)
                    }
                },
            ) {
                Text(
                    text = "INVIA ALLARME",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = "Annulla", color = TacticalMuted)
            }
        },
    )
}

@Composable
private fun AlarmRequestCheckboxRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable { onCheckedChange(!checked) }
                .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors =
                CheckboxDefaults.colors(
                    checkedColor = TacticalRed,
                    uncheckedColor = TacticalMuted,
                    checkmarkColor = Color.White,
                ),
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = label,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
        )
    }
}
