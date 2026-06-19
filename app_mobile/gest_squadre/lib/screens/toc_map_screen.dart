import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/map_models.dart';
import '../models/squad_session.dart';
import '../services/gps_tracker.dart';
import '../services/map_layer_config.dart';
import '../services/map_view_storage.dart';
import '../services/toc_map_repository.dart';
import '../services/waypoint_icons.dart';
import '../theme/tactical_theme.dart';

String _squadMapChipLabel(LiveSquadPin squad, bool alarming) {
  final raw = squad.squadName.trim().isEmpty ? squad.squadCode : squad.squadName;
  final base = raw.length > 28 ? raw.substring(0, 28) : raw;
  final chip = base.toUpperCase();
  return alarming ? '⚠ $chip' : chip;
}

/// Mappa TOC fullscreen in-app: squadre, waypoint, layer stradale/ortofoto.
/// Accessibile senza login squadra (solo Supabase configurato).
class TocMapScreen extends StatefulWidget {
  const TocMapScreen({
    super.key,
    required this.backendConfigured,
    this.currentSession,
  });

  final bool backendConfigured;
  final SquadSession? currentSession;

  @override
  State<TocMapScreen> createState() => _TocMapScreenState();
}

class _TocMapScreenState extends State<TocMapScreen> {
  final _mapController = MapController();
  final _storage = MapViewStorage();

  List<LiveSquadPin> _squads = [];
  List<MapWaypointPin> _waypoints = [];
  Set<String> _alarmingSessionIds = {};
  MapLayerMode _layerMode = MapLayerMode.standard;
  MapViewState? _initialView;
  bool _loading = true;
  String? _error;
  bool _viewReady = false;

  RealtimeChannel? _sessionsChannel;
  RealtimeChannel? _alarmsChannel;
  RealtimeChannel? _waypointsChannel;
  Timer? _refreshTimer;
  TocMapRepository? _repo;

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    final ch = [_sessionsChannel, _alarmsChannel, _waypointsChannel];
    for (final c in ch) {
      if (c != null) {
        unawaited(Supabase.instance.client.removeChannel(c));
      }
    }
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    if (!widget.backendConfigured) {
      setState(() {
        _loading = false;
        _error = 'Supabase non configurato in dart-defines.json.';
      });
      return;
    }

    _repo = TocMapRepository(Supabase.instance.client);
    final view = await _storage.load();
    if (mounted) {
      setState(() {
        _initialView = view;
        _layerMode = view.layerMode;
        _viewReady = true;
      });
    }

    await _reloadMapData();
    _subscribeRealtime();
    _refreshTimer = Timer.periodic(tocMapRefreshInterval, (_) {
      unawaited(_reloadMapData());
    });
  }

  void _subscribeRealtime() {
    final client = Supabase.instance.client;
    _sessionsChannel = client
        .channel('gest-mobile-map-sessions')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'squad_sessions',
          callback: (_) => unawaited(_reloadMapData()),
        )
        .subscribe();

    _alarmsChannel = client
        .channel('gest-mobile-map-alarms')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'squad_alarms',
          callback: (_) => unawaited(_reloadMapData()),
        )
        .subscribe();

    _waypointsChannel = client
        .channel('gest-mobile-map-waypoints')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'squad_map_points',
          callback: (_) => unawaited(_reloadMapData()),
        )
        .subscribe();
  }

  Future<void> _reloadMapData() async {
    final repo = _repo;
    if (repo == null) {
      return;
    }
    try {
      final results = await Future.wait([
        repo.loadLiveSquads(),
        repo.loadWaypoints(),
        repo.loadAlarmingSessionIds(),
      ]);
      if (!mounted) {
        return;
      }
      setState(() {
        _squads = results[0] as List<LiveSquadPin>;
        _waypoints = results[1] as List<MapWaypointPin>;
        _alarmingSessionIds = results[2] as Set<String>;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Errore mappa: $e';
      });
    }
  }

  void _onMapMoved() {
    final cam = _mapController.camera;
    unawaited(
      _storage.saveView(
        latitude: cam.center.latitude,
        longitude: cam.center.longitude,
        zoom: cam.zoom,
      ),
    );
  }

  Future<void> _setLayer(MapLayerMode mode) async {
    setState(() => _layerMode = mode);
    await _storage.saveLayer(mode);
  }

  List<Marker> _buildMarkers() {
    final markers = <Marker>[];

    for (final wp in _waypoints) {
      markers.add(
        Marker(
          point: LatLng(wp.latitude, wp.longitude),
          width: 96,
          height: 52,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                WaypointIcons.assetPath(wp.iconKey),
                width: 26,
                height: 26,
              ),
              const SizedBox(height: 1),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6969),
                  borderRadius: BorderRadius.circular(5),
                  border: Border.all(color: Colors.white, width: 1.2),
                ),
                child: Text(
                  wp.displayName.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.black,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final selfId = widget.currentSession?.sessionId;
    for (final s in _squads) {
      final alarming = _alarmingSessionIds.contains(s.sessionId);
      final isSelf = selfId != null && s.sessionId == selfId;
      final fill = alarming ? const Color(0xFFC62828) : s.mapColor;
      final ringSize = isSelf ? 36.0 : 32.0;
      final iconSize = isSelf ? 22.0 : 20.0;
      markers.add(
        Marker(
          point: LatLng(s.latitude, s.longitude),
          width: 180,
          height: 56,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: isSelf ? ringSize + 8 : ringSize,
                height: isSelf ? ringSize + 8 : ringSize,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    if (isSelf)
                      Container(
                        width: ringSize + 8,
                        height: ringSize + 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: tacticalYellow, width: 3),
                        ),
                      ),
                    Container(
                      width: ringSize,
                      height: ringSize,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(
                          color: fill,
                          width: isSelf ? 4 : 3.5,
                        ),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x88000000),
                            blurRadius: 4,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Image.asset(
                          WaypointIcons.assetPath(s.mapIconKey),
                          width: iconSize,
                          height: iconSize,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: alarming ? const Color(0xFFC62828) : const Color(0xFF111111),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: alarming ? Colors.white : const Color(0xFF4A5568),
                    width: alarming ? 2 : 1.5,
                  ),
                ),
                child: Text(
                  _squadMapChipLabel(s, alarming),
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: alarming ? FontWeight.w900 : FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return markers;
  }

  List<CircleMarker> _buildAccuracyCircles() {
    return _squads
        .where((s) => s.accuracyM != null && s.accuracyM! > 0 && s.accuracyM! <= 120)
        .map(
          (s) => CircleMarker(
            point: LatLng(s.latitude, s.longitude),
            radius: s.accuracyM!,
            useRadiusInMeter: true,
            color: s.mapColor.withValues(alpha: 0.12),
            borderColor: s.mapColor.withValues(alpha: 0.55),
            borderStrokeWidth: 1,
          ),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kTacticalBackground,
      body: SafeArea(
        child: Stack(
          children: [
            if (_viewReady && _initialView != null)
              Positioned.fill(
                child: FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: LatLng(
                      _initialView!.latitude,
                      _initialView!.longitude,
                    ),
                    initialZoom: _initialView!.zoom,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all,
                    ),
                    onMapEvent: (event) {
                      if (event is MapEventMoveEnd) {
                        _onMapMoved();
                      }
                    },
                  ),
                  children: [
                    TileLayer(
                      key: ValueKey(_layerMode),
                      urlTemplate: MapLayerConfig.urlTemplate(_layerMode),
                      subdomains: const ['a', 'b', 'c'],
                      userAgentPackageName: 'com.ansmi.gest_squadre',
                      maxNativeZoom: 19,
                      maxZoom: 19,
                    ),
                    CircleLayer(circles: _buildAccuracyCircles()),
                    MarkerLayer(markers: _buildMarkers()),
                  ],
                ),
              )
            else
              const Positioned.fill(
                child: Center(
                  child: CircularProgressIndicator(color: tacticalYellow),
                ),
              ),
            Positioned(
              top: 8,
              left: 8,
              right: 8,
              child: Material(
                color: Colors.black.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                        tooltip: 'Chiudi',
                      ),
                      const Expanded(
                        child: Text(
                          'TOC — Mappa operativa',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.refresh, color: Colors.white),
                        onPressed: _loading ? null : () => unawaited(_reloadMapData()),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 64,
              left: 8,
              right: 8,
              child: Material(
                color: Colors.black.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: SegmentedButton<MapLayerMode>(
                          segments: const [
                            ButtonSegment(
                              value: MapLayerMode.standard,
                              label: Text('Stradale'),
                              icon: Icon(Icons.map_outlined, size: 18),
                            ),
                            ButtonSegment(
                              value: MapLayerMode.orthophoto,
                              label: Text('Ortofoto'),
                              icon: Icon(Icons.satellite_alt_outlined, size: 18),
                            ),
                          ],
                          selected: {_layerMode},
                          onSelectionChanged: (s) {
                            if (s.isNotEmpty) {
                              unawaited(_setLayer(s.first));
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: Material(
                color: Colors.black.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Text(
                    _error ??
                        '${_squads.length} squadre · ${_waypoints.length} waypoint · '
                        'sposta la mappa: la posizione resta salvata',
                    style: TextStyle(
                      color: _error != null ? const Color(0xFFFF8A80) : Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
            if (_loading)
              const Positioned(
                top: 120,
                right: 12,
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: tacticalYellow,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
