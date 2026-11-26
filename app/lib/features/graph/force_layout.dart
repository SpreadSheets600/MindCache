import 'dart:math';
import 'dart:ui';

import '../../core/models.dart';

Map<String, Offset> forceLayout(GraphData data, {int steps = 220}) {
  final random = Random(7);
  final ids = [for (final node in data.nodes) node.id];
  if (ids.isEmpty) return {};
  final position = {
    for (final id in ids) id: Offset(random.nextDouble(), random.nextDouble()),
  };
  final k = sqrt(1 / ids.length) * 0.9;
  for (var step = 0; step < steps; step++) {
    final cooling = 0.1 * (1 - step / steps) + 0.002;
    final force = {for (final id in ids) id: Offset.zero};
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var delta = position[ids[i]]! - position[ids[j]]!;
        var distance = delta.distance;
        if (distance < 0.001) {
          delta = Offset(random.nextDouble() - 0.5, random.nextDouble() - 0.5);
          distance = max(delta.distance, 0.001);
        }
        final push = delta / distance * (k * k / distance);
        force[ids[i]] = force[ids[i]]! + push;
        force[ids[j]] = force[ids[j]]! - push;
      }
    }
    for (final edge in data.edges) {
      final delta = position[edge.source]! - position[edge.target]!;
      final distance = max(delta.distance, 0.001);
      final pull = delta / distance * (distance * distance / k);
      force[edge.source] = force[edge.source]! - pull;
      force[edge.target] = force[edge.target]! + pull;
    }
    for (final id in ids) {
      final centre = (const Offset(0.5, 0.5) - position[id]!) * 0.4;
      final total = force[id]! + centre;
      final length = max(total.distance, 0.0001);
      final move = total / length * min(length, cooling);
      final next = position[id]! + move;
      position[id] = Offset(
        next.dx.clamp(0.02, 0.98),
        next.dy.clamp(0.02, 0.98),
      );
    }
  }
  return position;
}
