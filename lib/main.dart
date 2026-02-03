import 'package:flutter/material.dart';

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
    return Scaffold(
      appBar: AppBar(title: const Text('Timeline')),
      body: const Center(child: Text('Timeline Feed')),
    );
  }
}
