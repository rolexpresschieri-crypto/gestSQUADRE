package com.ansmi.gestsquadre.kmp.photo

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class PendingFieldPhoto(
    val id: String,
    val sessionId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double?,
    val note: String?,
    val fileName: String,
)

class FieldPhotoUploadQueue(context: Context) {
    private val queueDir =
        File(context.filesDir, "field_photo_queue").apply { mkdirs() }
    private val indexFile = File(queueDir, "queue.json")

    fun pendingCount(): Int = listPending().size

    fun listPending(): List<PendingFieldPhoto> {
        if (!indexFile.exists()) {
            return emptyList()
        }
        return runCatching {
            val array = JSONArray(indexFile.readText())
            buildList {
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val fileName = obj.getString("fileName")
                    if (!File(queueDir, fileName).exists()) {
                        continue
                    }
                    add(
                        PendingFieldPhoto(
                            id = obj.getString("id"),
                            sessionId = obj.getString("sessionId"),
                            latitude = obj.getDouble("latitude"),
                            longitude = obj.getDouble("longitude"),
                            accuracyM =
                                if (obj.has("accuracyM") && !obj.isNull("accuracyM")) {
                                    obj.getDouble("accuracyM")
                                } else {
                                    null
                                },
                            note = obj.optString("note").takeIf { it.isNotBlank() },
                            fileName = fileName,
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun enqueue(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegBytes: ByteArray,
    ): PendingFieldPhoto {
        val id = UUID.randomUUID().toString()
        val fileName = "$id.jpg"
        File(queueDir, fileName).writeBytes(jpegBytes)

        val item =
            PendingFieldPhoto(
                id = id,
                sessionId = sessionId,
                latitude = latitude,
                longitude = longitude,
                accuracyM = accuracyM,
                note = note?.trim()?.take(200),
                fileName = fileName,
            )
        val updated = listPending().filter { it.id != id } + item
        persist(updated)
        return item
    }

    fun readJpeg(item: PendingFieldPhoto): ByteArray? =
        runCatching { File(queueDir, item.fileName).readBytes() }.getOrNull()

    fun remove(item: PendingFieldPhoto) {
        File(queueDir, item.fileName).delete()
        val updated = listPending().filter { it.id != item.id }
        persist(updated)
    }

    private fun persist(items: List<PendingFieldPhoto>) {
        if (items.isEmpty()) {
            indexFile.delete()
            return
        }
        val array = JSONArray()
        for (item in items) {
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("sessionId", item.sessionId)
                    .put("latitude", item.latitude)
                    .put("longitude", item.longitude)
                    .put("accuracyM", item.accuracyM)
                    .put("note", item.note)
                    .put("fileName", item.fileName),
            )
        }
        indexFile.writeText(array.toString())
    }
}
