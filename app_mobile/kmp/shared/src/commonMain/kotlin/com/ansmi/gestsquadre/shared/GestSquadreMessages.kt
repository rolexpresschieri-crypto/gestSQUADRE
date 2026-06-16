package com.ansmi.gestsquadre.shared

object GestSquadreMessages {
    /** Senza accento: evita caratteri strani su alcuni font Android. */
    const val SQUAD_ALREADY_ACTIVE = "Squadra gia attiva su un altro telefono"

    fun isSquadAlreadyActiveMessage(message: String?): Boolean {
        if (message.isNullOrBlank()) {
            return false
        }
        if (message == SQUAD_ALREADY_ACTIVE) {
            return true
        }
        return message.contains("attiva su un altro telefono", ignoreCase = true)
    }
}
