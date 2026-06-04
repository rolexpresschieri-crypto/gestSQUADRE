import 'dart:io';

import 'package:geolocator/geolocator.dart';

/// Soglia oltre la quale un fix non viene inviato al TOC (metri).
const double gpsMaxPublishAccuracyM = 50;

/// Intervallo minimo tra due invii (salvo fix molto migliore).
const Duration gpsMinPublishInterval = Duration(seconds: 12);

/// Stream GPS: aggiornamenti frequenti, filtro distanza basso.
LocationSettings buildGpsLocationSettings() {
  if (Platform.isAndroid) {
    return AndroidSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: 2,
      intervalDuration: const Duration(seconds: 2),
    );
  }
  if (Platform.isIOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: 2,
      pauseLocationUpdatesAutomatically: false,
    );
  }
  return const LocationSettings(
    accuracy: LocationAccuracy.best,
    distanceFilter: 2,
  );
}

bool shouldPublishGpsFix({
  required Position position,
  Position? lastPublished,
  DateTime? lastPublishedAt,
}) {
  final accuracy = position.accuracy;
  if (accuracy > 0 && accuracy > gpsMaxPublishAccuracyM) {
    return false;
  }

  if (lastPublished == null || lastPublishedAt == null) {
    return true;
  }

  final elapsed = DateTime.now().difference(lastPublishedAt);
  if (elapsed >= gpsMinPublishInterval) {
    return true;
  }

  final lastAcc = lastPublished.accuracy;
  if (accuracy > 0 && lastAcc > 0 && accuracy < lastAcc * 0.55) {
    return true;
  }

  return false;
}

String? gpsAccuracyLabel(double? accuracyM) {
  if (accuracyM == null || accuracyM <= 0) {
    return 'GPS: in attesa di fix…';
  }
  final rounded = accuracyM.round();
  return 'GPS inviato al TOC · precisione ± $rounded m';
}

/// Primo fix dopo login (attende fino a ~25 s su Android).
Future<Position?> fetchInitialGpsFix() async {
  try {
    if (Platform.isAndroid) {
      return Geolocator.getCurrentPosition(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: const Duration(seconds: 25),
        ),
      );
    }
    if (Platform.isIOS) {
      return Geolocator.getCurrentPosition(
        locationSettings: AppleSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: const Duration(seconds: 25),
        ),
      );
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
      ),
    );
  } catch (_) {
    return null;
  }
}
