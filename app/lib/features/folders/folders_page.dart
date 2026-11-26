import 'package:file_picker/file_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';

class FoldersPage extends ConsumerWidget {
  const FoldersPage({super.key});

  Future<void> _guard(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(Api.message(error))));
    }
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final chosen = await FilePicker.pickDirectory(
      dialogTitle: 'Choose a folder to keep searchable',
    );
    if (chosen == null || !context.mounted) return;
    await _guard(
      context,
      () => ref.read(foldersProvider.notifier).add(chosen.toFilePath()),
    );
  }

  Future<void> _forget(
    BuildContext context,
    WidgetRef ref,
    Folder folder,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Forget this folder?'),
        content: Text(
          'MindCache will remove ${folder.path} from its index. Your files are not touched.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Forget'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await _guard(
      context,
      () => ref.read(foldersProvider.notifier).forget(folder.id),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final folders = ref.watch(foldersProvider);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Folders', style: theme.textTheme.headlineMedium),
              ),
              FilledButton.icon(
                onPressed: () => _add(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('Add folder'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'MindCache keeps these folders searchable and picks up new and changed files automatically.',
            style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: folders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Text(Api.message(error)),
              data: (items) => items.isEmpty
                  ? const Text('No folders yet. Add one to get started.')
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final folder = items[index];
                        return Card(
                          child: ListTile(
                            leading: const Icon(Icons.folder_outlined),
                            title: Text(folder.path),
                            subtitle: Text(_describe(folder)),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Switch(
                                  value: folder.enabled,
                                  onChanged: (value) => _guard(
                                    context,
                                    () => ref
                                        .read(foldersProvider.notifier)
                                        .setEnabled(folder.id, value),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Scan now',
                                  icon: const Icon(Icons.refresh),
                                  onPressed: () => _guard(
                                    context,
                                    () => ref
                                        .read(foldersProvider.notifier)
                                        .rescan(folder.id),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Forget folder',
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () =>
                                      _forget(context, ref, folder),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  String _describe(Folder folder) {
    if (!folder.enabled) return 'Paused';
    if (folder.status == 'unavailable') {
      return 'Unavailable. The folder cannot be reached; its index is kept.';
    }
    if (folder.lastScanAt == null) return 'Scanning for the first time';
    return 'Up to date as of ${folder.lastScanAt!.replaceFirst('T', ' ').split('.').first}';
  }
}
