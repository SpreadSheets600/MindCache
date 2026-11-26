import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/providers.dart';
import 'core/theme.dart';
import 'desktop.dart';
import 'home.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    overrides: [preferencesProvider.overrideWithValue(preferences)],
  );
  if (Platform.isLinux || Platform.isWindows || Platform.isMacOS) {
    await DesktopShell(
      onSearch: () => container.read(searchFocusProvider.notifier).request(),
    ).start();
  }
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const MindCacheApp(),
    ),
  );
}

class MindCacheApp extends ConsumerWidget {
  const MindCacheApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'MindCache',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      darkTheme: buildTheme(dark: true),
      themeMode: ref.watch(themeProvider),
      home: const Home(),
    );
  }
}
