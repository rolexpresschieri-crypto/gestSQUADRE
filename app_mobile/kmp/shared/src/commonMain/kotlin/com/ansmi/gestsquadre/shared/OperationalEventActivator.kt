package com.ansmi.gestsquadre.shared

/** Squadre che aprono un evento operativo TOC inviando allarme dal campo. */
object OperationalEventActivator {
    const val UNAUTHORIZED_MESSAGE: String = "utente non autorizzato ad apertura eventi"

    private val EXACT_CODES: Set<String> =
        setOf(
            "01_AN",
            "01_EN",
            "01_RR",
            "01_TOC",
            "01_UN",
            "GT_01_AN",
            "GT_01_EN",
            "GT_01_RR",
            "GT_01_TOC",
            "GT_01_UN",
        )

    private val SUFFIXES: List<String> =
        listOf(
            "_01_AN",
            "_01_EN",
            "_01_RR",
            "_01_TOC",
            "_01_UN",
        )

    fun isActivator(squadCode: String): Boolean {
        val code = squadCode.trim().uppercase()
        if (code.isEmpty()) {
            return false
        }
        if (code in EXACT_CODES) {
            return true
        }
        return SUFFIXES.any { suffix -> code.endsWith(suffix) }
    }
}
