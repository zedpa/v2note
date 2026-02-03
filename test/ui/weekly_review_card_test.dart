import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:v2note/ui/weekly_review_card.dart';

void main() {
  testWidgets('weekly review card shows title and summary', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: WeeklyReviewCard(title: 'Week 1', summary: 'Great progress'),
    ));
    expect(find.text('Week 1'), findsOneWidget);
    expect(find.text('Great progress'), findsOneWidget);
  });
}
