package com.ansmi.gestsquadre.kmp.map

import androidx.annotation.DrawableRes
import com.ansmi.gestsquadre.kmp.R

object SquadIcons {
    @DrawableRes
    fun drawableRes(iconKey: String?): Int =
        when (iconKey?.trim().orEmpty()) {
            "ambulanza" -> R.drawable.squad_ambulanza
            "coordinatore_cri" -> R.drawable.squad_coordinatore_cri
            "vigili_fuoco" -> R.drawable.squad_vigili_fuoco
            "forze_ordine" -> R.drawable.squad_forze_ordine
            "medico" -> R.drawable.squad_medico
            "fig" -> R.drawable.squad_fig
            "squadre_a_piedi", "" -> R.drawable.squad_squadre_a_piedi
            else -> R.drawable.squad_squadre_a_piedi
        }
}
