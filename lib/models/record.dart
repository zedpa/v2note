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
