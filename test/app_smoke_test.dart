import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:v2note/main.dart';

void main() {
  testWidgets('app boots and shows timeline screen', (tester) async {
    await tester.pumpWidget(const V2NoteApp());
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('Timeline'), findsOneWidget);
  });
}