package com.ansmi.gestsquadre.kmp.network

import com.ansmi.gestsquadre.kmp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

sealed class FieldPhotoUploadResult {
    data object Success : FieldPhotoUploadResult()

    data class PermanentError(val message: String) : FieldPhotoUploadResult()

    data object NetworkError : FieldPhotoUploadResult()
}

object FieldPhotoUploadClient {
    private const val MAX_BYTES = 2_500_000

    suspend fun upload(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegBytes: ByteArray,
    ): FieldPhotoUploadResult =
        withContext(Dispatchers.IO) {
            if (jpegBytes.isEmpty()) {
                return@withContext FieldPhotoUploadResult.PermanentError("Foto vuota.")
            }
            if (jpegBytes.size > MAX_BYTES) {
                return@withContext FieldPhotoUploadResult.PermanentError(
                    "Foto troppo grande (max 2,5 MB).",
                )
            }

            val base = BuildConfig.TOC_BACKEND_URL.trim().removeSuffix("/")
            if (base.isBlank()) {
                return@withContext FieldPhotoUploadResult.PermanentError(
                    "Configura TOC_BACKEND_URL in dart-defines.json.",
                )
            }

            val boundary = "----GestSquadre${System.currentTimeMillis()}"
            val url = URL("$base/api/squad-field-photo")
            val connection =
                (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 30_000
                    readTimeout = 60_000
                    doOutput = true
                    setRequestProperty(
                        "Content-Type",
                        "multipart/form-data; boundary=$boundary",
                    )
                }

            try {
                connection.outputStream.use { output ->
                    writeMultipart(
                        output = output,
                        boundary = boundary,
                        sessionId = sessionId,
                        latitude = latitude,
                        longitude = longitude,
                        accuracyM = accuracyM,
                        note = note,
                        jpeg = jpegBytes,
                    )
                }

                val code = connection.responseCode
                val responseText =
                    if (code in 200..299) {
                        connection.inputStream.bufferedReader().readText()
                    } else {
                        connection.errorStream?.bufferedReader()?.readText().orEmpty()
                    }

                if (code in 200..299) {
                    FieldPhotoUploadResult.Success
                } else if (isNetworkStatus(code)) {
                    FieldPhotoUploadResult.NetworkError
                } else {
                    val message =
                        runCatching {
                            JSONObject(responseText).optString("error")
                        }.getOrNull()?.takeIf { it.isNotBlank() }
                            ?: "Invio foto fallito ($code)."
                    FieldPhotoUploadResult.PermanentError(message)
                }
            } catch (_: IOException) {
                FieldPhotoUploadResult.NetworkError
            } catch (e: Exception) {
                FieldPhotoUploadResult.PermanentError(
                    e.message ?: "Errore di rete verso TOC.",
                )
            } finally {
                connection.disconnect()
            }
        }

    private fun isNetworkStatus(code: Int): Boolean =
        code == 408 || code == 429 || code >= 502

    private fun writeMultipart(
        output: java.io.OutputStream,
        boundary: String,
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpeg: ByteArray,
    ) {
        val crlf = "\r\n"
        fun writeField(name: String, value: String) {
            output.write("--$boundary$crlf".toByteArray(Charsets.UTF_8))
            output.write(
                "Content-Disposition: form-data; name=\"$name\"$crlf$crlf"
                    .toByteArray(Charsets.UTF_8),
            )
            output.write(value.toByteArray(Charsets.UTF_8))
            output.write(crlf.toByteArray(Charsets.UTF_8))
        }

        writeField("sessionId", sessionId)
        writeField("latitude", latitude.toString())
        writeField("longitude", longitude.toString())
        if (accuracyM != null && accuracyM > 0) {
            writeField("accuracyM", accuracyM.toString())
        }
        if (!note.isNullOrBlank()) {
            writeField("note", note.trim().take(200))
        }

        output.write("--$boundary$crlf".toByteArray(Charsets.UTF_8))
        output.write(
            (
                "Content-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"$crlf" +
                    "Content-Type: image/jpeg$crlf$crlf"
            ).toByteArray(Charsets.UTF_8),
        )
        output.write(jpeg)
        output.write(crlf.toByteArray(Charsets.UTF_8))
        output.write("--$boundary--$crlf".toByteArray(Charsets.UTF_8))
    }
}
