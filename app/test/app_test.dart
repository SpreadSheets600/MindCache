import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mindcache/core/api.dart';
import 'package:mindcache/core/models.dart';
import 'package:mindcache/core/providers.dart';
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
  Future<List<SearchHit>> search(String query) async {
    calls.add('search:$query');
    return [
      SearchHit(
        fileId: 1,
        name: 'cells.md',
        path: '/home/me/notes/cells.md',
        reasons: ['keyword', 'semantic'],
        passages: ['The mitochondria produces energy for the cell.'],
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

  @override
  Future<IndexStatus> indexStatus() async => IndexStatus(
    files: {'indexed': 8, 'pending': 2},
    queued: 2,
    vectors: 31,
    embedding: 'ready',
  );

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
    'Settings': Icons.tune,
  };
  await tester.tap(find.byIcon(icons[label]!));
  await tester.pumpAndSettle();
}

void main() {
  test('models parse backend json', () {
    final hit = SearchHit.fromJson({
      'file_id': 4,
      'name': 'a.txt',
      'path': '/x/a.txt',
      'reasons': ['keyword'],
      'passages': [
        {'text': 'hello', 'start': 0},
      ],
    });
    expect(hit.passages, ['hello']);
    final status = IndexStatus.fromJson({
      'files': {'indexed': 3, 'skipped': 1},
      'queued': 0,
      'vectors': 9,
      'embedding': 'ready',
    });
    expect(status.total, 4);
    expect(status.indexed, 3);
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
    expect(find.text('semantic'), findsOneWidget);
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
}
