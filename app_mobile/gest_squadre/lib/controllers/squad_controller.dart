import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../constants/operational_event_activator.dart';
import '../constants/toc_push_text.dart';
import '../models/squad_session.dart';
import '../services/fcm_service.dart';
import '../services/gest_api.dart';
import '../services/gps_tracker.dart';

class SquadController extends ChangeNotifier {
  SquadController({
    required bool backendConfigured,
    String tocBackendUrl = '',
  })  : _configured = backendConfigured,
        _tocBackendUrl = tocBackendUrl.trim(),
        _api = backendConfigured ? GestApi(Supabase.instance.client) : null;

  static const _sessionKey = 'gest_squadre_session_json';

  final bool _configured;
  final String _tocBackendUrl;
  final GestApi? _api;

  bool isInitializing = true;
  bool isBusy = false;
  String? bannerMessage;
  bool bannerAlert = false;
  EventInfo? activeEvent;
  SquadSession? currentSession;
  String? lastTocMessage;
  double? lastGpsAccuracyM;

  StreamSubscription<Position>? _positionSub;
  Position? _lastPublishedPosition;
  DateTime? _lastPublishedAt;
  Timer? _bannerTimer;

  bool get backendConfigured => _configured;
  String? get gpsStatusLabel => gpsAccuracyLabel(lastGpsAccuracyM);

  Future<void> initialize() async {
    if (!_configured) {
      bannerMessage =
          'Supabase non configurato: compila dart-defines.json e rilancia con --dart-define-from-file.';
      isInitializing = false;
      notifyListeners();
      return;
    }

    try {
      activeEvent = await _api!.loadActiveEvent();
      if (activeEvent == null) {
        bannerMessage = 'Nessun evento attivo su Supabase.';
      }
      await _restoreSession();
      await registerFcmToken();
      _startPositionLoop();
    } catch (e) {
      bannerMessage = 'Errore init: $e';
    } finally {
      isInitializing = false;
      notifyListeners();
    }
  }

  Future<void> _restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionKey);
    if (raw == null) {
      return;
    }
    // Session restore: verify still online server-side
    try {
      final parts = raw.split('|');
      if (parts.length < 6) {
        return;
      }
      final sessionId = parts[0];
      final row = await Supabase.instance.client
          .from('squad_sessions')
          .select('id, is_online, event_id, squad_id, login_at')
          .eq('id', sessionId)
          .maybeSingle();
      if (row == null || row['is_online'] != true) {
        await prefs.remove(_sessionKey);
        return;
      }
      final squad = await Supabase.instance.client
          .from('squads')
          .select('squad_code, squad_name, can_open_operational_event')
          .eq('id', row['squad_id'])
          .single();
      currentSession = SquadSession(
        sessionId: sessionId,
        eventId: row['event_id'] as String,
        squadId: row['squad_id'] as String,
        squadCode: squad['squad_code'] as String,
        squadName: squad['squad_name'] as String,
        loginAt: DateTime.parse(row['login_at'] as String).toLocal(),
        canOpenOperationalEvent: squad['can_open_operational_event'] == true,
      );
    } catch (_) {
      await prefs.remove(_sessionKey);
    }
  }

  Future<void> _persistSession() async {
    final s = currentSession;
    final prefs = await SharedPreferences.getInstance();
    if (s == null) {
      await prefs.remove(_sessionKey);
      return;
    }
    await prefs.setString(
      _sessionKey,
      '${s.sessionId}|${s.eventId}|${s.squadId}|${s.squadCode}|${s.squadName}|${s.loginAt.toIso8601String()}|${s.canOpenOperationalEvent ? 1 : 0}',
    );
  }

  Future<String?> login({
    required String squadCode,
    required String password,
  }) async {
    final api = _api;
    final event = activeEvent;
    if (api == null || event == null) {
      return 'Evento attivo o Supabase mancante.';
    }
    isBusy = true;
    notifyListeners();
    try {
      final session = await api.loginSquad(
        eventId: event.id,
        squadCode: squadCode,
        password: password,
      );
      currentSession = session;
      await _persistSession();
      await registerFcmToken();
      _startPositionLoop();
      if (Firebase.apps.isEmpty) {
        bannerMessage =
            'Push TOC disabilitata: aggiungi FIREBASE_* in dart-defines e ricompila.';
      }
      return null;
    } on StateError catch (e) {
      return e.message;
    } catch (e) {
      return 'Errore login: $e';
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  Future<String?> logout() async {
    final s = currentSession;
    final api = _api;
    if (s == null || api == null) {
      return null;
    }
    isBusy = true;
    notifyListeners();
    try {
      _stopPositionTracking();
      await api.logoutSquad(s.sessionId);
      currentSession = null;
      lastGpsAccuracyM = null;
      await _persistSession();
      return null;
    } catch (e) {
      return 'Errore logout: $e';
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  bool tryBeginOperationalEventAlarm() {
    final session = currentSession;
    if (session == null || !session.canOpenOperationalEvent) {
      showTemporaryBanner(operationalEventUnauthorizedMessage);
      return false;
    }
    return true;
  }

  Future<String?> openOperationalEvent() async {
    final session = currentSession;
    final api = _api;
    if (session == null || api == null) {
      return 'Devi effettuare il login squadra.';
    }
    if (!session.canOpenOperationalEvent) {
      showTemporaryBanner(operationalEventUnauthorizedMessage);
      return operationalEventUnauthorizedMessage;
    }
    isBusy = true;
    notifyListeners();
    try {
      final number = await api.openOperationalEventFromField(
        session: session,
        tocBackendUrl: _tocBackendUrl,
      );
      showTemporaryBanner('EVENTO OPERATIVO n° $number aperto.');
      return null;
    } catch (e) {
      return 'Errore apertura evento: $e';
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  void showTemporaryBanner(String message, {Duration duration = const Duration(seconds: 10)}) {
    _bannerTimer?.cancel();
    bannerMessage = message;
    bannerAlert = true;
    notifyListeners();
    _bannerTimer = Timer(duration, () {
      if (bannerMessage == message) {
        bannerMessage = null;
        bannerAlert = false;
        notifyListeners();
      }
    });
  }

  Future<String?> sendAlarm() async {
    final s = currentSession;
    final api = _api;
    if (s == null || api == null) {
      return 'Devi effettuare il login squadra.';
    }
    isBusy = true;
    notifyListeners();
    try {
      await api.sendAlarm(session: s);
      return null;
    } catch (e) {
      return 'Errore invio allarme: $e';
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  void onTocPush(String title, String body) {
    final t = tocPushDisplayText(title);
    final b = tocPushDisplayText(body);
    lastTocMessage = b.isEmpty ? t : '$t: $b';
    notifyListeners();
  }

  Future<void> registerFcmToken([String? prefetchedToken]) async {
    final s = currentSession;
    final api = _api;
    if (s == null || api == null) {
      return;
    }
    if (Firebase.apps.isEmpty) {
      bannerMessage =
          'Push TOC disabilitata: ricompila con google-services.json e FIREBASE_* in dart-defines.';
      notifyListeners();
      return;
    }
    try {
      var token = prefetchedToken?.trim();
      token = (token != null && token.isNotEmpty)
          ? token
          : await obtainFcmToken();
      if (token == null || token.isEmpty) {
        await Future<void>.delayed(const Duration(seconds: 2));
        token = await obtainFcmToken();
      }
      if (token == null || token.isEmpty) {
        bannerMessage =
            'Token push non ottenuto: consenti notifiche, poi logout/login.';
        notifyListeners();
        return;
      }
      await api.registerFcmToken(
        sessionId: s.sessionId,
        squadId: s.squadId,
        token: token,
      );
      debugPrint('gestSQUADRE FCM: token registrato per sessione ${s.sessionId}');
      if (bannerMessage != null &&
          bannerMessage!.toLowerCase().contains('token push')) {
        bannerMessage = null;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('gestSQUADRE FCM register: $e');
      bannerMessage = 'Errore registrazione push: $e';
      notifyListeners();
    }
  }

  void _stopPositionTracking() {
    unawaited(_positionSub?.cancel());
    _positionSub = null;
    _lastPublishedPosition = null;
    _lastPublishedAt = null;
  }

  void _startPositionLoop() {
    _stopPositionTracking();
    if (currentSession == null || _api == null) {
      return;
    }
    unawaited(_startPositionStream());
  }

  Future<bool> _ensureLocationReady() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      bannerMessage = 'Attiva il GPS sul telefono per inviare la posizione al TOC.';
      notifyListeners();
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      bannerMessage = 'Permesso posizione negato: abilitalo per gestSQUADRE.';
      notifyListeners();
      return false;
    }
    return true;
  }

  Future<void> _startPositionStream() async {
    if (!await _ensureLocationReady()) {
      return;
    }

    final settings = buildGpsLocationSettings();

    final initial = await fetchInitialGpsFix();
    if (initial != null) {
      await _maybePublishPosition(initial);
    }

    _positionSub = Geolocator.getPositionStream(
      locationSettings: settings,
    ).listen(
      (pos) => unawaited(_maybePublishPosition(pos)),
      onError: (Object e) => debugPrint('GPS stream: $e'),
    );
  }

  Future<void> _maybePublishPosition(Position pos) async {
    final s = currentSession;
    final api = _api;
    if (s == null || api == null) {
      return;
    }
    if (!shouldPublishGpsFix(
      position: pos,
      lastPublished: _lastPublishedPosition,
      lastPublishedAt: _lastPublishedAt,
    )) {
      return;
    }
    try {
      await api.updatePosition(sessionId: s.sessionId, position: pos);
      _lastPublishedPosition = pos;
      _lastPublishedAt = DateTime.now();
      lastGpsAccuracyM = pos.accuracy > 0 ? pos.accuracy : null;
      notifyListeners();
    } catch (e) {
      debugPrint('GPS publish: $e');
    }
  }

  @override
  void dispose() {
    _stopPositionTracking();
    super.dispose();
  }
}
