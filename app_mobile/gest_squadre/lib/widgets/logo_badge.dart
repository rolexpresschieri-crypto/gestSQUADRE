import 'package:flutter/material.dart';

/// Banner Open d'Italia 2026 (logo orizzontale completo).
class OpenGolfLogoBanner extends StatelessWidget {
  const OpenGolfLogoBanner({super.key, required this.width});

  final double width;

  static const double _aspect = 840 / 200;

  @override
  Widget build(BuildContext context) {
    final innerW = width;
    final innerH = innerW / _aspect;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [
          BoxShadow(
            color: Color(0x88000000),
            blurRadius: 14,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Image.asset(
        'assets/logo_open_golf_2026.png',
        width: innerW,
        height: innerH,
        fit: BoxFit.contain,
      ),
    );
  }
}

/// Logo ANSMI circolare (come splash TOC).
class LogoBadge extends StatelessWidget {
  const LogoBadge({super.key, required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: ClipOval(
        child: Image.asset(
          'assets/logo_ansmi.png',
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}
