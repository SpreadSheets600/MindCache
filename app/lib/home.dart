import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'core/api.dart';
import 'core/providers.dart';
import 'features/folders/folders_page.dart';
import 'features/graph/graph_page.dart';
import 'features/search/search_page.dart';
import 'features/settings/settings_page.dart';
import 'features/status/status_page.dart';

class Home extends ConsumerStatefulWidget {
  const Home({super.key});

  @override
  ConsumerState<Home> createState() => _HomeState();
}

class _HomeState extends ConsumerState<Home> {
  int _index = 0;

  static const _pages = [
    SearchPage(),
    FoldersPage(),
    GraphPage(),
    StatusPage(),
    SettingsPage(),
  ];

  @override
  Widget build(BuildContext context) {
    final backend = ref.watch(backendProvider);
    ref.listen(searchFocusProvider, (_, _) => setState(() => _index = 0));
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): () =>
            ref.read(searchFocusProvider.notifier).request(),
      },
      child: Focus(autofocus: true, child: _body(backend)),
    );
  }

  Widget _body(AsyncValue<void> backend) {
    return backend.when(
      loading: () =>
          const Scaffold(body: Center(child: Text('Starting MindCache…'))),
      error: (error, _) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(Api.message(error)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => ref.invalidate(backendProvider),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
      data: (_) => Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (value) => setState(() => _index = value),
              destinations: const [
                NavigationRailDestination(
                  icon: Icon(Icons.search),
                  label: Text('Search'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.folder_outlined),
                  label: Text('Folders'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.hub_outlined),
                  label: Text('Graph'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.dataset_outlined),
                  label: Text('Index'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.tune),
                  label: Text('Settings'),
                ),
              ],
            ),
            Expanded(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 960),
                  child: IndexedStack(index: _index, children: _pages),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
