import 'package:flutter/material.dart';

class TimelineItem extends StatelessWidget {
  final String summary;
  final List<String> tags;

  const TimelineItem({super.key, required this.summary, required this.tags});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(summary, style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: tags.map((t) => Text('#$t')).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
