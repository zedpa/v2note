import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static Future<void> init({required String url, required String anonKey}) async {
    if (url.isEmpty || anonKey.isEmpty) {
      throw ArgumentError('Supabase url and anonKey must be provided');
    }
    await Supabase.initialize(url: url, anonKey: anonKey);
  }

  static SupabaseClient get client => Supabase.instance.client;
}
