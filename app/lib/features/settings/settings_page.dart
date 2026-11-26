import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final models = ref.watch(modelsProvider);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: models.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Text(Api.message(error)),
        data: (info) => ListView(
          children: [
            Text('Settings', style: theme.textTheme.headlineMedium),
            const SizedBox(height: 24),
            Text('Appearance', style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(value: ThemeMode.system, label: Text('System')),
                ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
              ],
              selected: {ref.watch(themeProvider)},
              onSelectionChanged: (selection) =>
                  ref.read(themeProvider.notifier).select(selection.first),
            ),
            const SizedBox(height: 32),
            Text('Embeddings', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              '${info.embedding.model} · ${info.embedding.dimension} dimensions · runs on ${info.embedding.device}. This is the only embedding model MindCache uses.',
              style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 32),
            Text('Text generation', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            GenerationForm(generation: info.generation),
          ],
        ),
      ),
    );
  }
}

class GenerationForm extends ConsumerStatefulWidget {
  const GenerationForm({super.key, required this.generation});

  final Generation generation;

  @override
  ConsumerState<GenerationForm> createState() => _GenerationFormState();
}

class _GenerationFormState extends ConsumerState<GenerationForm> {
  late String _provider = widget.generation.provider;
  late bool _allowRemote = widget.generation.allowRemote;
  late final _model = TextEditingController(text: widget.generation.model);
  late final _endpoint = TextEditingController(
    text: widget.generation.endpoint,
  );
  final _key = TextEditingController();
  String? _message;

  bool get _remote => _provider == 'ollama' || _provider == 'openai';

  @override
  void dispose() {
    _model.dispose();
    _endpoint.dispose();
    _key.dispose();
    super.dispose();
  }

  Future<void> _save({bool clearKey = false}) async {
    try {
      await ref
          .read(apiProvider)
          .saveGeneration(
            provider: _provider,
            model: _model.text.trim(),
            endpoint: _endpoint.text.trim(),
            allowRemote: _allowRemote,
            apiKey: clearKey
                ? ''
                : (_key.text.trim().isEmpty ? null : _key.text.trim()),
          );
      _key.clear();
      ref.invalidate(modelsProvider);
      setState(
        () => _message = clearKey ? 'Saved key removed.' : 'Settings saved.',
      );
    } catch (error) {
      setState(() => _message = Api.message(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Optional. Used only when you ask for a summary. Remote providers receive the text they are asked about.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _provider,
          decoration: const InputDecoration(labelText: 'Provider'),
          items: const [
            DropdownMenuItem(value: 'disabled', child: Text('Off')),
            DropdownMenuItem(value: 'transformers', child: Text('Local model')),
            DropdownMenuItem(value: 'ollama', child: Text('Ollama')),
            DropdownMenuItem(
              value: 'openai',
              child: Text('OpenAI-compatible API'),
            ),
          ],
          onChanged: (value) => setState(() => _provider = value ?? 'disabled'),
        ),
        if (_provider != 'disabled') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _model,
            decoration: const InputDecoration(labelText: 'Model'),
          ),
        ],
        if (_remote) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _endpoint,
            decoration: const InputDecoration(
              labelText: 'Endpoint',
              hintText: 'https://api.example.com/v1',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _key,
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'API key',
              hintText: widget.generation.apiKeySet
                  ? 'Saved. Leave blank to keep it'
                  : 'Optional',
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Allow remote processing'),
            subtitle: const Text('Send prompts to this endpoint'),
            value: _allowRemote,
            onChanged: (value) => setState(() => _allowRemote = value),
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            FilledButton(onPressed: _save, child: const Text('Save')),
            if (widget.generation.apiKeySet) ...[
              const SizedBox(width: 12),
              OutlinedButton(
                onPressed: () => _save(clearKey: true),
                child: const Text('Remove saved key'),
              ),
            ],
          ],
        ),
        if (_message != null) ...[const SizedBox(height: 12), Text(_message!)],
      ],
    );
  }
}
