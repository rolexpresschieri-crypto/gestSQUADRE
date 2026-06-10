import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../widgets/logo_badge.dart';

/// Splash iniziale con motion come TOC (`_ForcedLaunchSplashScreen`).
class LaunchSplashScreen extends StatefulWidget {
  const LaunchSplashScreen({super.key});

  @override
  State<LaunchSplashScreen> createState() => _LaunchSplashScreenState();
}

class _LaunchSplashScreenState extends State<LaunchSplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _splashController;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoAlignY;
  late final Animation<double> _titleOpacity;
  late final Animation<double> _signatureOpacity;

  @override
  void initState() {
    super.initState();
    _splashController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4300),
    );
    _logoScale = Tween<double>(begin: 0.28, end: 1.0).animate(
      CurvedAnimation(parent: _splashController, curve: Curves.easeOutCubic),
    );
    _logoAlignY = Tween<double>(begin: -0.78, end: -0.22).animate(
      CurvedAnimation(parent: _splashController, curve: Curves.easeOutCubic),
    );
    _titleOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _splashController,
        curve: const Interval(0.24, 0.9, curve: Curves.easeInOut),
      ),
    );
    _signatureOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _splashController,
        curve: const Interval(0.58, 1, curve: Curves.easeIn),
      ),
    );
    _splashController.forward();
  }

  @override
  void dispose() {
    _splashController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          AnimatedBuilder(
            animation: Listenable.merge([_logoScale, _logoAlignY]),
            builder: (context, child) => Align(
              alignment: Alignment(0, _logoAlignY.value),
              child: Transform.scale(
                scale: _logoScale.value,
                alignment: Alignment.center,
                child: child,
              ),
            ),
            child: const OpenGolfLogoBanner(width: 280),
          ),
          Align(
            alignment: Alignment.center,
            child: Padding(
              padding: const EdgeInsets.only(top: 246),
              child: FadeTransition(
                opacity: _titleOpacity,
                child: Text(
                  'GESTIONE\nSQUADRE',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.blackOpsOne(
                    color: Colors.white,
                    fontSize: 44,
                    height: 1.04,
                    fontWeight: FontWeight.w400,
                    letterSpacing: 1.6,
                    shadows: const [
                      Shadow(color: Colors.black, blurRadius: 8),
                      Shadow(color: Colors.black, blurRadius: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 38,
            child: FadeTransition(
              opacity: _signatureOpacity,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.42),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'by R. Ronco',
                  style: TextStyle(
                    color: Colors.white,
                    fontStyle: FontStyle.italic,
                    fontSize: 18,
                    fontWeight: FontWeight.w400,
                    shadows: [
                      Shadow(color: Colors.black, blurRadius: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
