import 'package:flutter/material.dart';

class WeeklyReviewCard extends StatelessWidget {
  final String title;
  final String summary;

  const WeeklyReviewCard({
    super.key,
    required this.title,
    required this.summary,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(summary),
          ],
        ),
      ),
    );
  }
}
