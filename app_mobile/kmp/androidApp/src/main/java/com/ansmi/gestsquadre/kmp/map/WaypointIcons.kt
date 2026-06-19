package com.ansmi.gestsquadre.kmp.map

import androidx.annotation.DrawableRes
import com.ansmi.gestsquadre.kmp.R

object WaypointIcons {
    @DrawableRes
    fun drawableRes(iconKey: String?): Int =
        when (iconKey?.trim().orEmpty()) {
            "croce_rossa" -> R.drawable.waypoint_croce_rossa
            "club_house" -> R.drawable.waypoint_club_house
            "cancello_in" -> R.drawable.waypoint_cancello_in
            "driving_range" -> R.drawable.waypoint_driving_range
            "villaggio_comm" -> R.drawable.waypoint_villaggio_comm
            "welcome" -> R.drawable.waypoint_welcome
            "media_center" -> R.drawable.waypoint_media_center
            "toc" -> R.drawable.waypoint_toc
            "buche", "buca_golf", "" -> R.drawable.waypoint_buche
            else -> R.drawable.waypoint_buche
        }
}
