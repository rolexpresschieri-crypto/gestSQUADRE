import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

import '../constants/toc_push_text.dart';

const gestFcmChannelId = 'gest_squadre_alerts';
/// Canale v2: suono custom `res/raw/siren.mp3` (come AllarmeApp).
const gestTocAlarmChannelId = 'gest_squadre_toc_alarm_v2';
const gestTocAlarmSound = RawResourceAndroidNotificationSound('siren');

final _localNotifications = FlutterLocalNotificationsPlugin();

bool _isTocAlarmMessage(RemoteMessage message) {
  final type = message.data['type']?.toString().trim().toLowerCase();
  if (type == 'toc_alarm') {
    return true;
  }
  final channel = message.notification?.android?.channelId;
  return channel == gestTocAlarmChannelId;
}

Future<void> setupGestFcm({
  required void Function(String title, String body) onForegroundMessage,
  Future<void> Function(String token)? onTokenRefresh,
}) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
    return;
  }
  if (Firebase.apps.isEmpty) {
    debugPrint('setupGestFcm: Firebase non inizializzato, skip FCM.');
    return;
  }

  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _localNotifications.initialize(
    const InitializationSettings(android: androidInit),
  );

  await ensureFcmNotificationPermission();

  if (onTokenRefresh != null) {
    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      unawaited(onTokenRefresh(token));
    });
  }

  FirebaseMessaging.onMessage.listen((message) {
    final title = tocPushDisplayText(
      message.notification?.title ?? 'TOC — ALLARME',
    );
    final body = tocPushDisplayText(message.notification?.body ?? '');
    onForegroundMessage(title, body);
    _showLocalNotification(
      title: title,
      body: body,
      isAlarm: _isTocAlarmMessage(message),
    );
  });

  FirebaseMessaging.onMessageOpenedApp.listen((message) {
    final title = tocPushDisplayText(
      message.notification?.title ?? 'TOC — ALLARME',
    );
    final body = tocPushDisplayText(message.notification?.body ?? '');
    onForegroundMessage(title, body);
  });
}

/// Richiede permesso notifiche (Android 13+) prima di [obtainFcmToken].
Future<void> ensureFcmNotificationPermission() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
    return;
  }
  if (Firebase.apps.isEmpty) {
    return;
  }
  final status = await Permission.notification.status;
  if (!status.isGranted) {
    await Permission.notification.request();
  }
  await FirebaseMessaging.instance.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );
}

Future<void> _showLocalNotification({
  required String title,
  required String body,
  required bool isAlarm,
}) async {
  final android = isAlarm
      ? AndroidNotificationDetails(
          gestTocAlarmChannelId,
          'Allarme TOC (sirena)',
          channelDescription: 'Push TOC con sirena AllarmeApp',
          importance: Importance.max,
          priority: Priority.max,
          playSound: true,
          sound: gestTocAlarmSound,
          enableVibration: true,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: AudioAttributesUsage.alarm,
        )
      : const AndroidNotificationDetails(
          gestFcmChannelId,
          'gestSQUADRE avvisi',
          importance: Importance.high,
          priority: Priority.high,
        );

  await _localNotifications.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title,
    body,
    NotificationDetails(android: android),
  );
}

Future<String?> obtainFcmToken() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
    return null;
  }
  if (Firebase.apps.isEmpty) {
    return null;
  }
  try {
    await ensureFcmNotificationPermission();
    return await FirebaseMessaging.instance.getToken();
  } catch (e) {
    debugPrint('FCM token: $e');
    return null;
  }
}
