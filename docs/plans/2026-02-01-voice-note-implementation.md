# Voice Note App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Flutter app that records audio via shake-trigger, uploads to Supabase, performs cloud ASR + OpenAI summarization, and renders a Twitter-style timeline with weekly review push notifications.

**Architecture:** Flutter client with local cache + upload queue, Supabase Storage/DB for persistence, Edge Function/Worker for ASR + OpenAI, and scheduled weekly review generation.

**Tech Stack:** Flutter, Dart, Supabase (Storage/DB/Edge Functions), OpenAI API, cloud ASR provider, local cache (Isar or SQLite).

### Task 1: Initialize Flutter app scaffold

**Files:**
- Create: `pubspec.yaml`
- Create: `lib/main.dart`
- Create: `test/app_smoke_test.dart`

**Step 1: Create Flutter app**

Run: `flutter create --org com.v2note .`
Expected: Flutter project files created in repo root.

**Step 2: Write a failing smoke test**

Create `test/app_smoke_test.dart`:

```dart
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
```

**Step 3: Run test to verify it fails**

Run: `flutter test test/app_smoke_test.dart`
Expected: FAIL (V2NoteApp or Timeline text not found).

**Step 4: Implement minimal app shell**

Update `lib/main.dart`:

```dart
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
    return const Scaffold(
      appBar: AppBar(title: Text('Timeline')),
      body: Center(child: Text('Timeline')),
    );
  }
}
```

**Step 5: Run test to verify it passes**

Run: `flutter test test/app_smoke_test.dart`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/main.dart test/app_smoke_test.dart pubspec.yaml
 git commit -m "feat: bootstrap flutter app"
```

### Task 2: Add core dependencies

**Files:**
- Modify: `pubspec.yaml`

**Step 1: Add dependencies**

Add to `pubspec.yaml`:

```yaml
dependencies:
  supabase_flutter: ^2.0.0
  record: ^5.0.0
  shake: ^2.2.0
  path_provider: ^2.0.0
  uuid: ^4.0.0
  intl: ^0.19.0
```

**Step 2: Run flutter pub get**

Run: `flutter pub get`
Expected: Packages downloaded.

**Step 3: Commit**

```bash
git add pubspec.yaml pubspec.lock
 git commit -m "chore: add core dependencies"
```

### Task 3: Create data models

**Files:**
- Create: `lib/models/record.dart`
- Create: `lib/models/todo.dart`
- Create: `lib/models/idea.dart`
- Create: `lib/models/tag.dart`
- Create: `lib/models/summary.dart`
- Test: `test/models/record_test.dart`

**Step 1: Write failing test**

Create `test/models/record_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/models/record.dart';

void main() {
  test('record serializes to json', () {
    final record = Record(
      id: 'r1',
      createdAt: DateTime.parse('2026-02-01T00:00:00Z'),
      status: RecordStatus.processed,
      summary: 'hello',
    );
    final json = record.toJson();
    expect(json['id'], 'r1');
    expect(json['status'], 'processed');
  });
}
```

**Step 2: Run test to verify it fails**

Run: `flutter test test/models/record_test.dart`
Expected: FAIL (Record not found).

**Step 3: Implement models**

Create `lib/models/record.dart`:

```dart
enum RecordStatus { pending, processing, processed, failed }

class Record {
  final String id;
  final DateTime createdAt;
  final RecordStatus status;
  final String? summary;

  Record({
    required this.id,
    required this.createdAt,
    required this.status,
    this.summary,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'created_at': createdAt.toIso8601String(),
        'status': status.name,
        'summary': summary,
      };
}
```

Create other model stubs with `toJson()` for TODO, idea, tag, summary (similar shape).

**Step 4: Run test to verify it passes**

Run: `flutter test test/models/record_test.dart`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/models test/models/record_test.dart
 git commit -m "feat: add core data models"
```

### Task 4: Implement shake-to-record controller

**Files:**
- Create: `lib/services/recording_service.dart`
- Create: `lib/services/shake_service.dart`
- Test: `test/services/shake_service_test.dart`

**Step 1: Write failing test**

Create `test/services/shake_service_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/services/shake_service.dart';

void main() {
  test('shake service toggles recording state', () {
    final service = ShakeService();
    expect(service.isRecording, false);
    service.onShake();
    expect(service.isRecording, true);
    service.onHangup();
    expect(service.isRecording, false);
  });
}
```

**Step 2: Run test to verify it fails**

Run: `flutter test test/services/shake_service_test.dart`
Expected: FAIL

**Step 3: Implement service**

Create `lib/services/shake_service.dart`:

```dart
class ShakeService {
  bool isRecording = false;

  void onShake() {
    isRecording = true;
  }

  void onHangup() {
    isRecording = false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `flutter test test/services/shake_service_test.dart`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/services/shake_service.dart test/services/shake_service_test.dart
 git commit -m "feat: add shake service state"
```

### Task 5: Wire recording + upload queue (stubbed)

**Files:**
- Create: `lib/services/upload_queue.dart`
- Modify: `lib/main.dart`
- Test: `test/services/upload_queue_test.dart`

**Step 1: Write failing test**

Create `test/services/upload_queue_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/services/upload_queue.dart';

void main() {
  test('queue enqueues file paths', () {
    final queue = UploadQueue();
    queue.enqueue('/tmp/a.m4a');
    expect(queue.pending.length, 1);
  });
}
```

**Step 2: Implement minimal queue**

Create `lib/services/upload_queue.dart`:

```dart
class UploadQueue {
  final List<String> pending = [];

  void enqueue(String path) {
    pending.add(path);
  }
}
```

**Step 3: Run test to verify it passes**

Run: `flutter test test/services/upload_queue_test.dart`
Expected: PASS

**Step 4: Commit**

```bash
git add lib/services/upload_queue.dart test/services/upload_queue_test.dart
 git commit -m "feat: add upload queue stub"
```

### Task 6: Timeline UI with mock data

**Files:**
- Create: `lib/ui/timeline_item.dart`
- Modify: `lib/main.dart`
- Test: `test/ui/timeline_item_test.dart`

**Step 1: Write failing test**

Create `test/ui/timeline_item_test.dart`:

```dart
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
```

**Step 2: Implement UI widget**

Create `lib/ui/timeline_item.dart`:

```dart
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
```

**Step 3: Update timeline screen**

Modify `lib/main.dart` to render a list of mock items.

**Step 4: Run tests**

Run: `flutter test test/ui/timeline_item_test.dart`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/ui/timeline_item.dart lib/main.dart test/ui/timeline_item_test.dart
 git commit -m "feat: add timeline item UI"
```

### Task 7: Supabase wiring (client + storage upload)

**Files:**
- Create: `lib/services/supabase_client.dart`
- Modify: `lib/main.dart`
- Test: `test/services/supabase_client_test.dart`

**Step 1: Write failing test**

Create `test/services/supabase_client_test.dart` with a simple config validation.

**Step 2: Implement client wrapper**

Create `lib/services/supabase_client.dart`:

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static Future<void> init({required String url, required String anonKey}) async {
    await Supabase.initialize(url: url, anonKey: anonKey);
  }

  static SupabaseClient get client => Supabase.instance.client;
}
```

**Step 3: Commit**

```bash
git add lib/services/supabase_client.dart test/services/supabase_client_test.dart
 git commit -m "feat: add supabase client wrapper"
```

### Task 8: Weekly review notifications (stub UI)

**Files:**
- Create: `lib/ui/weekly_review_card.dart`
- Test: `test/ui/weekly_review_card_test.dart`

Implement a card widget and a placeholder list in Timeline.

### Task 9: Backend worker (Edge Function) skeleton

**Files:**
- Create: `supabase/functions/process_audio/index.ts`
- Create: `supabase/functions/weekly_review/index.ts`

Include stubbed handlers that log inputs and return 200.

### Task 10: OpenAI + ASR integration (backend)

**Files:**
- Modify: `supabase/functions/process_audio/index.ts`
- Test: `supabase/functions/process_audio/__tests__/process_audio.test.ts`

Add calls to ASR provider and OpenAI, parse JSON into structured fields.

### Task 11: Final wiring + end-to-end smoke test

**Files:**
- Modify: `lib/main.dart`
- Create: `test/e2e/smoke_test.dart`

Verify: shake -> record -> upload -> display processed record.

---

Plan complete.
