import 'package:flutter/material.dart';

import '../controllers/squad_controller.dart';
import '../theme/tactical_theme.dart';
import '../utils/uppercase_text_input.dart';
import '../widgets/tactical_shell.dart';

class SquadLoginScreen extends StatefulWidget {
  const SquadLoginScreen({super.key, required this.controller});

  final SquadController controller;

  @override
  State<SquadLoginScreen> createState() => _SquadLoginScreenState();
}

class _SquadLoginScreenState extends State<SquadLoginScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();

  static final _upperFormatters = [UpperCaseTextFormatter()];

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final code = _code.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Inserisci il codice squadra.')),
      );
      return;
    }
    final err = await widget.controller.login(
      squadCode: code,
      password: _password.text,
    );
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Login squadra completato.'),
      ),
    );
    if (err == null) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    const fieldStyle = TextStyle(
      color: Colors.white,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.8,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: TacticalShell(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Login squadra',
              textAlign: TextAlign.center,
              style: kTacticalTitleWhite.copyWith(fontSize: 24),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _code,
              inputFormatters: _upperFormatters,
              keyboardType: TextInputType.visiblePassword,
              autocorrect: false,
              style: fieldStyle,
              decoration: InputDecoration(
                labelText: 'Codice squadra',
                hintText: ' ',
                labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.55)),
                ),
                focusedBorder: const OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.white, width: 2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              inputFormatters: _upperFormatters,
              autocorrect: false,
              style: fieldStyle,
              decoration: InputDecoration(
                labelText: 'Password',
                labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.55)),
                ),
                focusedBorder: const OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.white, width: 2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            MainButton(
              label: 'Conferma login',
              backgroundColor: tacticalGreen,
              foregroundColor: Colors.white,
              onTap: widget.controller.isBusy ? null : _login,
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(
                'Annulla',
                style: kTacticalBodyWhite.copyWith(color: tacticalYellow),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
