package com.ansmi.gestsquadre.shared

/**
 * Stessi valori di [dart-defines.json] nell'app Flutter operativa.
 */
data class GestSquadreConfig(
    val supabaseUrl: String,
    val supabaseAnonKey: String,
    val tocBackendUrl: String = "",
) {
    init {
        require(supabaseUrl.isNotBlank()) { "supabaseUrl obbligatorio" }
        require(supabaseAnonKey.isNotBlank()) { "supabaseAnonKey obbligatorio" }
    }

    val restBaseUrl: String
        get() = supabaseUrl.trimEnd('/') + "/rest/v1/"
}
