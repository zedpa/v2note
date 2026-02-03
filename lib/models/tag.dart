class Tag {
  final String name;

  Tag({
    required this.name,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
      };
}
