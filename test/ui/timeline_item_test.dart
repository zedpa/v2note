import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:v2note/ui/timeline_item.dart';

void main() {
  testWidgets('timeline item shows summary and tags', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: TimelineItem(summary: 'Hi', tags: ['work']),
    ));
    expect(find.text('Hi'), findsOneWidget);
    expect(find.text('#work'), findsOneWidget);
  });
}
