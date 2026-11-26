import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../shared/embedding_notice.dart';

class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key});

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed(String value) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 250),
      () => ref.read(searchProvider.notifier).run(value),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(searchProvider);
    ref.listen(
      searchFocusProvider,
      (_, _) => WidgetsBinding.instance.addPostFrameCallback(
        (_) => _focus.requestFocus(),
      ),
    );
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Search', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            focusNode: _focus,
            autofocus: true,
            onChanged: _changed,
            onSubmitted: (value) =>
                ref.read(searchProvider.notifier).run(value),
            decoration: InputDecoration(
              hintText: 'Search your files and saved pages',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: state.loading
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final kind in SearchKind.values)
                ChoiceChip(
                  label: Text(kind.label),
                  selected: state.kind == kind,
                  onSelected: (_) =>
                      ref.read(searchProvider.notifier).setKind(kind),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const EmbeddingNotice(),
          const SizedBox(height: 8),
          Expanded(child: _Results(state: state)),
        ],
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.state});

  final SearchState state;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    if (state.error != null) {
      return Text(
        state.error!,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      );
    }
    if (state.query.isEmpty) {
      return Text(
        'Type to search your folders, saved pages, notes and uploads.',
        style: TextStyle(color: muted),
      );
    }
    if (state.results.isEmpty && !state.loading && !state.refining) {
      return Text(
        'No matches for "${state.query}".',
        style: TextStyle(color: muted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            state.refining
                ? '${state.results.length} so far · matching by meaning…'
                : '${state.results.length} result${state.results.length == 1 ? '' : 's'}',
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: state.results.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) =>
                ResultCard(hit: state.results[index]),
          ),
        ),
      ],
    );
  }
}

class ResultCard extends ConsumerWidget {
  const ResultCard({super.key, required this.hit});

  final SearchHit hit;

  Future<void> _open(Uri uri) => launchUrl(uri);

  Uri? _target() {
    if (hit.isFile) return Uri.file(hit.location);
    if (hit.isPage) return Uri.parse(hit.location);
    if (hit.location.isEmpty) return null;
    return Uri.parse('http://127.0.0.1:8000${hit.location}');
  }

  void _showNote(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(hit.title),
        content: SingleChildScrollView(child: Text(hit.passages.join('\n\n'))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  IconData get _icon {
    if (hit.isPage) return Icons.public;
    if (hit.isNote) return Icons.sticky_note_2_outlined;
    if (hit.isFile) return Icons.insert_drive_file_outlined;
    return Icons.attach_file;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final target = _target();
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => target == null ? _showNote(context) : _open(target),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(_icon, size: 18, color: muted),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(hit.title, style: theme.textTheme.titleMedium),
                  ),
                  for (final reason in hit.reasons)
                    Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: Chip(
                        label: Text(reason),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  if (hit.isFile)
                    IconButton(
                      tooltip: 'Show in folder',
                      icon: const Icon(Icons.folder_open_outlined),
                      onPressed: () =>
                          ref.read(apiProvider).openFile(hit.id, reveal: true),
                    ),
                ],
              ),
              Text(
                hit.location,
                style: theme.textTheme.bodySmall?.copyWith(color: muted),
                overflow: TextOverflow.ellipsis,
              ),
              for (final passage in hit.passages.take(2))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    passage,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
