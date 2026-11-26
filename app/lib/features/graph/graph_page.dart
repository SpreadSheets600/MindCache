import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import 'force_layout.dart';

const _canvas = Size(1000, 700);

class GraphPage extends ConsumerWidget {
  const GraphPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final graph = ref.watch(graphProvider);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Graph', style: theme.textTheme.headlineMedium),
              ),
              IconButton(
                tooltip: 'Refresh',
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(graphProvider),
              ),
            ],
          ),
          Text(
            'Saved pages with the people, projects and topics they share.',
            style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: graph.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Text(Api.message(error)),
              data: (data) => data.nodes.isEmpty
                  ? const Text(
                      'Save a few pages and their connections appear here.',
                    )
                  : GraphCanvas(data: data),
            ),
          ),
        ],
      ),
    );
  }
}

class GraphCanvas extends StatefulWidget {
  const GraphCanvas({super.key, required this.data});

  final GraphData data;

  @override
  State<GraphCanvas> createState() => _GraphCanvasState();
}

class _GraphCanvasState extends State<GraphCanvas> {
  late final Map<String, Offset> _layout = forceLayout(widget.data);
  GraphNode? _selected;

  Offset _screen(String id) =>
      Offset(_layout[id]!.dx * _canvas.width, _layout[id]!.dy * _canvas.height);

  void _tap(Offset point) {
    GraphNode? hit;
    var best = 18.0;
    for (final node in widget.data.nodes) {
      final distance = (_screen(node.id) - point).distance;
      if (distance < best) {
        best = distance;
        hit = node;
      }
    }
    setState(() => _selected = hit);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Card(
            clipBehavior: Clip.antiAlias,
            child: InteractiveViewer(
              constrained: false,
              boundaryMargin: const EdgeInsets.all(400),
              minScale: 0.4,
              maxScale: 3,
              child: GestureDetector(
                onTapUp: (details) => _tap(details.localPosition),
                child: CustomPaint(
                  size: _canvas,
                  painter: GraphPainter(widget.data, _layout, _selected?.id),
                ),
              ),
            ),
          ),
        ),
        if (_selected != null)
          ListTile(
            leading: Icon(_iconFor(_selected!.type)),
            title: Text(_selected!.label),
            subtitle: Text(_selected!.type),
            trailing: _selected!.url == null
                ? null
                : IconButton(
                    tooltip: 'Open page',
                    icon: const Icon(Icons.open_in_new),
                    onPressed: () => launchUrl(Uri.parse(_selected!.url!)),
                  ),
          ),
      ],
    );
  }

  IconData _iconFor(String type) => switch (type) {
    'document' => Icons.public,
    'entity' => Icons.person_outline,
    _ => Icons.tag,
  };
}

class GraphPainter extends CustomPainter {
  GraphPainter(this.data, this.layout, this.selectedId);

  final GraphData data;
  final Map<String, Offset> layout;
  final String? selectedId;

  static const _colors = {
    'document': Palette.accentDeep,
    'entity': Palette.success,
    'keyword': Palette.muted,
  };

  @override
  void paint(Canvas canvas, Size size) {
    Offset at(String id) =>
        Offset(layout[id]!.dx * size.width, layout[id]!.dy * size.height);
    final line = Paint()
      ..color = Palette.rule
      ..strokeWidth = 1;
    for (final edge in data.edges) {
      canvas.drawLine(at(edge.source), at(edge.target), line);
    }
    for (final node in data.nodes) {
      final selected = node.id == selectedId;
      final radius = node.type == 'document' ? 7.0 : 5.0;
      canvas.drawCircle(
        at(node.id),
        selected ? radius + 3 : radius,
        Paint()..color = _colors[node.type] ?? Palette.muted,
      );
      if (selected || node.type == 'document') {
        final label = TextPainter(
          text: TextSpan(
            text: node.label.length > 28
                ? '${node.label.substring(0, 28)}…'
                : node.label,
            style: const TextStyle(fontSize: 11, color: Palette.ink2),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        label.paint(canvas, at(node.id) + Offset(radius + 3, -6));
      }
    }
  }

  @override
  bool shouldRepaint(GraphPainter old) =>
      old.selectedId != selectedId || old.data != data;
}
