import 'dart:convert';

import 'package:flutter/services.dart';

const _androidPackage = 'com.ansmi.gest_squadre';
const _assetPath = 'assets/firebase/google-services.json';

/// Legge `google-services.json` (package gest_squadre) se presente negli asset.
Future<Map<String, String>?> loadFirebaseFromGoogleServicesAsset() async {
  try {
    final raw = await rootBundle.loadString(_assetPath);
    return _parseGoogleServices(raw);
  } catch (_) {
    return null;
  }
}

Map<String, String>? _parseGoogleServices(String raw) {
  final dynamic decoded = jsonDecode(raw);
  if (decoded is! Map<String, dynamic>) {
    return null;
  }
  final projectInfo = decoded['project_info'] as Map<String, dynamic>?;
  if (projectInfo == null) {
    return null;
  }
  final projectId = projectInfo['project_id'] as String?;
  final projectNumber = projectInfo['project_number'] as String?;
  final storageBucket = projectInfo['storage_bucket'] as String?;
  if (projectId == null || projectNumber == null) {
    return null;
  }

  final clients = decoded['client'] as List<dynamic>? ?? [];
  for (final c in clients) {
    if (c is! Map<String, dynamic>) {
      continue;
    }
    final clientInfo = c['client_info'] as Map<String, dynamic>?;
    final android = clientInfo?['android_client_info'] as Map<String, dynamic>?;
    if (android?['package_name'] != _androidPackage) {
      continue;
    }
    final appId = clientInfo?['mobilesdk_app_id'] as String?;
    final apiKeys = c['api_key'] as List<dynamic>?;
    final apiKey = apiKeys != null && apiKeys.isNotEmpty
        ? (apiKeys.first as Map<String, dynamic>)['current_key'] as String?
        : null;
    if (appId == null || apiKey == null) {
      return null;
    }
    return {
      'FIREBASE_ANDROID_API_KEY': apiKey,
      'FIREBASE_ANDROID_APP_ID': appId,
      'FIREBASE_MESSAGING_SENDER_ID': projectNumber,
      'FIREBASE_PROJECT_ID': projectId,
      'FIREBASE_STORAGE_BUCKET': storageBucket ?? '$projectId.appspot.com',
    };
  }
  return null;
}
