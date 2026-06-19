package com.ansmi.gestsquadre.kmp.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import androidx.core.content.ContextCompat
import com.ansmi.gestsquadre.shared.model.LiveSquadPin
import com.ansmi.gestsquadre.shared.model.MapWaypointPin
import org.osmdroid.views.overlay.Marker
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private object MapMarkerMetrics {
    fun dp(context: Context, value: Float): Float =
        value * context.resources.displayMetrics.density

    fun sp(context: Context, value: Float): Float =
        value * context.resources.displayMetrics.scaledDensity
}

private const val SQUAD_CHIP_MAX_CHARS = 28

private fun squadMapChipLabel(squad: LiveSquadPin, alarming: Boolean): String {
    val base =
        squad.squadName
            .trim()
            .ifEmpty { squad.squadCode }
            .take(SQUAD_CHIP_MAX_CHARS)
            .uppercase()
    return if (alarming) "⚠ $base" else base
}

object MapMarkerFactory {
    fun squadMarker(
        context: Context,
        squad: LiveSquadPin,
        alarming: Boolean,
        isSelf: Boolean,
    ): Bitmap {
        val iconHeightPx =
            MapMarkerMetrics.dp(context, when {
                isSelf -> 32f
                alarming -> 30f
                else -> 28f
            }).roundToInt()
        val iconBitmap = loadIconBitmap(context, squad.mapIconKey, iconHeightPx, SquadIcons::drawableRes)
        val label = squadMapChipLabel(squad, alarming)
        val labelBg = if (alarming) 0xFFC62828.toInt() else 0xFF111111.toInt()
        val labelBorder = if (alarming) Color.WHITE else 0xFF4A5568.toInt()

        val textPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = MapMarkerMetrics.sp(context, 10f)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textAlign = Paint.Align.CENTER
            }
        val textWidth = textPaint.measureText(label)
        val width =
            max(
                max(iconBitmap.width.toFloat(), textWidth) + MapMarkerMetrics.dp(context, 18f),
                MapMarkerMetrics.dp(context, 168f),
            ).roundToInt()
        val labelHeight = MapMarkerMetrics.dp(context, 16f).roundToInt()
        val height = iconBitmap.height + labelHeight + MapMarkerMetrics.dp(context, 4f).roundToInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.TRANSPARENT)
        val canvas = Canvas(bitmap)
        val cx = width / 2f

        canvas.drawBitmap(
            iconBitmap,
            (cx - iconBitmap.width / 2f).roundToInt().toFloat(),
            MapMarkerMetrics.dp(context, 1f),
            null,
        )

        val labelTop = iconBitmap.height + MapMarkerMetrics.dp(context, 3f)
        val labelRect =
            RectF(
                MapMarkerMetrics.dp(context, 8f),
                labelTop,
                width - MapMarkerMetrics.dp(context, 8f),
                height - MapMarkerMetrics.dp(context, 2f),
            )
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = labelBg }
        val labelBorderPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = labelBorder
                style = Paint.Style.STROKE
                strokeWidth = MapMarkerMetrics.dp(context, if (alarming) 2f else 1.5f)
            }
        val corner = MapMarkerMetrics.dp(context, 6f)
        canvas.drawRoundRect(labelRect, corner, corner, labelPaint)
        canvas.drawRoundRect(labelRect, corner, corner, labelBorderPaint)
        canvas.drawText(
            label,
            cx,
            labelTop + MapMarkerMetrics.sp(context, 11f),
            textPaint,
        )
        return bitmap
    }

    fun waypointMarker(
        context: Context,
        waypoint: MapWaypointPin,
    ): Bitmap {
        // Allineato a Flutter (26px) / TOC web (28px icona, chip 9px).
        val iconHeightPx = MapMarkerMetrics.dp(context, 28f).roundToInt()
        val iconBitmap = loadIconBitmap(context, waypoint.iconKey, iconHeightPx, WaypointIcons::drawableRes)
        val label = waypoint.displayName.uppercase()
        val textPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = MapMarkerMetrics.sp(context, 9f)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textAlign = Paint.Align.CENTER
            }
        val textWidth = textPaint.measureText(label)
        val width =
            max(
                max(iconBitmap.width.toFloat(), textWidth) + MapMarkerMetrics.dp(context, 14f),
                MapMarkerMetrics.dp(context, 72f),
            ).roundToInt()
        val labelHeight = MapMarkerMetrics.dp(context, 14f).roundToInt()
        val height = iconBitmap.height + labelHeight + MapMarkerMetrics.dp(context, 2f).roundToInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.TRANSPARENT)
        val canvas = Canvas(bitmap)
        val cx = width / 2f

        canvas.drawBitmap(
            iconBitmap,
            cx - iconBitmap.width / 2f,
            0f,
            null,
        )

        val labelTop = iconBitmap.height + MapMarkerMetrics.dp(context, 1f)
        val padH = MapMarkerMetrics.dp(context, 5f)
        val labelRect =
            RectF(
                max(MapMarkerMetrics.dp(context, 4f), cx - textWidth / 2f - padH),
                labelTop,
                min(width - MapMarkerMetrics.dp(context, 4f), cx + textWidth / 2f + padH),
                height - MapMarkerMetrics.dp(context, 1f),
            )
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFF6969.toInt() }
        val labelBorder =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                style = Paint.Style.STROKE
                strokeWidth = MapMarkerMetrics.dp(context, 1.2f)
            }
        val corner = MapMarkerMetrics.dp(context, 5f)
        canvas.drawRoundRect(labelRect, corner, corner, labelPaint)
        canvas.drawRoundRect(labelRect, corner, corner, labelBorder)
        canvas.drawText(
            label,
            cx,
            labelTop + MapMarkerMetrics.sp(context, 9f),
            textPaint,
        )
        return bitmap
    }

    private fun loadIconBitmap(
        context: Context,
        iconKey: String?,
        targetHeightPx: Int,
        drawableRes: (String?) -> Int,
    ): Bitmap {
        val drawable =
            ContextCompat.getDrawable(context, drawableRes(iconKey))
                ?: return Bitmap.createBitmap(targetHeightPx, targetHeightPx, Bitmap.Config.ARGB_8888)

        val srcW = drawable.intrinsicWidth.coerceAtLeast(1)
        val srcH = drawable.intrinsicHeight.coerceAtLeast(1)
        val scale = targetHeightPx.toFloat() / srcH.toFloat()
        val outW = max((srcW * scale).roundToInt(), 1)
        val outH = max(targetHeightPx, 1)
        val bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.TRANSPARENT)
        val canvas = Canvas(bitmap)
        drawable.bounds = Rect(0, 0, outW, outH)
        drawable.draw(canvas)
        return bitmap
    }

    fun applyMarkerIcon(
        context: Context,
        marker: Marker,
        bitmap: Bitmap,
    ) {
        val drawable = BitmapDrawable(context.resources, bitmap)
        drawable.setBounds(0, 0, bitmap.width, bitmap.height)
        drawable.setAntiAlias(true)
        drawable.isFilterBitmap = true
        marker.icon = drawable
        marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        marker.setInfoWindow(null)
    }
}
