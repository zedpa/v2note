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
