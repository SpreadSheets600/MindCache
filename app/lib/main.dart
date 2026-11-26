import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'core/providers.dart';
import 'core/theme.dart';
import 'desktop.dart';
import 'home.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
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

class MindCacheApp extends StatelessWidget {
  const MindCacheApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MindCache',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const Home(),
    );
  }
}
