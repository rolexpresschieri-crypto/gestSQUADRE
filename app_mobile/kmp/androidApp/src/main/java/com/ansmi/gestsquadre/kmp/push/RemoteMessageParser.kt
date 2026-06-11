package com.ansmi.gestsquadre.kmp.push

import com.google.firebase.messaging.RemoteMessage

fun RemoteMessage.tocTitle(): String =
    notification?.title?.trim().orEmpty().ifEmpty {
        data["title"]?.trim().orEmpty().ifEmpty { "TOC — ALLARME" }
    }

fun RemoteMessage.tocBody(): String =
    notification?.body?.trim().orEmpty().ifEmpty {
        data["body"]?.trim().orEmpty()
    }

fun RemoteMessage.isTocAlarm(): Boolean {
    val type = data["type"]?.equals("toc_alarm", ignoreCase = true) == true
    val channel = notification?.channelId == FcmManager.CHANNEL_ALARM
    return type || channel
}
