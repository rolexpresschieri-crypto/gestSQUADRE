package com.ansmi.gestsquadre.shared.network

import com.ansmi.gestsquadre.shared.GestSquadreConfig
import com.ansmi.gestsquadre.shared.GestSquadreException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
internal class SupabaseRestClient(
    private val config: GestSquadreConfig,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val http = createPlatformHttpClient {
        install(ContentNegotiation) {
            json(json)
        }
    }

    suspend fun <T> getMaybeSingle(
        table: String,
        select: String,
        filters: List<Pair<String, String>>,
        deserializer: (String) -> T,
    ): T? {
        val response = http.get("${config.restBaseUrl}$table") {
            authHeaders()
            parameter("select", select)
            filters.forEach { (column, value) ->
                parameter(column, "eq.$value")
            }
            parameter("limit", "1")
            header("Accept", "application/vnd.pgrst.object+json")
        }

        if (response.status == HttpStatusCode.NotAcceptable) {
            return null
        }
        ensureSuccess(response)
        val body = response.bodyAsText()
        if (body.isBlank()) {
            return null
        }
        return deserializer(body)
    }

    suspend fun patch(
        table: String,
        filters: List<Pair<String, String>>,
        body: Any,
    ) {
        val response = http.patch("${config.restBaseUrl}$table") {
            authHeaders()
            preferMinimal()
            filters.forEach { (column, value) ->
                parameter(column, "eq.$value")
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        ensureSuccess(response)
    }

    suspend fun <T> insertReturning(
        table: String,
        body: Any,
        deserializer: (String) -> T,
    ): T {
        val response = http.post("${config.restBaseUrl}$table") {
            authHeaders()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        ensureSuccess(response)
        val payload = response.bodyAsText()
        val arrayStart = payload.indexOf('[')
        val arrayEnd = payload.lastIndexOf(']')
        val rowJson =
            if (arrayStart >= 0 && arrayEnd > arrayStart) {
                payload.substring(arrayStart + 1, arrayEnd).trim().trimEnd(',')
            } else {
                payload
            }
        if (rowJson.isBlank()) {
            throw GestSquadreException("Risposta insert vuota da $table")
        }
        return deserializer(rowJson)
    }

    suspend fun insert(
        table: String,
        body: Any,
    ) {
        val response = http.post("${config.restBaseUrl}$table") {
            authHeaders()
            preferMinimal()
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        ensureSuccess(response)
    }

    suspend inline fun <reified T> getList(
        table: String,
        select: String,
        eqFilters: List<Pair<String, String>> = emptyList(),
        isNullColumns: List<String> = emptyList(),
        order: String? = null,
        limit: Int? = null,
    ): List<T> {
        val response = http.get("${config.restBaseUrl}$table") {
            authHeaders()
            parameter("select", select)
            eqFilters.forEach { (column, value) ->
                parameter(column, "eq.$value")
            }
            isNullColumns.forEach { column ->
                parameter(column, "is.null")
            }
            order?.let { parameter("order", it) }
            limit?.let { parameter("limit", it.toString()) }
        }
        ensureSuccess(response)
        val body = response.bodyAsText()
        if (body.isBlank() || body == "[]") {
            return emptyList()
        }
        return json.decodeFromString(body)
    }

    suspend fun upsert(
        table: String,
        onConflict: String,
        body: Any,
    ) {
        val response = http.post("${config.restBaseUrl}$table") {
            authHeaders()
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            parameter("on_conflict", onConflict)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        ensureSuccess(response)
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authHeaders() {
        header("apikey", config.supabaseAnonKey)
        header("Authorization", "Bearer ${config.supabaseAnonKey}")
    }

    private fun io.ktor.client.request.HttpRequestBuilder.preferMinimal() {
        header("Prefer", "return=minimal")
    }

    private suspend fun ensureSuccess(response: HttpResponse) {
        if (!response.status.isSuccess()) {
            val detail = runCatching { response.bodyAsText() }.getOrDefault("")
            throw GestSquadreException(
                "Supabase HTTP ${response.status.value}${if (detail.isNotBlank()) ": $detail" else ""}",
            )
        }
    }
}
