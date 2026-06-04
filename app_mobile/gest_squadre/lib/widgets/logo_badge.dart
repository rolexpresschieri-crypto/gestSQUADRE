import 'package:flutter/material.dart';

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
