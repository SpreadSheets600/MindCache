import 'package:dio/dio.dart';

import 'models.dart';

class Api {
  Api(this.dio);

  factory Api.local([String baseUrl = 'http://127.0.0.1:8000']) => Api(
    Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 3),
        receiveTimeout: const Duration(seconds: 60),
      ),
    ),
  );

  final Dio dio;

  Future<bool> reachable() async {
    try {
      await dio.get('/health');
      return true;
    } on DioException {
      return false;
    }
  }

  Future<List<SearchHit>> search(String query) async {
    final response = await dio.get(
      '/memory/search',
      queryParameters: {'q': query, 'limit': 30},
    );
    return [
      for (final item in response.data['results'] as List)
        SearchHit.fromJson(item as Map<String, dynamic>),
    ];
  }

  Future<List<Folder>> folders() async {
    final response = await dio.get('/folders');
    return [
      for (final item in response.data as List)
        Folder.fromJson(item as Map<String, dynamic>),
    ];
  }

  Future<void> addFolder(String path) =>
      dio.post('/folders', data: {'path': path});

  Future<void> setFolderEnabled(int id, bool enabled) =>
      dio.patch('/folders/$id', data: {'enabled': enabled});

  Future<void> rescanFolder(int id) => dio.post('/folders/$id/rescan');

  Future<void> forgetFolder(int id) => dio.delete('/folders/$id');

  Future<IndexStatus> indexStatus() async {
    final response = await dio.get('/index/status');
    return IndexStatus.fromJson(response.data as Map<String, dynamic>);
  }

  Future<GraphData> graph() async {
    final response = await dio.get('/graph', queryParameters: {'limit': 120});
    return GraphData.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> setIndexPaused(bool paused) =>
      dio.post(paused ? '/index/pause' : '/index/resume');

  Future<ModelsInfo> models() async {
    final response = await dio.get('/ai/models');
    return ModelsInfo.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> saveGeneration({
    required String provider,
    required String model,
    required String endpoint,
    required bool allowRemote,
    String? apiKey,
  }) => dio.put(
    '/ai/generation',
    data: {
      'provider': provider,
      'model': model,
      'endpoint': endpoint,
      'allow_remote': allowRemote,
      'api_key': apiKey,
    },
  );

  Future<void> startDownload(String task) =>
      dio.post('/ai/downloads', data: {'task': task});

  Future<Map<String, DownloadState>> downloads() async {
    final response = await dio.get('/ai/downloads');
    return {
      for (final entry in (response.data as Map).entries)
        entry.key as String: DownloadState.fromJson(
          entry.value as Map<String, dynamic>,
        ),
    };
  }

  static String message(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['detail'] is String) {
        return data['detail'] as String;
      }
      return 'MindCache could not be reached.';
    }
    return error.toString();
  }
}
