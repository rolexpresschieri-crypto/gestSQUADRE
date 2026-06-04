import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'controllers/squad_controller.dart';
import 'firebase_init.dart';
import 'services/fcm_service.dart';

const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  var firebaseReady = false;
  try {
    firebaseReady = await initializeFirebaseForMessaging();
  } catch (e, stack) {
    debugPrint('Firebase init: $e\n$stack');
  }

  final backendConfigured =
      _supabaseUrl.isNotEmpty && _supabaseAnonKey.isNotEmpty;

  late final SquadController controller;

  if (backendConfigured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      anonKey: _supabaseAnonKey,
      headers: const {
        'Cache-Control': 'no-store, no-cache, max-age=0',
        'Pragma': 'no-cache',
      },
    );
    controller = SquadController(backendConfigured: true);
    await controller.initialize();
    if (firebaseReady) {
      try {
        await setupGestFcm(onForegroundMessage: controller.onTocPush);
      } catch (e, stack) {
        debugPrint('FCM setup: $e\n$stack');
      }
    } else {
      debugPrint(
        'Push TOC disabilitata: aggiungi FIREBASE_ANDROID_* in dart-defines.json '
        '(login Supabase e allarme mappa funzionano comunque).',
      );
    }
  } else {
    controller = SquadController(backendConfigured: false);
    await controller.initialize();
  }

  runApp(GestSquadreApp(controller: controller));
}
