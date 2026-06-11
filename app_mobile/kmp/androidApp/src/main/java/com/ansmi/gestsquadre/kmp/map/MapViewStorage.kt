package com.ansmi.gestsquadre.kmp.map

import android.content.Context

data class MapViewState(
    val latitude: Double,
    val longitude: Double,
    val zoom: Double,
    val layerMode: MapLayerMode,
) {
    companion object {
        const val DEFAULT_LAT = 45.0703
        const val DEFAULT_LNG = 7.6869
        const val DEFAULT_ZOOM = 13.0

        val DEFAULT =
            MapViewState(
                latitude = DEFAULT_LAT,
                longitude = DEFAULT_LNG,
                zoom = DEFAULT_ZOOM,
                layerMode = MapLayerMode.STANDARD,
            )
    }
}

enum class MapLayerMode {
    STANDARD,
    ORTHOPHOTO,
    ;

    companion object {
        fun fromStorage(raw: String?): MapLayerMode =
            if (raw == "orthophoto") ORTHOPHOTO else STANDARD

        fun toStorage(mode: MapLayerMode): String =
            if (mode == ORTHOPHOTO) "orthophoto" else "standard"
    }
}

class MapViewStorage(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("gest_toc_map", Context.MODE_PRIVATE)

    fun load(): MapViewState =
        MapViewState(
            latitude = prefs.getFloat(KEY_LAT, MapViewState.DEFAULT_LAT.toFloat()).toDouble(),
            longitude = prefs.getFloat(KEY_LNG, MapViewState.DEFAULT_LNG.toFloat()).toDouble(),
            zoom = prefs.getFloat(KEY_ZOOM, MapViewState.DEFAULT_ZOOM.toFloat()).toDouble(),
            layerMode = MapLayerMode.fromStorage(prefs.getString(KEY_LAYER, null)),
        )

    fun saveView(
        latitude: Double,
        longitude: Double,
        zoom: Double,
    ) {
        prefs.edit()
            .putFloat(KEY_LAT, latitude.toFloat())
            .putFloat(KEY_LNG, longitude.toFloat())
            .putFloat(KEY_ZOOM, zoom.toFloat())
            .apply()
    }

    fun saveLayer(mode: MapLayerMode) {
        prefs.edit()
            .putString(KEY_LAYER, MapLayerMode.toStorage(mode))
            .apply()
    }

    companion object {
        private const val KEY_LAT = "gest_toc_map_lat"
        private const val KEY_LNG = "gest_toc_map_lng"
        private const val KEY_ZOOM = "gest_toc_map_zoom"
        private const val KEY_LAYER = "gest_toc_map_layer"
    }
}
