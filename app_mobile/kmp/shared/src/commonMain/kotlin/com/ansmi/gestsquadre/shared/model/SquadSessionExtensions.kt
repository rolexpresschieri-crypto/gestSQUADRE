package com.ansmi.gestsquadre.shared.model

import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/** Etichetta ora login (es. "16:09") — stessa logica Android HomeScreen. */
fun SquadSession.loginTimeLabel(): String {
    val local = loginAt.toLocalDateTime(TimeZone.currentSystemDefault())
    val h = local.hour.toString().padStart(2, '0')
    val m = local.minute.toString().padStart(2, '0')
    return "$h:$m"
}
