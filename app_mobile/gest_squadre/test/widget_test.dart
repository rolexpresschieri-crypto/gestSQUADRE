import 'package:flutter_test/flutter_test.dart';
import 'package:gest_squadre/app.dart';
import 'package:gest_squadre/controllers/squad_controller.dart';

void main() {
  testWidgets('Splash GESTIONE/SQUADRE poi home con titolo SQUADRE', (tester) async {
    final controller = SquadController(backendConfigured: false);
    await controller.initialize();
    await tester.pumpWidget(GestSquadreApp(controller: controller));

    expect(find.textContaining('GESTIONE'), findsOneWidget);
    expect(find.textContaining('SQUADRE'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 5500));
    await tester.pump();

    expect(find.text('Tracking'), findsOneWidget);
    expect(find.text('SQUADRE'), findsOneWidget);
  });
}
