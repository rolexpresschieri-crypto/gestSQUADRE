import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Pantone 7427 C — CMYK 0, 100, 68, 35 (#A60035).
const Color kBrandTint = Color(0xFFA60035);
const Color kBrandBase = Color(0xFF0A0607);

/// Overlay brand: più trasparente così i pulsanti rossi (logout / allarme) risaltano.
const double kBrandBackgroundAlpha = 0.48;

const Color kTacticalBackground = kBrandBase;
const Color kTacticalFrame = Color(0xFF14295D);

const tacticalGreen = Color(0xFF079B42);
const tacticalYellow = Color(0xFFE0BE3A);
const tacticalRed = Color(0xFFC62828);
const tacticalNavy = Color(0xFF1A3066);
const tacticalSurface = Color(0xFFF4EFF6);
const tacticalMuted = Color(0xFF8A9AAA);
const tacticalDisabled = Color(0xFF4A5568);
const tacticalSoftBorder = Color(0xFFC9C2CB);

final squadTimestampFormat = DateFormat('HH:mm');

const List<Shadow> kTacticalWhiteTextShadows = [
  Shadow(color: Colors.black, blurRadius: 8),
  Shadow(color: Colors.black, blurRadius: 4),
];

const TextStyle kTacticalTitleWhite = TextStyle(
  color: Colors.white,
  fontWeight: FontWeight.w800,
  shadows: kTacticalWhiteTextShadows,
);

const TextStyle kTacticalBodyWhite = TextStyle(
  color: Colors.white,
  fontWeight: FontWeight.w600,
  shadows: kTacticalWhiteTextShadows,
);

Widget globalAppBackground() {
  return Stack(
    fit: StackFit.expand,
    children: [
      const ColoredBox(color: kBrandBase),
      ColoredBox(color: kBrandTint.withValues(alpha: kBrandBackgroundAlpha)),
    ],
  );
}
