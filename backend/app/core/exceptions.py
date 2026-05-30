class MindCacheException(Exception):
    """Base Exception"""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# Domain Exceptions
class DocumentNotFoundError(MindCacheException):
    """Raised When Requested Document Is Not Found"""

    def __init__(self, document_id: int):
        super().__init__(
            message=f"Document With ID {document_id} Was Not Found",
            status_code=404,
        )


class DuplicateDocumentError(MindCacheException):
    """Raised When Document With Same URL Already Exists"""

    def __init__(self, url: str):
        super().__init__(
            message=f"Document With URL {url} Already Exists",
            status_code=409,
        )


# Validation Exceptions
class InvalidURLError(MindCacheException):
    """Raised When URL Is Invalid Or Malformed"""

    def __init__(self, url: str, reason: str = "Invalid Format"):
        super().__init__(
            message=f"URL '{url}' Is Invalid Or Malformed: {reason}",
            status_code=400,
        )


class ContentExtractionError(MindCacheException):
    """Raised When Content Extraction Fails Completely"""

    def __init__(self, url: str, reason: str):
        super().__init__(
            message=f"Failed To Extract Content From {url}: {reason}",
            status_code=422,
        )


class YouTubeTranscriptUnavailableError(ContentExtractionError):
    """Raised When YouTube Transcript Extraction Fails Or Is Disabled"""

    def __init__(self, url: str, reason: str):
        super().__init__(
            url=url,
            reason=f"YouTube Transcript Unavailable: {reason}",
        )


class XExtractionError(ContentExtractionError):
    """Raised When X/Twitter Tweet Extraction Fails Completely"""

    def __init__(self, url: str, reason: str):
        super().__init__(
            url=url,
            reason=f"X Extraction Failed: {reason}",
        )


class GitHubExtractionError(ContentExtractionError):
    """Raised When GitHub Repository Extraction Fails Completely"""

    def __init__(self, url: str, reason: str):
        super().__init__(
            url=url,
            reason=f"GitHub Extraction Failed: {reason}",
        )


# Infrastructure Exceptions
class EmbeddingGenerationError(MindCacheException):
    """Raised When Local Embedding Generation Fails"""

    def __init__(self, reason: str):
        super().__init__(
            message=f"Failed To Generate Semantic Embedding: {reason}",
            status_code=500,
        )


class VectorStoreError(MindCacheException):
    """Raised When FAISS Operations Fail"""

    def __init__(self, reason: str):
        super().__init__(
            message=f"FAISS Vector Store Operation Failed: {reason}",
            status_code=500,
        )


class OllamaServiceError(MindCacheException):
    """Raised When Ollama Summarization Fails"""

    def __init__(self, reason: str):
        super().__init__(
            message=f"Ollama Local Model Service Error: {reason}",
            status_code=502,
        )


class RedditExtractionError(ContentExtractionError):
    """Raised When Reddit Post Extraction Fails Completely"""

    def __init__(self, url: str, reason: str):
        super().__init__(
            url=url,
            reason=f"Reddit Extraction Failed: {reason}",
        )
