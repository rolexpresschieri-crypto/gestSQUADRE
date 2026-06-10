import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/map_models.dart';

class TocMapRepository {
  TocMapRepository(this._client);

  final SupabaseClient _client;

  Future<List<LiveSquadPin>> loadLiveSquads() async {
    final rows = await _client
        .from('active_squad_summaries')
        .select('*')
        .order('squad_code', ascending: true);

    return (rows as List<dynamic>)
        .map((r) => LiveSquadPin.fromSummaryRow(r as Map<String, dynamic>))
        .whereType<LiveSquadPin>()
        .toList();
  }

  Future<Set<String>> loadAlarmingSessionIds() async {
    final rows = await _client
        .from('squad_alarms')
        .select('session_id')
        .isFilter('acknowledged_at', null);

    return (rows as List<dynamic>)
        .map((r) => (r as Map<String, dynamic>)['session_id'] as String?)
        .whereType<String>()
        .toSet();
  }

  Future<List<MapWaypointPin>> loadWaypoints() async {
    final event = await _client
        .from('events')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    if (event == null) {
      return [];
    }

    final rows = await _client
        .from('squad_map_points')
        .select('id, label, icon_key, latitude, longitude')
        .eq('event_id', event['id'] as String)
        .limit(400);

    return (rows as List<dynamic>)
        .map((r) => MapWaypointPin.fromRow(r as Map<String, dynamic>))
        .whereType<MapWaypointPin>()
        .toList();
  }
}
