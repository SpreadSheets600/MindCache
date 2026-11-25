import asyncio
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api import ai
from app.core.ai_config import TaskModel


def test_download_job_reports_completion_and_prevents_duplicates():
    async def run():
        ai._downloads.clear()
        model = TaskModel("transformers", "example/model")
        gate = asyncio.Event()

        async def fake_download(task, selected):
            await gate.wait()
            ai._downloads[task].update(status="completed")

        with patch.object(ai, "load_models", return_value={"embedding": model}), patch.object(ai, "_run_download", fake_download):
            result = await ai.start_download(ai.DownloadRequest(task="embedding"))
            assert result["status"] == "downloading"
            assert (await ai.download_status())["embedding"]["model"] == "example/model"
            with pytest.raises(HTTPException) as error:
                await ai.start_download(ai.DownloadRequest(task="embedding"))
            assert error.value.status_code == 409
            gate.set()
            await asyncio.gather(*list(ai._download_tasks))
            assert (await ai.download_status())["embedding"]["status"] == "completed"
        ai._downloads.clear()

    asyncio.run(run())


def test_download_job_reports_provider_error():
    async def run():
        ai._downloads["generation"] = {"status": "downloading"}
        with patch.object(ai, "download_model", side_effect=ValueError("model missing")):
            await ai._run_download("generation", TaskModel("transformers", "missing"))
        assert ai._downloads["generation"]["status"] == "failed"
        assert ai._downloads["generation"]["error"] == "model missing"
        ai._downloads.clear()

    asyncio.run(run())
