import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mindcache/core/providers.dart';
import 'package:mindcache/core/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('theme selection survives a new provider container', () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final first = ProviderContainer(
      overrides: [preferencesProvider.overrideWithValue(preferences)],
    );
    expect(first.read(themeProvider), ThemeMode.system);
    await first.read(themeProvider.notifier).select(ThemeMode.dark);
    first.dispose();
    final second = ProviderContainer(
      overrides: [preferencesProvider.overrideWithValue(preferences)],
    );
    expect(second.read(themeProvider), ThemeMode.dark);
    expect(buildTheme(dark: true).brightness, Brightness.dark);
    second.dispose();
  });
}
