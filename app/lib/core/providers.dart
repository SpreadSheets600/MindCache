import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'backend.dart';
import 'models.dart';

final apiProvider = Provider<Api>((ref) => Api.local());

final preferencesProvider = Provider<SharedPreferences?>((ref) => null);

class ThemePreference extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final value = ref.watch(preferencesProvider)?.getString('theme');
    return ThemeMode.values.where((mode) => mode.name == value).firstOrNull ??
        ThemeMode.system;
  }

  Future<void> select(ThemeMode mode) async {
    state = mode;
    await ref.read(preferencesProvider)?.setString('theme', mode.name);
  }
}

final themeProvider = NotifierProvider<ThemePreference, ThemeMode>(
  ThemePreference.new,
);

final backendProvider = FutureProvider<void>((ref) async {
  final supervisor = BackendSupervisor();
  ref.onDispose(supervisor.stop);
  await supervisor.ensureRunning(ref.read(apiProvider));
});

class FoldersNotifier extends AsyncNotifier<List<Folder>> {
  @override
  Future<List<Folder>> build() => ref.read(apiProvider).folders();

  Future<void> _then(Future<void> Function(Api api) action) async {
    final api = ref.read(apiProvider);
    await action(api);
    state = AsyncData(await api.folders());
  }

  Future<void> add(String path) => _then((api) => api.addFolder(path));

  Future<void> forget(int id) => _then((api) => api.forgetFolder(id));

  Future<void> rescan(int id) => _then((api) => api.rescanFolder(id));

  Future<void> setEnabled(int id, bool enabled) =>
      _then((api) => api.setFolderEnabled(id, enabled));
}

final foldersProvider = AsyncNotifierProvider<FoldersNotifier, List<Folder>>(
  FoldersNotifier.new,
);

Stream<T> _poll<T>(Future<T> Function() load) async* {
  while (true) {
    try {
      yield await load();
    } catch (_) {
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    await Future<void>.delayed(const Duration(seconds: 2));
  }
}

final statusProvider = StreamProvider.autoDispose<IndexStatus>(
  (ref) => _poll(ref.read(apiProvider).indexStatus),
);

final downloadsProvider =
    StreamProvider.autoDispose<Map<String, DownloadState>>(
      (ref) => _poll(ref.read(apiProvider).downloads),
    );

final modelsProvider = FutureProvider.autoDispose<ModelsInfo>(
  (ref) => ref.read(apiProvider).models(),
);

class SearchState {
  const SearchState({
    this.query = '',
    this.results = const [],
    this.loading = false,
    this.refining = false,
    this.kind = SearchKind.all,
    this.error,
  });

  final String query;
  final List<SearchHit> results;
  final bool loading;
  final bool refining;
  final SearchKind kind;
  final String? error;

  SearchState copyWith({
    String? query,
    List<SearchHit>? results,
    bool? loading,
    bool? refining,
    SearchKind? kind,
  }) => SearchState(
    query: query ?? this.query,
    results: results ?? this.results,
    loading: loading ?? this.loading,
    refining: refining ?? this.refining,
    kind: kind ?? this.kind,
  );
}

enum SearchKind {
  all('Everything', []),
  pages('Pages', ['page']),
  files('Files', ['file']),
  notes('Notes & uploads', ['note', 'upload']);

  const SearchKind(this.label, this.kinds);

  final String label;
  final List<String> kinds;
}

class SearchController extends Notifier<SearchState> {
  int _latest = 0;

  @override
  SearchState build() => const SearchState();

  Future<void> setKind(SearchKind kind) {
    state = state.copyWith(kind: kind);
    return run(state.query);
  }

  Future<void> run(String query) async {
    final trimmed = query.trim();
    final ticket = ++_latest;
    final kind = state.kind;
    if (trimmed.isEmpty) {
      state = SearchState(kind: kind);
      return;
    }
    state = SearchState(
      query: trimmed,
      results: state.results,
      loading: true,
      refining: true,
      kind: kind,
    );
    final api = ref.read(apiProvider);
    try {
      final quick = await api.search(trimmed, fast: true, kinds: kind.kinds);
      if (ticket != _latest) return;
      state = SearchState(
        query: trimmed,
        results: quick,
        refining: true,
        kind: kind,
      );
      final full = await api.search(trimmed, kinds: kind.kinds);
      if (ticket == _latest) {
        state = SearchState(query: trimmed, results: full, kind: kind);
      }
    } catch (error) {
      if (ticket == _latest) {
        state = SearchState(
          query: trimmed,
          kind: kind,
          error: Api.message(error),
        );
      }
    }
  }
}

final searchProvider = NotifierProvider<SearchController, SearchState>(
  SearchController.new,
);

Future<void> startEmbeddingDownload(WidgetRef ref) async {
  await ref.read(apiProvider).startDownload('embedding');
  ref.invalidate(downloadsProvider);
}

final graphProvider = FutureProvider.autoDispose<GraphData>(
  (ref) => ref.read(apiProvider).graph(),
);

class SearchFocus extends Notifier<int> {
  @override
  int build() => 0;

  void request() => state++;
}

final searchFocusProvider = NotifierProvider<SearchFocus, int>(SearchFocus.new);

final captureProvider = FutureProvider.autoDispose<CaptureSettings>(
  (ref) => ref.read(apiProvider).capture(),
);
