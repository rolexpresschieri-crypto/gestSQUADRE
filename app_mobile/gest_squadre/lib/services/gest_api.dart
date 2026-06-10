import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../constants/alarm_message.dart';
import '../models/squad_session.dart';

class GestApi {
  GestApi(this._client);

  final SupabaseClient _client;

  Future<EventInfo?> loadActiveEvent() async {
    final row = await _client
        .from('events')
        .select('id, title')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    if (row == null) {
      return null;
    }

    return EventInfo(
      id: row['id'] as String,
      title: row['title'] as String,
    );
  }

  Future<SquadSession> loginSquad({
    required String eventId,
    required String squadCode,
    required String password,
  }) async {
    final squad = await _client
        .from('squads')
        .select('id, squad_code, squad_name, password_hash, is_enabled')
        .eq('squad_code', squadCode.trim().toUpperCase())
        .eq('is_enabled', true)
        .maybeSingle();

    if (squad == null) {
      throw StateError('Squadra non trovata o non abilitata.');
    }

    if ((squad['password_hash'] as String? ?? '') != password.trim()) {
      throw StateError('Password squadra non valida.');
    }

    final now = DateTime.now().toUtc();

    // Chiude eventuale sessione ancora "online" (crash app, rinomina, altro telefono).
    await _client
        .from('squad_sessions')
        .update({
          'is_online': false,
          'logout_at': now.toIso8601String(),
        })
        .eq('event_id', eventId)
        .eq('squad_id', squad['id'])
        .eq('is_online', true);
    final inserted = await _client
        .from('squad_sessions')
        .insert({
          'event_id': eventId,
          'squad_id': squad['id'],
          'is_online': true,
          'login_at': now.toIso8601String(),
        })
        .select('id, event_id, squad_id, login_at')
        .single();

    return SquadSession(
      sessionId: inserted['id'] as String,
      eventId: inserted['event_id'] as String,
      squadId: inserted['squad_id'] as String,
      squadCode: (squad['squad_code'] as String).toUpperCase(),
      squadName: squad['squad_name'] as String,
      loginAt: DateTime.parse(inserted['login_at'] as String).toLocal(),
    );
  }

  Future<void> logoutSquad(String sessionId) async {
    final now = DateTime.now().toUtc();
    await _client.from('squad_sessions').update({
      'is_online': false,
      'logout_at': now.toIso8601String(),
    }).eq('id', sessionId);
  }

  Future<void> updatePosition({
    required String sessionId,
    required Position position,
  }) async {
    await _client.from('squad_sessions').update({
      'last_latitude': position.latitude,
      'last_longitude': position.longitude,
      'last_accuracy': position.accuracy,
      'last_fix_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', sessionId);
  }

  Future<void> registerFcmToken({
    required String sessionId,
    required String squadId,
    required String token,
  }) async {
    await _client.from('squad_fcm_tokens').upsert(
      {
        'session_id': sessionId,
        'squad_id': squadId,
        'fcm_token': token,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'session_id',
    );
  }

  Future<void> sendAlarm({required SquadSession session}) async {
    await _client.from('squad_alarms').insert({
      'event_id': session.eventId,
      'session_id': session.sessionId,
      'squad_id': session.squadId,
      'squad_code': session.squadCode,
      'squad_name': session.squadName,
      'message': squadAlarmBackendLabel,
    });
  }

}
