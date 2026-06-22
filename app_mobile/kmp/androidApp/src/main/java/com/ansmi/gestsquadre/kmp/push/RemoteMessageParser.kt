package com.ansmi.gestsquadre.kmp.push

import com.google.firebase.messaging.RemoteMessage
import java.util.Locale

fun RemoteMessage.tocTitle(): String =
    notification?.title?.trim().orEmpty().ifEmpty {
        data["title"]?.trim().orEmpty().ifEmpty { "TOC — ALLARME" }
    }

fun RemoteMessage.tocBody(): String =
    notification?.body?.trim().orEmpty().ifEmpty {
        data["body"]?.trim().orEmpty()
    }

fun RemoteMessage.tocTargetLabel(): String? =
    data["target_waypoint_label"]?.trim()?.takeIf { it.isNotEmpty() }

fun RemoteMessage.tocBodyForDisplay(): String {
    val base = tocBody()
    val target = tocTargetLabel() ?: return base
    if (base.contains(target, ignoreCase = true)) {
        return base
    }
    val upperTarget = target.uppercase(Locale.ITALY)
    return "$base — TARGET $upperTarget"
}

fun RemoteMessage.isVolunteerAlarm(): Boolean =
    data["type"]?.equals("volunteer_alarm", ignoreCase = true) == true

fun RemoteMessage.isTocAlarm(): Boolean {
    if (isVolunteerAlarm()) {
        return true
    }
    val type = data["type"]?.equals("toc_alarm", ignoreCase = true) == true
    val channel = notification?.channelId == FcmManager.CHANNEL_ALARM
    return type || channel
}
