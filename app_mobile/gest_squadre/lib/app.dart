import 'dart:async';

import 'package:flutter/material.dart';

import 'controllers/squad_controller.dart';
import 'screens/home_screen.dart';
import 'screens/launch_splash_screen.dart';
import 'theme/tactical_theme.dart';

class GestSquadreApp extends StatefulWidget {
  const GestSquadreApp({
    super.key,
    required this.controller,
  });

  final SquadController controller;

  @override
  State<GestSquadreApp> createState() => _GestSquadreAppState();
}

class _GestSquadreAppState extends State<GestSquadreApp> {
  bool _showBootSplash = true;

  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 5500), () {
      if (!mounted) {
        return;
      }
      setState(() {
        _showBootSplash = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'gestSQUADRE',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.transparent,
      ),
      builder: (context, child) {
        return Stack(
          fit: StackFit.expand,
          children: [
            globalAppBackground(),
            child ?? const SizedBox.shrink(),
          ],
        );
      },
      home: _showBootSplash
          ? const LaunchSplashScreen()
          : HomeScreen(controller: widget.controller),
    );
  }
}
