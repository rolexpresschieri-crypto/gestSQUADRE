package com.ansmi.gestsquadre.kmp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ansmi.gestsquadre.kmp.push.TocPushIntentHandler
import com.ansmi.gestsquadre.kmp.ui.GestSquadreApp
import com.ansmi.gestsquadre.kmp.ui.SquadViewModel
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalTheme
import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.GestSquadreFacade

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TocPushIntentHandler.deliverFromIntent(applicationContext, intent)
        enableEdgeToEdge()

        val config = GestSquadreConfig(
            supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://placeholder.invalid" },
            supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY.ifBlank { "missing" },
        )
        val facade = GestSquadreFacade(config)

        setContent {
            TacticalTheme {
                val viewModel: SquadViewModel = viewModel(
                    factory = SquadViewModelFactory(facade, applicationContext),
                )
                GestSquadreApp(viewModel = viewModel, facade = facade)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        TocPushIntentHandler.deliverFromIntent(applicationContext, intent)
    }
}
