package com.ansmi.gestsquadre.kmp.data

import android.content.Context

class TocOperatorStorage(
    context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveRegisteredAdminCode(adminCode: String?) {
        if (adminCode.isNullOrBlank()) {
            prefs.edit().remove(KEY_ADMIN_CODE).apply()
            return
        }
        prefs.edit().putString(KEY_ADMIN_CODE, adminCode.trim().uppercase()).apply()
    }

    fun registeredAdminCode(): String? =
        prefs.getString(KEY_ADMIN_CODE, null)?.trim()?.takeIf { it.isNotEmpty() }

    companion object {
        private const val PREFS_NAME = "gest_squadre_prefs"
        private const val KEY_ADMIN_CODE = "toc_operator_admin_code"
    }
}
