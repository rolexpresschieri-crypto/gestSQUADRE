package com.ansmi.gestsquadre.kmp.network

import com.ansmi.gestsquadre.kmp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object TocOperatorNotifyClient {
    suspend fun registerOperatorFcm(
        adminCode: String,
        password: String,
        fcmToken: String,
        deviceLabel: String?,
    ): String? =
        withContext(Dispatchers.IO) {
            val base = BuildConfig.TOC_BACKEND_URL.trim().removeSuffix("/")
            if (base.isBlank()) {
                return@withContext "Configura TOC_BACKEND_URL in dart-defines.json."
            }

            val url = URL("$base/api/register-toc-admin-fcm")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 20_000
                readTimeout = 20_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }

            try {
                val body =
                    JSONObject()
                        .put("adminCode", adminCode.trim().uppercase())
                        .put("password", password)
                        .put("fcmToken", fcmToken)
                        .put("deviceLabel", deviceLabel ?: android.os.Build.MODEL)
                        .toString()

                connection.outputStream.use { stream ->
                    stream.write(body.toByteArray(Charsets.UTF_8))
                }

                val responseText =
                    if (connection.responseCode in 200..299) {
                        connection.inputStream.bufferedReader().readText()
                    } else {
                        connection.errorStream?.bufferedReader()?.readText().orEmpty()
                    }

                if (connection.responseCode in 200..299) {
                    null
                } else {
                    runCatching {
                        JSONObject(responseText).optString("error")
                    }.getOrNull()?.takeIf { it.isNotBlank() }
                        ?: "Registrazione fallita (${connection.responseCode})."
                }
            } catch (e: Exception) {
                e.message ?: "Errore di rete verso TOC."
            } finally {
                connection.disconnect()
            }
        }
}
