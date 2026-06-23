package com.ansmi.gestsquadre.shared.model

/** Testo mostrato nel pannello blu allarme TOC / inoltro automatico. */
fun formatTocPanelMessage(
    title: String?,
    body: String?,
): String? {
    val t = title?.trim().orEmpty()
    val b = body?.trim().orEmpty()
    if (t.isEmpty() && b.isEmpty()) {
        return null
    }
    return if (b.isEmpty()) t else "$t: $b"
}
