import 'package:flutter/material.dart';

import '../theme/tactical_theme.dart';

/// Cornice TOC: solo bordo navy, contenuto su sfondo trasparente (camo dal root).
class TacticalShell extends StatelessWidget {
  const TacticalShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: kTacticalFrame, width: 3),
                borderRadius: BorderRadius.circular(42),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 36),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MainButton extends StatelessWidget {
  const MainButton({
    super.key,
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
    this.onTap,
    this.fontWeight = FontWeight.w800,
  });

  final String label;
  final Color backgroundColor;
  final Color foregroundColor;
  final FontWeight fontWeight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: foregroundColor,
                fontWeight: fontWeight,
                fontSize: 18,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AppTitleBlock extends StatelessWidget {
  const AppTitleBlock({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        SizedBox(
          width: 188,
          height: 188,
          child: ClipOval(
            child: Image(
              image: AssetImage('assets/logo_ansmi.png'),
              fit: BoxFit.contain,
            ),
          ),
        ),
        SizedBox(height: 18),
        Text(
          'Tracking',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontSize: 32,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            shadows: kTacticalWhiteTextShadows,
          ),
        ),
        SizedBox(height: 2),
        Text(
          'SQUADRE',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontSize: 36,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.4,
            shadows: kTacticalWhiteTextShadows,
          ),
        ),
      ],
    );
  }
}
