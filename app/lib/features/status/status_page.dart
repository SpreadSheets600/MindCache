import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../shared/embedding_notice.dart';

class StatusPage extends ConsumerWidget {
  const StatusPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(statusProvider).value;
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.all(32),
      child: ListView(
        children: [
          Text('Index', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 16),
          const EmbeddingNotice(),
          const SizedBox(height: 8),
          if (status == null)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${status.indexed} of ${status.total} files searchable',
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    LinearProgressIndicator(
                      value: status.total == 0
                          ? 0
                          : status.indexed / status.total,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _summary(status),
                            style: TextStyle(color: muted),
                          ),
                        ),
                        OutlinedButton.icon(
                          onPressed: () async {
                            await ref
                                .read(apiProvider)
                                .setIndexPaused(!status.paused);
                            ref.invalidate(statusProvider);
                          },
                          icon: Icon(
                            status.paused ? Icons.play_arrow : Icons.pause,
                          ),
                          label: Text(status.paused ? 'Resume' : 'Pause'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in status.files.entries)
                  Chip(label: Text('${entry.key}: ${entry.value}')),
                Chip(label: Text('vectors: ${status.vectors}')),
                Chip(
                  label: Text(
                    status.embedding == 'ready'
                        ? 'semantic search on'
                        : 'semantic search off',
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _summary(IndexStatus status) {
    if (status.paused) return 'Indexing is paused. ${status.queued} waiting.';
    if (status.queued == 0) return 'Nothing waiting to be indexed.';
    final eta = status.etaSeconds;
    final left = eta == null
        ? ''
        : eta < 90
        ? ' About $eta seconds left.'
        : ' About ${(eta / 60).ceil()} minutes left.';
    return '${status.queued} waiting to be indexed.$left';
  }
}
