class MindCacheException(Exception):

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class DocumentNotFoundError(MindCacheException):
    def __init__(self, document_id: int):
        super().__init__(f"Document {document_id} was not found.", status_code=404)


class DuplicateDocumentError(MindCacheException):
    def __init__(self, url: str):
        super().__init__(f"Document with URL {url} already exists.", status_code=409)


class InvalidURLError(MindCacheException):
    def __init__(self, url: str, reason: str = "invalid format"):
        super().__init__(f"URL '{url}' is invalid: {reason}", status_code=400)


class ContentExtractionError(MindCacheException):
    def __init__(self, url: str, reason: str):
        super().__init__(f"Failed to extract content from {url}: {reason}", status_code=422)


class YouTubeTranscriptUnavailableError(ContentExtractionError):
    def __init__(self, url: str, reason: str):
        super().__init__(url=url, reason=f"YouTube transcript unavailable: {reason}")


class XExtractionError(ContentExtractionError):
    def __init__(self, url: str, reason: str):
        super().__init__(url=url, reason=f"X extraction failed: {reason}")


class GitHubExtractionError(ContentExtractionError):
    def __init__(self, url: str, reason: str):
        super().__init__(url=url, reason=f"GitHub extraction failed: {reason}")


class RedditExtractionError(ContentExtractionError):
    def __init__(self, url: str, reason: str):
        super().__init__(url=url, reason=f"Reddit extraction failed: {reason}")


class EmbeddingGenerationError(MindCacheException):
    def __init__(self, reason: str):
        super().__init__(f"Embedding generation failed: {reason}", status_code=500)


class VectorStoreError(MindCacheException):
    def __init__(self, reason: str):
        super().__init__(f"Vector store operation failed: {reason}", status_code=500)


class IndexStorageError(MindCacheException):
    def __init__(self, reason: str):
        super().__init__(f"Search index storage failed: {reason}", status_code=500)
