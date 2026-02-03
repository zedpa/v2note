import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/services/upload_queue.dart';

void main() {
  test('queue enqueues file paths', () {
    final queue = UploadQueue();
    queue.enqueue('/tmp/a.m4a');
    expect(queue.pending.length, 1);
  });
}
