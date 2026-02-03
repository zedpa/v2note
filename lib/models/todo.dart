class Todo {
  final String id;
  final String text;
  final bool completed;

  Todo({
    required this.id,
    required this.text,
    this.completed = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'completed': completed,
      };
}
