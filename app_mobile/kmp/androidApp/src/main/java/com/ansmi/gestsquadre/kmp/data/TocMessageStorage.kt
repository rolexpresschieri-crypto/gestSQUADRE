package com.ansmi.gestsquadre.kmp.data

import android.content.Context
import com.ansmi.gestsquadre.shared.model.formatTocPanelMessage

/**
 * Ultimo messaggio TOC da mostrare nel pannello blu (sopravvive a chiusura app / processo kill).
 */
class TocMessageStorage(
    context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(message: String) {
        val trimmed = message.trim()
        if (trimmed.isEmpty()) {
            clear()
            return
        }
        prefs.edit().putString(KEY, trimmed).apply()
    }

    fun load(): String? {
        val raw = prefs.getString(KEY, null)?.trim().orEmpty()
        return raw.ifEmpty { null }
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    companion object {
        const val PREFS_NAME = "gest_squadre_prefs"
        private const val KEY = "last_toc_message"

        fun formatDisplayMessage(
            title: String,
            body: String,
        ): String = formatTocPanelMessage(title, body).orEmpty()
    }
}
