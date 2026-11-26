import 'dart:io';

import 'api.dart';

class BackendSupervisor {
  Process? _process;

  Future<void> ensureRunning(Api api) async {
    if (await api.reachable()) return;
    final root = _findRoot();
    if (root == null) {
      throw StateError(
        'Could not find the MindCache backend. Set MINDCACHE_ROOT to the project folder.',
      );
    }
    _process = await Process.start('$root/backend/.venv/bin/python', [
      '-m',
      'uvicorn',
      'app.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      '8000',
    ], workingDirectory: '$root/backend');
    for (var attempt = 0; attempt < 120; attempt++) {
      if (await api.reachable()) return;
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    throw StateError('The MindCache backend did not start in time.');
  }

  void stop() => _process?.kill();

  String? _findRoot() {
    final configured = Platform.environment['MINDCACHE_ROOT'];
    final starts = [
      ?configured,
      Directory.current.path,
      File(Platform.resolvedExecutable).parent.path,
    ];
    for (final start in starts) {
      var directory = Directory(start);
      while (true) {
        if (File('${directory.path}/backend/app/main.py').existsSync()) {
          return directory.path;
        }
        final parent = directory.parent;
        if (parent.path == directory.path) break;
        directory = parent;
      }
    }
    return null;
  }
}
