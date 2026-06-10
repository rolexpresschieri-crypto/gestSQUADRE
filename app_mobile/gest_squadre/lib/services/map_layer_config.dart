enum MapLayerMode { standard, orthophoto }

class MapLayerConfig {
  const MapLayerConfig._();

  static String urlTemplate(MapLayerMode mode) {
    if (mode == MapLayerMode.orthophoto) {
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  static String label(MapLayerMode mode) {
    return mode == MapLayerMode.orthophoto ? 'Ortofoto' : 'Stradale';
  }

  static MapLayerMode fromStorage(String? raw) {
    return raw == 'orthophoto' ? MapLayerMode.orthophoto : MapLayerMode.standard;
  }

  static String toStorage(MapLayerMode mode) {
    return mode == MapLayerMode.orthophoto ? 'orthophoto' : 'standard';
  }
}
