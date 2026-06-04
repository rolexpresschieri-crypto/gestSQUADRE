import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'firebase_google_services.dart';

Future<bool> initializeFirebaseForMessaging() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
    return false;
  }

  var apiKey = const String.fromEnvironment('FIREBASE_ANDROID_API_KEY');
  var appId = const String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  var senderId = const String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  var projectId = const String.fromEnvironment('FIREBASE_PROJECT_ID');
  var storageBucket =
      const String.fromEnvironment('FIREBASE_STORAGE_BUCKET', defaultValue: '');

  if (apiKey.isEmpty ||
      appId.isEmpty ||
      senderId.isEmpty ||
      projectId.isEmpty) {
    final fromAsset = await loadFirebaseFromGoogleServicesAsset();
    if (fromAsset != null) {
      apiKey = fromAsset['FIREBASE_ANDROID_API_KEY'] ?? '';
      appId = fromAsset['FIREBASE_ANDROID_APP_ID'] ?? '';
      senderId = fromAsset['FIREBASE_MESSAGING_SENDER_ID'] ?? '';
      projectId = fromAsset['FIREBASE_PROJECT_ID'] ?? '';
      storageBucket = fromAsset['FIREBASE_STORAGE_BUCKET'] ?? '';
      debugPrint('gestSQUADRE FCM: config da assets/firebase/google-services.json');
    }
  }

  if (apiKey.isEmpty ||
      appId.isEmpty ||
      senderId.isEmpty ||
      projectId.isEmpty) {
    debugPrint(
      'gestSQUADRE FCM: mancano FIREBASE_* in dart-defines.json '
      'oppure assets/firebase/google-services.json (app Android com.ansmi.gest_squadre in Firebase).',
    );
    return false;
  }
  if (Firebase.apps.isNotEmpty) {
    return true;
  }

  final bucket =
      storageBucket.isNotEmpty ? storageBucket : '$projectId.appspot.com';

  await Firebase.initializeApp(
    options: FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: senderId,
      projectId: projectId,
      storageBucket: bucket,
    ),
  );

  return true;
}
