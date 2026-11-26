import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mindcache/core/api.dart';
import 'package:mindcache/core/models.dart';
import 'package:mindcache/core/providers.dart';
import 'package:mindcache/features/graph/force_layout.dart';
import 'package:mindcache/features/graph/graph_page.dart';
import 'package:mindcache/home.dart';

class FakeApi extends Api {
  FakeApi() : super(Dio());

  final calls = <String>[];
  Map<String, Object?>? savedGeneration;
  var apiKeySet = false;
  var embeddingReady = true;
  var folderList = [
    Folder(
      id: 1,
      path: '/home/me/notes',
      enabled: true,
      status: 'ready',
      lastScanAt: '2026-11-25T10:00:00',
    ),
  ];

  @override
  Future<bool> reachable() async => true;

  @override
  Future<List<SearchHit>> search(
    String query, {
    bool fast = false,
    List<String> kinds = const [],
  }) async {
    calls.add('search:$query${fast ? ':fast' : ''}');
    return [
      SearchHit(
        kind: 'file',
        id: 1,
        title: 'cells.md',
        location: '/home/me/notes/cells.md',
        reasons: ['keyword', 'semantic'],
        passages: ['The mitochondria produces energy for the cell.'],
      ),
      SearchHit(
        kind: 'page',
        id: 7,
        title: 'Cell biology primer',
        location: 'https://example.com/cells',
        reasons: ['keyword'],
        passages: ['Mitochondria in eukaryotic cells.'],
      ),
      SearchHit(
        kind: 'note',
        id: 9,
        title: 'Lab note',
        location: '',
        reasons: ['semantic'],
        passages: ['Remember to label the cell cultures.'],
      ),
    ];
  }

  @override
  Future<List<Folder>> folders() async => folderList;

  @override
  Future<void> setFolderEnabled(int id, bool enabled) async {
    calls.add('enabled:$id:$enabled');
    folderList = [
      Folder(
        id: id,
        path: folderList.first.path,
        enabled: enabled,
        status: 'ready',
        lastScanAt: folderList.first.lastScanAt,
      ),
    ];
  }

  @override
  Future<void> forgetFolder(int id) async {
    calls.add('forget:$id');
    folderList = [];
  }

  var paused = false;

  @override
  Future<void> addFolder(String path) async {
    calls.add('add:$path');
    folderList = [
      ...folderList,
      Folder(
        id: folderList.length + 10,
        path: path,
        enabled: true,
        status: 'pending',
        lastScanAt: null,
      ),
    ];
  }

  var captureSettings = const CaptureSettings(
    autoTracking: false,
    autoExtract: true,
    delaySeconds: 10,
    excludedDomains: ['localhost'],
  );

  @override
  Future<CaptureSettings> capture() async => captureSettings;

  @override
  Future<void> saveCapture(CaptureSettings settings) async {
    calls.add('capture:${settings.autoTracking}:${settings.delaySeconds}');
    captureSettings = settings;
  }

  @override
  Future<void> openFile(int id, {bool reveal = false}) async {
    calls.add('open:$id:$reveal');
  }

  @override
  Future<IndexStatus> indexStatus() async => IndexStatus(
    files: {'indexed': 8, 'pending': 2},
    queued: 2,
    vectors: 31,
    embedding: 'ready',
    paused: paused,
    etaSeconds: 40,
  );

  @override
  Future<void> setIndexPaused(bool value) async {
    calls.add('paused:$value');
    paused = value;
  }

  @override
  Future<ModelsInfo> models() async => ModelsInfo(
    embedding: EmbeddingInfo(
      model: 'google/embeddinggemma-2',
      dimension: 768,
      status: embeddingReady ? 'ready' : 'not_downloaded',
      device: 'cpu',
    ),
    generation: Generation(
      provider: 'openai',
      model: 'writer',
      endpoint: 'https://example.com/v1',
      apiKeySet: apiKeySet,
      allowRemote: true,
    ),
  );

  @override
  Future<void> saveGeneration({
    required String provider,
    required String model,
    required String endpoint,
    required bool allowRemote,
    String? apiKey,
  }) async {
    savedGeneration = {
      'provider': provider,
      'model': model,
      'allowRemote': allowRemote,
      'apiKey': apiKey,
    };
  }

  @override
  Future<GraphData> graph() async => GraphData.fromJson({
    'nodes': {
      'documents': [
        {
          'id': 'doc_1',
          'label': 'Cell biology primer',
          'url': 'https://example.com/cells',
        },
        {
          'id': 'doc_2',
          'label': 'Lab protocol',
          'url': 'https://example.com/lab',
        },
      ],
      'entities': [
        {'id': 'ent_0', 'name': 'ATP', 'type': 'Technology'},
      ],
      'keywords': [
        {'id': 'kw_0', 'keyword': 'mitochondria'},
      ],
    },
    'edges': [
      {'source': 'doc_1', 'target': 'ent_0'},
      {'source': 'doc_2', 'target': 'ent_0'},
      {'source': 'doc_1', 'target': 'missing_node'},
    ],
  });

  @override
  Future<void> startDownload(String task) async => calls.add('download:$task');

  @override
  Future<Map<String, DownloadState>> downloads() async => {};
}

Future<void> show(WidgetTester tester, FakeApi api) async {
  tester.view.physicalSize = const Size(1400, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(api),
        backendProvider.overrideWith((ref) async {}),
        statusProvider.overrideWith(
          (ref) => Stream.fromFuture(api.indexStatus()),
        ),
        downloadsProvider.overrideWith(
          (ref) => Stream.value(<String, DownloadState>{}),
        ),
      ],
      child: const MaterialApp(home: Home()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> openTab(WidgetTester tester, String label) async {
  const icons = {
    'Folders': Icons.folder_outlined,
    'Index': Icons.dataset_outlined,
    'Graph': Icons.hub_outlined,
    'Settings': Icons.tune,
  };
  await tester.tap(find.byIcon(icons[label]!));
  await tester.pumpAndSettle();
}

void main() {
  test('force layout pulls connected nodes closer than unconnected ones', () {
    final data = GraphData(
      nodes: [
        for (final id in ['a', 'b', 'c', 'd', 'e'])
          GraphNode(id: id, label: id, type: 'document'),
      ],
      edges: [
        GraphEdge(source: 'a', target: 'b'),
        GraphEdge(source: 'b', target: 'c'),
      ],
    );
    final layout = forceLayout(data);
    expect(layout.length, 5);
    final linked = (layout['a']! - layout['b']!).distance;
    final loose = (layout['a']! - layout['e']!).distance;
    expect(linked, lessThan(loose));
    expect(forceLayout(data)['a'], layout['a']);
  });

  test('models parse backend json', () {
    final hit = SearchHit.fromJson({
      'kind': 'page',
      'id': 4,
      'title': 'A page',
      'location': 'https://x.test/a',
      'reasons': ['keyword'],
      'passages': [
        {'text': 'hello', 'start': 0},
      ],
    });
    expect(hit.passages, ['hello']);
    expect(hit.isPage, isTrue);
    final status = IndexStatus.fromJson({
      'files': {'indexed': 3, 'skipped': 1},
      'queued': 0,
      'vectors': 9,
      'embedding': 'ready',
    });
    expect(status.total, 4);
    expect(status.indexed, 3);
    final graph = GraphData.fromJson({
      'nodes': {
        'files': [
          {'id': 'file_1', 'label': 'notes.md', 'path': '/tmp/notes.md'},
        ],
        'folders': [
          {'id': 'folder_1', 'label': '/tmp'},
        ],
      },
      'edges': [
        {'source': 'file_1', 'target': 'folder_1'},
      ],
    });
    expect(graph.nodes.first.type, 'file');
    expect(graph.nodes.first.path, '/tmp/notes.md');
    expect(graph.edges.single.target, 'folder_1');
  });

  testWidgets('typing searches and shows passages with reasons', (
    tester,
  ) async {
    final api = FakeApi();
    await show(tester, api);
    await tester.enterText(find.byType(TextField), 'mitochondria');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(api.calls, contains('search:mitochondria'));
    expect(find.text('cells.md'), findsOneWidget);
    expect(find.textContaining('produces energy'), findsOneWidget);
    expect(find.text('semantic'), findsNWidgets(2));
    expect(find.text('Cell biology primer'), findsOneWidget);
    expect(find.byIcon(Icons.public), findsOneWidget);
    expect(find.byTooltip('Show in folder'), findsOneWidget);
    expect(find.byIcon(Icons.sticky_note_2_outlined), findsOneWidget);
    await tester.tap(find.text('Lab note'));
    await tester.pumpAndSettle();
    expect(find.textContaining('label the cell cultures'), findsWidgets);
    expect(find.text('Close'), findsOneWidget);
  });

  testWidgets('results show instantly by words, then settle on meaning', (
    tester,
  ) async {
    final api = FakeApi();
    await show(tester, api);
    await tester.enterText(find.byType(TextField), 'cells');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(
      api.calls.indexOf('search:cells:fast'),
      lessThan(api.calls.indexOf('search:cells')),
    );
    expect(find.text('3 results'), findsOneWidget);
    await tester.tap(find.text('Files'));
    await tester.pumpAndSettle();
    expect(
      api.calls.where((call) => call.startsWith('search:cells')).length,
      4,
    );
  });

  testWidgets('show in folder asks the backend to reveal the file', (
    tester,
  ) async {
    final api = FakeApi();
    await show(tester, api);
    await tester.enterText(find.byType(TextField), 'cells');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Show in folder'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('open:1:true'));
  });

  testWidgets('browser capture settings are saved to the shared backend', (
    tester,
  ) async {
    final api = FakeApi();
    await show(tester, api);
    await openTab(tester, 'Settings');
    expect(find.text('Browser capture'), findsOneWidget);
    await tester.tap(
      find.widgetWithText(SwitchListTile, 'Save pages automatically'),
    );
    await tester.pumpAndSettle();
    expect(api.calls, contains('capture:true:10'));
    expect(api.captureSettings.autoTracking, isTrue);
    await tester.enterText(
      find.widgetWithText(TextField, 'Wait (seconds)'),
      '45',
    );
    await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Apply'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Apply'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('capture:true:45'));
  });

  testWidgets('offers the embedding download when the model is missing', (
    tester,
  ) async {
    final api = FakeApi()..embeddingReady = false;
    await show(tester, api);
    expect(find.textContaining('EmbeddingGemma 2'), findsWidgets);
    await tester.tap(find.widgetWithText(FilledButton, 'Download').first);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Download').last);
    await tester.pumpAndSettle();
    expect(api.calls, contains('download:embedding'));
  });

  testWidgets('several folders can be added at once', (tester) async {
    final api = FakeApi();
    await show(tester, api);
    await openTab(tester, 'Folders');
    await tester.tap(find.text('Add several'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      '/home/me/a\n\n/home/me/b\n/home/me/a',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    expect(api.calls.where((call) => call.startsWith('add:')), [
      'add:/home/me/a',
      'add:/home/me/b',
    ]);
    expect(find.text('/home/me/b'), findsOneWidget);
  });

  testWidgets('folders can be paused and forgotten after confirming', (
    tester,
  ) async {
    final api = FakeApi();
    await show(tester, api);
    await openTab(tester, 'Folders');
    expect(find.text('/home/me/notes'), findsOneWidget);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(api.calls, contains('enabled:1:false'));
    expect(find.text('Paused'), findsOneWidget);
    await tester.tap(find.byTooltip('Forget folder'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your files are not touched'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Forget'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('forget:1'));
    expect(find.textContaining('No folders yet'), findsOneWidget);
  });

  testWidgets('index page summarizes progress', (tester) async {
    await show(tester, FakeApi());
    await openTab(tester, 'Index');
    expect(find.text('8 of 10 files searchable'), findsOneWidget);
    expect(find.text('vectors: 31'), findsOneWidget);
    expect(find.textContaining('About 40 seconds left'), findsOneWidget);
  });

  testWidgets('indexing can be paused from the index page', (tester) async {
    final api = FakeApi();
    await show(tester, api);
    await openTab(tester, 'Index');
    await tester.tap(find.text('Pause'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('paused:true'));
  });

  testWidgets('settings keeps the saved key unless a new one is typed', (
    tester,
  ) async {
    final api = FakeApi()..apiKeySet = true;
    await show(tester, api);
    await openTab(tester, 'Settings');
    expect(find.textContaining('only embedding model'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(api.savedGeneration!['apiKey'], isNull);
    await tester.enterText(find.widgetWithText(TextField, 'API key'), 'sk-new');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(api.savedGeneration!['apiKey'], 'sk-new');
    expect(find.text('Remove saved key'), findsOneWidget);
  });

  testWidgets('graph shows saved pages and reveals a node when tapped', (
    tester,
  ) async {
    await show(tester, FakeApi());
    await openTab(tester, 'Graph');
    expect(find.byType(CustomPaint), findsWidgets);
    expect(find.text('Cell biology primer'), findsNothing);
    final canvas = find.byType(GraphCanvas);
    expect(canvas, findsOneWidget);
  });

  testWidgets('graph selects a local file and offers to open it', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final data = GraphData(
      nodes: [
        GraphNode(
          id: 'file_1',
          label: 'notes.md',
          type: 'file',
          path: '/tmp/notes.md',
        ),
      ],
      edges: [],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: GraphCanvas(data: data)),
      ),
    );
    final canvas = find
        .descendant(
          of: find.byType(GraphCanvas),
          matching: find.byType(CustomPaint),
        )
        .last;
    final point = forceLayout(data)['file_1']!;
    await tester.tapAt(
      tester.getTopLeft(canvas) + Offset(point.dx * 1000, point.dy * 700),
    );
    await tester.pumpAndSettle();
    expect(find.text('notes.md'), findsOneWidget);
    expect(find.byTooltip('Open file'), findsOneWidget);
  });

  testWidgets('ctrl+k jumps back to search and focuses the box', (
    tester,
  ) async {
    await show(tester, FakeApi());
    await openTab(tester, 'Folders');
    expect(find.text('Add folder'), findsOneWidget);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.focusNode!.hasFocus, isTrue);
  });

  testWidgets('appearance control changes the selected theme', (tester) async {
    await show(tester, FakeApi());
    await openTab(tester, 'Settings');
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    final control = tester.widget<SegmentedButton<ThemeMode>>(
      find.byType(SegmentedButton<ThemeMode>),
    );
    expect(control.selected, {ThemeMode.dark});
  });
}
