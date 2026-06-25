package com.ansmi.gestsquadre.kmp.ui

import android.preference.PreferenceManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SatelliteAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ansmi.gestsquadre.kmp.map.MapLayerMode
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ansmi.gestsquadre.kmp.map.TocMapOverlaySync
import com.ansmi.gestsquadre.kmp.map.MapViewStorage
import com.ansmi.gestsquadre.kmp.ui.theme.BrandBase
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalYellow
import com.ansmi.gestsquadre.shared.GestSquadreFacade
import com.ansmi.gestsquadre.shared.model.SquadSession
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.ScaleBarOverlay

private val EsriWorldImagery =
    object : OnlineTileSourceBase(
        "EsriWorldImagery",
        0,
        19,
        256,
        ".jpg",
        arrayOf(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/",
        ),
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String {
            val z = MapTileIndex.getZoom(pMapTileIndex)
            val x = MapTileIndex.getX(pMapTileIndex)
            val y = MapTileIndex.getY(pMapTileIndex)
            return "$baseUrl$z/$y/$x.jpg"
        }
    }

@Composable
fun TocMapScreen(
    facade: GestSquadreFacade,
    currentSession: SquadSession?,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val storage = remember { MapViewStorage(appContext) }
    val focusSessionId = currentSession?.sessionId
    val viewModel: TocMapViewModel =
        viewModel(
            key = focusSessionId ?: "map-guest",
            factory = TocMapViewModelFactory(
                facade,
                appContext,
                focusSessionId,
            ),
        )
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val overlaySync = remember { TocMapOverlaySync(context) }
    var appliedLayerMode by remember { mutableStateOf(uiState.layerMode) }
    LaunchedEffect(Unit) {
        Configuration.getInstance().load(
            appContext,
            PreferenceManager.getDefaultSharedPreferences(appContext),
        )
        Configuration.getInstance().userAgentValue = appContext.packageName
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = BrandBase,
    ) { padding ->
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding),
        ) {
            if (uiState.viewReady) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        MapView(ctx).apply {
                            setMultiTouchControls(true)
                            setHorizontalMapRepetitionEnabled(false)
                            setVerticalMapRepetitionEnabled(false)
                            isTilesScaledToDpi = true
                            setFlingEnabled(true)
                            minZoomLevel = 5.0
                            maxZoomLevel = 19.0
                            setTileSource(
                                if (uiState.layerMode == MapLayerMode.ORTHOPHOTO) {
                                    EsriWorldImagery
                                } else {
                                    TileSourceFactory.MAPNIK
                                },
                            )
                            controller.setZoom(uiState.viewState.zoom)
                            controller.setCenter(
                                GeoPoint(uiState.viewState.latitude, uiState.viewState.longitude),
                            )
                            val scaleBar = ScaleBarOverlay(this)
                            scaleBar.setAlignBottom(true)
                            scaleBar.setMaxLength(1.4f)
                            scaleBar.setTextSize(28f)
                            scaleBar.setScaleBarOffset(24, 20)
                            overlays.add(scaleBar)
                            addMapListener(
                                object : MapListener {
                                    override fun onScroll(event: ScrollEvent?): Boolean {
                                        viewModel.saveView(
                                            mapCenter.latitude,
                                            mapCenter.longitude,
                                            zoomLevelDouble,
                                            storage,
                                        )
                                        return false
                                    }

                                    override fun onZoom(event: ZoomEvent?): Boolean {
                                        viewModel.saveView(
                                            mapCenter.latitude,
                                            mapCenter.longitude,
                                            zoomLevelDouble,
                                            storage,
                                        )
                                        return false
                                    }
                                },
                            )
                        }
                    },
                    update = { map ->
                        if (appliedLayerMode != uiState.layerMode) {
                            map.setTileSource(
                                if (uiState.layerMode == MapLayerMode.ORTHOPHOTO) {
                                    EsriWorldImagery
                                } else {
                                    TileSourceFactory.MAPNIK
                                },
                            )
                            appliedLayerMode = uiState.layerMode
                        }
                        overlaySync.sync(
                            map = map,
                            squads = uiState.squads,
                            waypoints = uiState.waypoints,
                            alarmingSessionIds = uiState.alarmingSessionIds,
                            focusSessionId = currentSession?.sessionId,
                            activeRoute = uiState.activeRoute,
                        )
                        map.postInvalidate()
                    },
                )
                TocMapNorthArrow(
                    modifier =
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 112.dp, end = 10.dp),
                )
            } else {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = TacticalYellow)
                }
            }

            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(Color.Black.copy(alpha = 0.72f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Default.Close, contentDescription = "Chiudi", tint = Color.White)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "TOC — Mappa operativa",
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 15.sp,
                        )
                        uiState.activeRoute?.let { route ->
                            val target = route.targetLabel?.trim().orEmpty()
                            val suffix = if (target.isNotEmpty()) " → $target" else ""
                            Text(
                                text = "Via ${route.routeCode}$suffix",
                                color = TacticalYellow,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    IconButton(
                        onClick = { viewModel.refresh() },
                        enabled = !uiState.loading,
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Aggiorna", tint = Color.White)
                    }
                }

                SingleChoiceSegmentedButtonRow(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .background(Color.Black.copy(alpha = 0.72f), RoundedCornerShape(10.dp))
                            .padding(8.dp),
                ) {
                    SegmentedButton(
                        selected = uiState.layerMode == MapLayerMode.STANDARD,
                        onClick = { viewModel.setLayer(MapLayerMode.STANDARD, storage) },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                        icon = { Icon(Icons.Default.Map, contentDescription = null) },
                        label = { Text("Stradale") },
                    )
                    SegmentedButton(
                        selected = uiState.layerMode == MapLayerMode.ORTHOPHOTO,
                        onClick = { viewModel.setLayer(MapLayerMode.ORTHOPHOTO, storage) },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                        icon = { Icon(Icons.Default.SatelliteAlt, contentDescription = null) },
                        label = { Text("Ortofoto") },
                    )
                }
            }

            Text(
                text =
                    uiState.error
                        ?: "${uiState.squads.size} squadre · ${uiState.waypoints.size} waypoint · " +
                        "sposta la mappa: la posizione resta salvata",
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(start = 8.dp, end = 8.dp, bottom = 44.dp)
                        .background(Color.Black.copy(alpha = 0.72f), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                color = if (uiState.error != null) Color(0xFFFF8A80) else Color.White.copy(alpha = 0.7f),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )

            if (uiState.loading) {
                CircularProgressIndicator(
                    modifier =
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 120.dp, end = 12.dp),
                    color = TacticalYellow,
                    strokeWidth = 2.dp,
                )
            }
        }
    }
}

@Composable
private fun TocMapNorthArrow(modifier: Modifier = Modifier) {
    Column(
        modifier =
            modifier
                .background(Color(0xD9111812), RoundedCornerShape(8.dp))
                .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "▲",
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            text = "N",
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}
