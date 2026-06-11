package com.ansmi.gestsquadre.shared.model

enum class SquadAlarmRequestType(
    val code: String,
    val label: String,
) {
    AMBULANZA("ambulanza", "Ambulanza"),
    MEDICO("medico", "Medico"),
    DAE("dae", "DAE"),
    ALTRO("altro", "Altro"),
    ;

    companion object {
        val ordered: List<SquadAlarmRequestType> = entries
    }
}

data class SquadAlarmRequest(
    val types: Set<SquadAlarmRequestType>,
    val otherDetail: String? = null,
) {
    fun validate(): String? {
        if (types.isEmpty()) {
            return "Seleziona almeno una richiesta."
        }
        if (SquadAlarmRequestType.ALTRO in types) {
            val detail = otherDetail?.trim().orEmpty()
            if (detail.length < 2) {
                return "Descrivi brevemente la richiesta «Altro»."
            }
        }
        return null
    }

    fun toLogMessage(): String {
        val labels =
            SquadAlarmRequestType.ordered
                .filter { it in types && it != SquadAlarmRequestType.ALTRO }
                .map { it.label }
        val base = labels.joinToString(" · ")
        return if (SquadAlarmRequestType.ALTRO in types) {
            val altro = otherDetail?.trim().orEmpty()
            if (base.isEmpty()) {
                "Altro: $altro"
            } else {
                "$base · Altro: $altro"
            }
        } else {
            base
        }
    }

    fun typeCodes(): List<String> =
        SquadAlarmRequestType.ordered
            .filter { it in types }
            .map { it.code }
}
