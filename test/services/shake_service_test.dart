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
