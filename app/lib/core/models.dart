class SearchHit {
  SearchHit({
    required this.kind,
    required this.id,
    required this.title,
    required this.location,
    required this.reasons,
    required this.passages,
  });

  factory SearchHit.fromJson(Map<String, dynamic> json) => SearchHit(
    kind: json['kind'] as String,
    id: json['id'] as int,
    title: json['title'] as String,
    location: json['location'] as String,
    reasons: List<String>.from(json['reasons'] as List),
    passages: [
      for (final passage in json['passages'] as List)
        (passage as Map<String, dynamic>)['text'] as String,
    ],
  );

  final String kind;
  final int id;
  final String title;
  final String location;
  final List<String> reasons;
  final List<String> passages;

  bool get isPage => kind == 'page';
  bool get isFile => kind == 'file';
  bool get isNote => kind == 'note';
}

class Folder {
  Folder({
    required this.id,
    required this.path,
    required this.enabled,
    required this.status,
    required this.lastScanAt,
  });

  factory Folder.fromJson(Map<String, dynamic> json) => Folder(
    id: json['id'] as int,
    path: json['path'] as String,
    enabled: json['enabled'] as bool,
    status: json['status'] as String,
    lastScanAt: json['last_scan_at'] as String?,
  );

  final int id;
  final String path;
  final bool enabled;
  final String status;
  final String? lastScanAt;
}

class IndexStatus {
  IndexStatus({
    required this.files,
    required this.queued,
    required this.vectors,
    required this.embedding,
    this.paused = false,
    this.filesPerMinute,
    this.etaSeconds,
  });

  factory IndexStatus.fromJson(Map<String, dynamic> json) => IndexStatus(
    files: Map<String, int>.from(json['files'] as Map),
    queued: json['queued'] as int,
    vectors: json['vectors'] as int,
    embedding: json['embedding'] as String,
    paused: json['paused'] as bool? ?? false,
    filesPerMinute: (json['files_per_minute'] as num?)?.toDouble(),
    etaSeconds: json['eta_seconds'] as int?,
  );

  final Map<String, int> files;
  final bool paused;
  final double? filesPerMinute;
  final int? etaSeconds;
  final int queued;
  final int vectors;
  final String embedding;

  int get total => files.values.fold(0, (sum, count) => sum + count);
  int get indexed => files['indexed'] ?? 0;
}

class EmbeddingInfo {
  EmbeddingInfo({
    required this.model,
    required this.dimension,
    required this.status,
    required this.device,
  });

  factory EmbeddingInfo.fromJson(Map<String, dynamic> json) => EmbeddingInfo(
    model: json['model'] as String,
    dimension: json['dimension'] as int,
    status: json['status'] as String,
    device: json['device'] as String,
  );

  final String model;
  final int dimension;
  final String status;
  final String device;

  bool get ready => status == 'ready';
}

class Generation {
  Generation({
    required this.provider,
    required this.model,
    required this.endpoint,
    required this.apiKeySet,
    required this.allowRemote,
  });

  factory Generation.fromJson(Map<String, dynamic> json) => Generation(
    provider: json['provider'] as String,
    model: json['model'] as String,
    endpoint: json['endpoint'] as String,
    apiKeySet: json['api_key_set'] as bool,
    allowRemote: json['allow_remote'] as bool,
  );

  final String provider;
  final String model;
  final String endpoint;
  final bool apiKeySet;
  final bool allowRemote;
}

class ModelsInfo {
  ModelsInfo({required this.embedding, required this.generation});

  factory ModelsInfo.fromJson(Map<String, dynamic> json) => ModelsInfo(
    embedding: EmbeddingInfo.fromJson(
      json['embedding'] as Map<String, dynamic>,
    ),
    generation: Generation.fromJson(json['generation'] as Map<String, dynamic>),
  );

  final EmbeddingInfo embedding;
  final Generation generation;
}

class DownloadState {
  DownloadState({required this.status, required this.model, this.error});

  factory DownloadState.fromJson(Map<String, dynamic> json) => DownloadState(
    status: json['status'] as String,
    model: json['model'] as String,
    error: json['error'] as String?,
  );

  final String status;
  final String model;
  final String? error;

  bool get running => status == 'downloading';
}

class GraphNode {
  GraphNode({
    required this.id,
    required this.label,
    required this.type,
    this.url,
  });

  factory GraphNode.fromJson(Map<String, dynamic> json, String type) =>
      GraphNode(
        id: json['id'] as String,
        label: (json['label'] ?? json['name'] ?? json['keyword'] ?? '')
            .toString(),
        type: type,
        url: json['url'] as String?,
      );

  final String id;
  final String label;
  final String type;
  final String? url;
}

class GraphEdge {
  GraphEdge({required this.source, required this.target});

  final String source;
  final String target;
}

class GraphData {
  GraphData({required this.nodes, required this.edges});

  factory GraphData.fromJson(Map<String, dynamic> json) {
    final groups = json['nodes'] as Map<String, dynamic>;
    final nodes = <GraphNode>[
      for (final entry in const {
        'documents': 'document',
        'entities': 'entity',
        'keywords': 'keyword',
      }.entries)
        for (final item in (groups[entry.key] as List? ?? const []))
          GraphNode.fromJson(item as Map<String, dynamic>, entry.value),
    ];
    final ids = {for (final node in nodes) node.id};
    final edges = <GraphEdge>[
      for (final item in json['edges'] as List)
        if (ids.contains((item as Map)['source']) &&
            ids.contains(item['target']))
          GraphEdge(
            source: item['source'] as String,
            target: item['target'] as String,
          ),
    ];
    return GraphData(nodes: nodes, edges: edges);
  }

  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
}
