import 'package:flutter/material.dart';

class LiveSquadPin {
  LiveSquadPin({
    required this.sessionId,
    required this.squadCode,
    required this.squadName,
    required this.latitude,
    required this.longitude,
    required this.mapColor,
    required this.mapIconKey,
    this.accuracyM,
  });

  final String sessionId;
  final String squadCode;
  final String squadName;
  final double latitude;
  final double longitude;
  final Color mapColor;
  final String mapIconKey;
  final double? accuracyM;

  static LiveSquadPin? fromSummaryRow(Map<String, dynamic> row) {
    final lat = row['last_latitude'];
    final lon = row['last_longitude'];
    if (lat == null || lon == null) {
      return null;
    }
    final latN = (lat as num).toDouble();
    final lonN = (lon as num).toDouble();
    if (!latN.isFinite || !lonN.isFinite) {
      return null;
    }
    return LiveSquadPin(
      sessionId: row['session_id'] as String,
      squadCode: (row['squad_code'] as String).toUpperCase(),
      squadName: row['squad_name'] as String,
      latitude: latN,
      longitude: lonN,
      mapColor: _parseColor(row['map_color'] as String?),
      mapIconKey: _parseIconKey(row['map_icon_key'] as String?),
      accuracyM: (row['last_accuracy'] as num?)?.toDouble(),
    );
  }

  static Color _parseColor(String? raw) {
    final v = (raw ?? '').trim();
    if (v.length == 7 && v.startsWith('#')) {
      final hex = int.tryParse(v.substring(1), radix: 16);
      if (hex != null) {
        return Color(0xFF000000 | hex);
      }
    }
    return const Color(0xFF079B42);
  }

  static String _parseIconKey(String? raw) {
    final v = (raw ?? '').trim();
    return v.isEmpty ? 'croce_rossa' : v;
  }
}

class MapWaypointPin {
  MapWaypointPin({
    required this.id,
    required this.label,
    required this.iconKey,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String label;
  final String iconKey;
  final double latitude;
  final double longitude;

  String get displayName {
    final t = label.trim();
    return t.isEmpty ? 'Buca' : t;
  }

  static MapWaypointPin? fromRow(Map<String, dynamic> row) {
    final lat = row['latitude'];
    final lon = row['longitude'];
    if (lat == null || lon == null) {
      return null;
    }
    final latN = (lat as num).toDouble();
    final lonN = (lon as num).toDouble();
    if (!latN.isFinite || !lonN.isFinite) {
      return null;
    }
    return MapWaypointPin(
      id: row['id'] as String,
      label: (row['label'] as String?) ?? '',
      iconKey: (row['icon_key'] as String?)?.trim() ?? 'buche',
      latitude: latN,
      longitude: lonN,
    );
  }
}
