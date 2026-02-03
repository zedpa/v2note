class ShakeService {
  bool isRecording = false;

  void onShake() {
    isRecording = true;
  }

  void onHangup() {
    isRecording = false;
  }
}
