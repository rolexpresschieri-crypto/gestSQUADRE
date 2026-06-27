import 'package:flutter/material.dart';

import '../constants/alarm_message.dart';
import '../controllers/squad_controller.dart';
import '../theme/tactical_theme.dart';
import '../widgets/tactical_shell.dart';
import 'squad_login_screen.dart';
import 'toc_map_screen.dart';

Color _gpsLabelColor(double? accuracyM) {
  if (accuracyM == null || accuracyM <= 0) {
    return tacticalYellow;
  }
  if (accuracyM <= 20) {
    return const Color(0xFF8FE88F);
  }
  if (accuracyM <= 45) {
    return tacticalYellow;
  }
  return tacticalRed;
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller});

  final SquadController controller;

  Future<void> _confirmAndSendAlarm(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A2E1A),
        title: Text(
          squadAlarmDialogTitle,
          style: kTacticalTitleWhite.copyWith(fontSize: 20),
        ),
        content: Text(
          squadAlarmDialogBody,
          style: kTacticalBodyWhite.copyWith(fontSize: 15),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Annulla',
              style: kTacticalBodyWhite.copyWith(color: tacticalMuted),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: tacticalRed),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'INVIA ALLARME',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 16,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) {
      return;
    }

    final err = await controller.sendAlarm();
    if (!context.mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: tacticalRed,
        content: Text(
          err ?? squadAlarmSentOk,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final session = controller.currentSession;
        final isLogged = session != null;

        return Scaffold(
          backgroundColor: Colors.transparent,
          body: TacticalShell(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AppTitleBlock(),
                  const SizedBox(height: 24),
                  if (controller.bannerMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        controller.bannerMessage!,
                        textAlign: TextAlign.center,
                        style: kTacticalBodyWhite.copyWith(fontSize: 14),
                      ),
                    ),
                  if (controller.lastTocMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        controller.lastTocMessage!,
                        textAlign: TextAlign.center,
                        style: kTacticalBodyWhite.copyWith(fontSize: 14),
                      ),
                    ),
                  const SizedBox(height: 20),
                  Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(minHeight: 96),
                    decoration: BoxDecoration(
                      color: isLogged
                          ? tacticalGreen
                          : Colors.black.withValues(alpha: 0.48),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isLogged
                            ? Colors.white.withValues(alpha: 0.35)
                            : Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      isLogged
                          ? '${session.squadName} + ${squadTimestampFormat.format(session.loginAt)}'
                          : 'Nessuna squadra loggata',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                        shadows: kTacticalWhiteTextShadows,
                      ),
                    ),
                  ),
                  if (isLogged) ...[
                    const SizedBox(height: 14),
                    if (controller.gpsStatusLabel != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          controller.gpsStatusLabel!,
                          textAlign: TextAlign.center,
                          style: kTacticalBodyWhite.copyWith(
                            fontSize: 13,
                            color: _gpsLabelColor(controller.lastGpsAccuracyM),
                          ),
                        ),
                      ),
                  ],
                const SizedBox(height: 18),
                if (controller.isBusy)
                  const LinearProgressIndicator(color: tacticalYellow),
                const SizedBox(height: 18),
                MainButton(
                  label: 'Log-in',
                  backgroundColor: isLogged ? tacticalDisabled : tacticalGreen,
                  foregroundColor: isLogged ? tacticalMuted : Colors.white,
                  onTap: isLogged || controller.isInitializing
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => SquadLoginScreen(controller: controller),
                            ),
                          ),
                ),
                const SizedBox(height: 18),
                MainButton(
                  label: 'Log-out',
                  backgroundColor: isLogged ? tacticalRed : tacticalDisabled,
                  foregroundColor: isLogged ? Colors.white : tacticalMuted,
                  onTap: isLogged
                      ? () async {
                          final err = await controller.logout();
                          if (context.mounted && err != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(err)),
                            );
                          }
                        }
                      : null,
                ),
                const SizedBox(height: 18),
                MainButton(
                  label: 'INVIA ALLARME A TOC',
                  backgroundColor: isLogged ? tacticalRed : tacticalDisabled,
                  foregroundColor: isLogged ? Colors.white : tacticalMuted,
                  fontWeight: FontWeight.w900,
                  onTap: isLogged
                      ? () => _confirmAndSendAlarm(context)
                      : null,
                ),
                const SizedBox(height: 18),
                MainButton(
                  label: 'Tactical Operations Center',
                  backgroundColor: tacticalYellow,
                  foregroundColor: Colors.black,
                  onTap: controller.isInitializing
                      ? null
                      : () {
                          if (!controller.backendConfigured) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                backgroundColor: tacticalNavy,
                                content: Text(
                                  'Mappa TOC: configura SUPABASE_* in dart-defines.json.',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            );
                            return;
                          }
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              fullscreenDialog: true,
                              builder: (_) => TocMapScreen(
                                backendConfigured: controller.backendConfigured,
                                currentSession: controller.currentSession,
                              ),
                            ),
                          );
                        },
                ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
