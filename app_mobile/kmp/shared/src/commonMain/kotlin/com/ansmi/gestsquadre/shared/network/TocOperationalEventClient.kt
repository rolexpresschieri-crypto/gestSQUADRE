package com.ansmi.gestsquadre.shared.network

import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.GestSquadreException
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class OpenEventResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val event: OpenEventRow? = null,
)

@Serializable
private data class OpenEventRow(
    val displayNumber: Int = 0,
)

object TocOperationalEventClient {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun openFromField(
        config: GestSquadreConfig,
        sessionId: String,
    ): Int {
        val base = config.tocBackendUrl.trim().removeSuffix("/")
        if (base.isBlank()) {
            throw GestSquadreException("TOC_BACKEND_URL non configurato nell'APK.")
        }

        val http = createPlatformHttpClient { }
        val response =
            http.post("$base/api/operational-events/open-from-field") {
                contentType(ContentType.Application.Json)
                setBody(mapOf("sessionId" to sessionId))
            }

        val body = response.bodyAsText()
        if (!response.status.isSuccess()) {
            val parsed = runCatching { json.decodeFromString<OpenEventResponse>(body) }.getOrNull()
            throw GestSquadreException(parsed?.error ?: "Apertura evento fallita (HTTP ${response.status.value}).")
        }

        val parsed = json.decodeFromString<OpenEventResponse>(body)
        val number = parsed.event?.displayNumber ?: 0
        if (number == null || number < 1) {
            throw GestSquadreException("Risposta apertura evento non valida.")
        }
        return number
    }
}
