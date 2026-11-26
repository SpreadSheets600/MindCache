import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mindcache/core/api.dart';

void main() {
  test('graph uses the backend graph endpoint', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requestFuture = server.first;
    final result = Api.local('http://127.0.0.1:${server.port}').graph();
    final request = await requestFuture;
    expect(request.uri.path, '/graph');
    expect(request.uri.queryParameters['limit'], '120');
    request.response.headers.contentType = ContentType.json;
    request.response.write(jsonEncode({'nodes': {}, 'edges': []}));
    await request.response.close();
    final graph = await result;
    expect(graph.nodes, isEmpty);
    await server.close(force: true);
  });
}
