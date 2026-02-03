import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/main.dart';

void main() {
  testWidgets('record flow adds processed item to timeline', (tester) async {
    await tester.pumpWidget(const V2NoteApp());
    expect(find.text('Processed note'), findsNothing);

    await tester.tap(find.byKey(const Key('recordButton')));
    await tester.pump();

    expect(find.text('Processed note'), findsOneWidget);
  });
}
