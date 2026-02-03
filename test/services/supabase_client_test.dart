import 'package:flutter_test/flutter_test.dart';
import 'package:v2note/services/supabase_client.dart';

void main() {
  test('supabase client init requires url and anon key', () async {
    await expectLater(
      () => SupabaseService.init(url: '', anonKey: ''),
      throwsA(isA<ArgumentError>()),
    );
  });
}
