import 'package:flutter/material.dart';
import 'package:v2note/ui/timeline_item.dart';

void main() {
  runApp(const V2NoteApp());
}

class V2NoteApp extends StatelessWidget {
  const V2NoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'V2Note',
      home: const TimelineScreen(),
    );
  }
}

class TimelineScreen extends StatelessWidget {
  const TimelineScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final items = const [
      TimelineItem(summary: 'First note', tags: ['work', 'idea']),
      TimelineItem(summary: 'Second note', tags: ['todo']),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Timeline')),
      body: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemBuilder: (context, index) => items[index],
        separatorBuilder: (context, index) => const SizedBox(height: 8),
        itemCount: items.length,
      ),
    );
  }
}
