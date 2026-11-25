import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api import ai
from app.core.ai_config import TaskModel
from app.services.embedder import MODEL_ID


def test_embedding_download_reports_completion_and_prevents_duplicates():
    async def run():
        ai.downloads.clear()
        gate = asyncio.Event()

        def blocking_download():
            return None

        async def slow_reindex():
            await gate.wait()

        with (
            patch.object(ai.embedder, "download", blocking_download),
            patch.object(ai.document_processor, "reindex_if_needed", slow_reindex),
            patch.object(ai.indexer, "rebuild_if_needed", AsyncMock()),
            patch.object(ai.indexer, "enqueue_unfinished", AsyncMock()),
        ):
            result = await ai.start_download(ai.DownloadRequest(task="embedding"))
            assert result["status"] == "downloading"
            assert (await ai.download_status())["embedding"]["model"] == MODEL_ID
            with pytest.raises(HTTPException) as error:
                await ai.start_download(ai.DownloadRequest(task="embedding"))
            assert error.value.status_code == 409
            gate.set()
            await asyncio.gather(*list(ai.download_tasks))
            assert (await ai.download_status())["embedding"]["status"] == "completed"
        ai.downloads.clear()

    asyncio.run(run())


def test_embedding_download_triggers_reindex():
    async def run():
        ai.downloads["embedding"] = {"status": "downloading"}
        reindex = AsyncMock()
        rebuild = AsyncMock()
        unfinished = AsyncMock()
        with (
            patch.object(ai.embedder, "download"),
            patch.object(ai.document_processor, "reindex_if_needed", reindex),
            patch.object(ai.indexer, "rebuild_if_needed", rebuild),
            patch.object(ai.indexer, "enqueue_unfinished", unfinished),
        ):
            await ai.run_download("embedding", None)
        reindex.assert_awaited_once()
        rebuild.assert_awaited_once()
        unfinished.assert_awaited_once_with(("partial",))
        ai.downloads.clear()

    asyncio.run(run())


def test_download_job_reports_provider_error():
    async def run():
        ai.downloads["generation"] = {"status": "downloading"}
        with patch.object(ai, "download_model", side_effect=ValueError("model missing")):
            await ai.run_download("generation", TaskModel("transformers", "missing"))
        assert ai.downloads["generation"]["status"] == "failed"
        assert ai.downloads["generation"]["error"] == "model missing"
        ai.downloads.clear()

    asyncio.run(run())
