package com.ansmi.gestsquadre.shared

object NetworkErrorMessages {
    fun format(message: String?): String {
        val msg = message?.trim().orEmpty()
        if (msg.isEmpty()) {
            return "Connessione non disponibile. Verifica rete e riprova."
        }
        return when {
            msg.contains("Unable to resolve host", ignoreCase = true) ||
                msg.contains("No address associated with hostname", ignoreCase = true) ->
                "Rete non raggiunge il server (DNS). Su questo telefono: " +
                    "disattiva DNS privato o VPN, prova dati mobili al posto del Wi‑Fi, riavvia."
            msg.contains("failed to connect", ignoreCase = true) ||
                msg.contains("Connection refused", ignoreCase = true) ||
                msg.contains("Network is unreachable", ignoreCase = true) ||
                msg.contains("timeout", ignoreCase = true) ->
                "Connessione assente o instabile. Verifica Wi‑Fi o dati mobili e riprova."
            else -> msg
        }
    }

    fun format(error: Throwable): String = format(error.message ?: error.toString())
}
