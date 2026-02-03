class Summary {
  final String shortText;
  final String? longText;

  Summary({
    required this.shortText,
    this.longText,
  });

  Map<String, dynamic> toJson() => {
        'short_text': shortText,
        'long_text': longText,
      };
}
