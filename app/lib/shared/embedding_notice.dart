import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api.dart';
import '../core/providers.dart';

class EmbeddingNotice extends ConsumerWidget {
  const EmbeddingNotice({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final models = ref.watch(modelsProvider);
    final download = ref.watch(downloadsProvider).value?['embedding'];
    final info = models.value?.embedding;
    if (info == null || info.ready) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.auto_awesome_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                download?.running == true
                    ? 'Downloading ${info.model}. Keyword search works meanwhile.'
                    : download?.status == 'failed'
                    ? 'Download failed: ${download?.error}'
                    : 'Meaning-based search needs EmbeddingGemma 2 (about 1.4 GB). Keyword search works without it.',
                style: theme.textTheme.bodyMedium,
              ),
            ),
            const SizedBox(width: 12),
            FilledButton(
              onPressed: download?.running == true
                  ? null
                  : () async {
                      final messenger = ScaffoldMessenger.of(context);
                      final confirmed = await showDialog<bool>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Download EmbeddingGemma 2?'),
                          content: const Text(
                            'About 1.4 GB from Hugging Face. It runs on this computer and is the only embedding model MindCache uses.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context, false),
                              child: const Text('Cancel'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(context, true),
                              child: const Text('Download'),
                            ),
                          ],
                        ),
                      );
                      if (confirmed != true) return;
                      try {
                        await startEmbeddingDownload(ref);
                      } catch (error) {
                        messenger.showSnackBar(
                          SnackBar(content: Text(Api.message(error))),
                        );
                      }
                    },
              child: const Text('Download'),
            ),
          ],
        ),
      ),
    );
  }
}
