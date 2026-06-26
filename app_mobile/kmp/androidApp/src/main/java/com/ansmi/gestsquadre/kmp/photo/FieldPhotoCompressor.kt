package com.ansmi.gestsquadre.kmp.photo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

object FieldPhotoCompressor {
    private const val MAX_DIMENSION = 1600
    private const val JPEG_QUALITY = 82
    private const val MAX_BYTES = 2_500_000

    fun compressJpeg(input: ByteArray): ByteArray {
        if (input.isEmpty()) {
            return input
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(input, 0, input.size, bounds)
        val sampleSize = computeSampleSize(bounds.outWidth, bounds.outHeight, MAX_DIMENSION)

        val decodeOptions =
            BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
        var bitmap =
            BitmapFactory.decodeByteArray(input, 0, input.size, decodeOptions)
                ?: return input

        bitmap = applyExifRotation(input, bitmap)

        val scaled = scaleDown(bitmap, MAX_DIMENSION)
        if (scaled !== bitmap) {
            bitmap.recycle()
            bitmap = scaled
        }

        var quality = JPEG_QUALITY
        var output = encodeJpeg(bitmap, quality)
        while (output.size > MAX_BYTES && quality > 45) {
            quality -= 8
            output = encodeJpeg(bitmap, quality)
        }
        bitmap.recycle()
        return output
    }

    private fun encodeJpeg(bitmap: Bitmap, quality: Int): ByteArray {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return stream.toByteArray()
    }

    private fun computeSampleSize(width: Int, height: Int, maxDim: Int): Int {
        var sample = 1
        var w = width
        var h = height
        while (w > maxDim * 2 || h > maxDim * 2) {
            sample *= 2
            w /= 2
            h /= 2
        }
        return max(1, sample)
    }

    private fun scaleDown(bitmap: Bitmap, maxDim: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        val largest = max(width, height)
        if (largest <= maxDim) {
            return bitmap
        }
        val scale = maxDim.toFloat() / largest.toFloat()
        val matrix = Matrix().apply { setScale(scale, scale) }
        return Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)
    }

    private fun applyExifRotation(input: ByteArray, bitmap: Bitmap): Bitmap {
        val rotation =
            runCatching {
                val exif = ExifInterface(ByteArrayInputStream(input))
                when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            }.getOrDefault(0f)

        if (rotation == 0f) {
            return bitmap
        }
        val matrix = Matrix().apply { postRotate(rotation) }
        val rotated =
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) {
            bitmap.recycle()
        }
        return rotated
    }
}
