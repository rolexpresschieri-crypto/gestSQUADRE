package com.ansmi.gestsquadre.kmp

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.ansmi.gestsquadre.kmp.data.SessionStorage
import com.ansmi.gestsquadre.kmp.data.TocMessageStorage
import com.ansmi.gestsquadre.kmp.data.TocOperatorStorage
import com.ansmi.gestsquadre.kmp.push.FcmManager
import com.ansmi.gestsquadre.kmp.ui.SquadViewModel
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.location.LocationTracker

class SquadViewModelFactory(
    private val facade: GestSquadreFacade,
    private val appContext: Context,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(SquadViewModel::class.java)) {
            return SquadViewModel(
                appContext = appContext.applicationContext,
                facade = facade,
                locationTracker = LocationTracker(appContext),
                sessionStorage = SessionStorage(appContext),
                tocMessageStorage = TocMessageStorage(appContext),
                tocOperatorStorage = TocOperatorStorage(appContext),
                fcmManager = FcmManager(appContext),
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
    }
}
