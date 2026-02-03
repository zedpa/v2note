class UploadQueue {
  final List<String> pending = [];

  void enqueue(String path) {
    pending.add(path);
  }
}
