import 'dart:convert';
import 'dart:io';

import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../constants/alarm_message.dart';
import '../models/squad_session.dart';

class GestApi {
  GestApi(this._client);

  static const squadAlreadyActiveMessage =
      'Squadra gia attiva su un altro telefono';

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
        .select('id, squad_code, squad_name, password_hash, is_enabled, can_open_operational_event')
        .eq('squad_code', squadCode.trim().toUpperCase())
        .eq('is_enabled', true)
        .maybeSingle();

    if (squad == null) {
      throw StateError('Squadra non trovata o non abilitata.');
    }

    if ((squad['password_hash'] as String? ?? '') != password.trim()) {
      throw StateError('Password squadra non valida.');
    }

    final existingOnline = await _client
        .from('squad_sessions')
        .select('id')
        .eq('event_id', eventId)
        .eq('squad_id', squad['id'])
        .eq('is_online', true)
        .maybeSingle();

    if (existingOnline != null) {
      throw StateError(GestApi.squadAlreadyActiveMessage);
    }

    final now = DateTime.now().toUtc();

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

    final session = SquadSession(
      sessionId: inserted['id'] as String,
      eventId: inserted['event_id'] as String,
      squadId: inserted['squad_id'] as String,
      squadCode: (squad['squad_code'] as String).toUpperCase(),
      squadName: squad['squad_name'] as String,
      loginAt: DateTime.parse(inserted['login_at'] as String).toLocal(),
      canOpenOperationalEvent: squad['can_open_operational_event'] == true,
    );
    await _insertSessionAuthLog(
      eventId: session.eventId,
      sessionId: session.sessionId,
      squadId: session.squadId,
      squadCode: session.squadCode,
      squadName: session.squadName,
      action: 'login',
    );
    return session;
  }

  Future<void> _insertSessionAuthLog({
    required String eventId,
    required String sessionId,
    required String squadId,
    required String squadCode,
    required String squadName,
    required String action,
  }) async {
    try {
      await _client.from('squad_session_auth_logs').insert({
        'event_id': eventId,
        'session_id': sessionId,
        'squad_id': squadId,
        'squad_code': squadCode,
        'squad_name': squadName,
        'action': action,
      });
    } catch (_) {
      // Il log non deve bloccare login/logout.
    }
  }

  Future<void> logoutSquad(String sessionId) async {
    final row = await _client
        .from('squad_sessions')
        .select('id, event_id, squad_id, squads(squad_code, squad_name)')
        .eq('id', sessionId)
        .maybeSingle();

    final now = DateTime.now().toUtc();
    await _client.from('squad_sessions').update({
      'is_online': false,
      'logout_at': now.toIso8601String(),
    }).eq('id', sessionId);

    if (row != null) {
      final squad = row['squads'] as Map<String, dynamic>?;
      await _insertSessionAuthLog(
        eventId: row['event_id'] as String,
        sessionId: row['id'] as String,
        squadId: row['squad_id'] as String,
        squadCode: (squad?['squad_code'] as String? ?? '').toUpperCase(),
        squadName: squad?['squad_name'] as String? ?? '',
        action: 'logout',
      );
    }
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

  Future<int> openOperationalEventFromField({
    required SquadSession session,
    required String tocBackendUrl,
  }) async {
    final base = tocBackendUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (base.isEmpty) {
      throw StateError('TOC_BACKEND_URL non configurato.');
    }
    final uri = Uri.parse('$base/api/operational-events/open-from-field');
    final client = HttpClient();
    try {
      final request = await client.postUrl(uri);
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'sessionId': session.sessionId}));
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final parsed = jsonDecode(body) as Map<String, dynamic>?;
        throw StateError(
          parsed?['error']?.toString() ??
              'Apertura evento fallita (HTTP ${response.statusCode}).',
        );
      }
      final parsed = jsonDecode(body) as Map<String, dynamic>;
      final event = parsed['event'] as Map<String, dynamic>?;
      final number = event?['displayNumber'] as int? ?? 0;
      if (number < 1) {
        throw StateError('Risposta apertura evento non valida.');
      }
      return number;
    } finally {
      client.close(force: true);
    }
  }

}
