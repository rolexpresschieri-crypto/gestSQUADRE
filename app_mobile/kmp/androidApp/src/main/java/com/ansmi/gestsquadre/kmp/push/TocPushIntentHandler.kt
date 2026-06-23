package com.ansmi.gestsquadre.kmp.push

import android.content.Context
import android.content.Intent
import com.ansmi.gestsquadre.kmp.MainActivity
import com.ansmi.gestsquadre.kmp.data.TocMessageStorage
import com.ansmi.gestsquadre.shared.model.formatTocPanelMessage

object TocPushIntentHandler {
    fun deliverFromIntent(
        context: Context,
        intent: Intent?,
    ): Boolean {
        val title = intent?.getStringExtra(TocPushIntentExtras.PUSH_TITLE)?.trim().orEmpty()
        if (title.isEmpty()) {
            return false
        }
        val body = intent?.getStringExtra(TocPushIntentExtras.PUSH_BODY)?.trim().orEmpty()
        TocPushDelivery.deliver(context, title, body)
        intent?.removeExtra(TocPushIntentExtras.PUSH_TITLE)
        intent?.removeExtra(TocPushIntentExtras.PUSH_BODY)
        return true
    }

    fun buildLaunchIntent(
        context: Context,
        title: String,
        body: String,
    ): Intent =
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(TocPushIntentExtras.PUSH_TITLE, title)
            putExtra(TocPushIntentExtras.PUSH_BODY, body)
        }

    fun formatStoredMessage(
        title: String,
        body: String,
    ): String? = formatTocPanelMessage(title, body)
}
