import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Come TOC (`app.dart`): camo attenuato su fondo scuro.
const double kVegetatoTextureOpacity = 0.44;
const Color kTacticalBackground = Color(0xFF050505);
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

Widget globalVegetatoBackground() {
  return Stack(
    fit: StackFit.expand,
    children: [
      const ColoredBox(color: kTacticalBackground),
      IgnorePointer(
        child: Opacity(
          opacity: kVegetatoTextureOpacity,
          child: Image.asset(
            'assets/bg_vegetato.png',
            fit: BoxFit.cover,
            alignment: Alignment.center,
            filterQuality: FilterQuality.medium,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
      ),
    ],
  );
}
