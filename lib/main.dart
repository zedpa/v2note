import 'package:flutter/material.dart';
import 'package:v2note/ui/timeline_item.dart';
import 'package:v2note/ui/weekly_review_card.dart';

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

class TimelineEntry {
  final String summary;
  final List<String> tags;

  const TimelineEntry({required this.summary, required this.tags});
}

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  final List<TimelineEntry> _entries = [
    const TimelineEntry(summary: 'First note', tags: ['work', 'idea']),
    const TimelineEntry(summary: 'Second note', tags: ['todo']),
  ];

  void _addProcessedRecord() {
    setState(() {
      _entries.insert(
        0,
        const TimelineEntry(summary: 'Processed note', tags: ['auto']),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[
      const WeeklyReviewCard(
        title: 'Weekly Review',
        summary: 'Great progress this week',
      ),
      ..._entries.map(
        (entry) => TimelineItem(summary: entry.summary, tags: entry.tags),
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Timeline')),
      body: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemBuilder: (context, index) => items[index],
        separatorBuilder: (context, index) => const SizedBox(height: 8),
        itemCount: items.length,
      ),
      floatingActionButton: FloatingActionButton(
        key: const Key('recordButton'),
        onPressed: _addProcessedRecord,
        child: const Icon(Icons.mic),
      ),
    );
  }
}
