class Idea {
  final String id;
  final String text;

  Idea({
    required this.id,
    required this.text,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
      };
}
