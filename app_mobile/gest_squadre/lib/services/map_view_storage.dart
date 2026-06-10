import 'package:shared_preferences/shared_preferences.dart';

import 'map_layer_config.dart';

class MapViewState {
  const MapViewState({
    required this.latitude,
    required this.longitude,
    required this.zoom,
    required this.layerMode,
  });

  final double latitude;
  final double longitude;
  final double zoom;
  final MapLayerMode layerMode;
}

class MapViewStorage {
  static const _latKey = 'gest_toc_map_lat';
  static const _lngKey = 'gest_toc_map_lng';
  static const _zoomKey = 'gest_toc_map_zoom';
  static const _layerKey = 'gest_toc_map_layer';

  static const defaultLat = 45.0703;
  static const defaultLng = 7.6869;
  static const defaultZoom = 13.0;

  Future<MapViewState> load() async {
    final prefs = await SharedPreferences.getInstance();
    return MapViewState(
      latitude: prefs.getDouble(_latKey) ?? defaultLat,
      longitude: prefs.getDouble(_lngKey) ?? defaultLng,
      zoom: prefs.getDouble(_zoomKey) ?? defaultZoom,
      layerMode: MapLayerConfig.fromStorage(prefs.getString(_layerKey)),
    );
  }

  Future<void> saveView({
    required double latitude,
    required double longitude,
    required double zoom,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_latKey, latitude);
    await prefs.setDouble(_lngKey, longitude);
    await prefs.setDouble(_zoomKey, zoom);
  }

  Future<void> saveLayer(MapLayerMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_layerKey, MapLayerConfig.toStorage(mode));
  }
}
