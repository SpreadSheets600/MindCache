from unittest.mock import patch

import httpx
import pytest

from app.api import capture, files
from app.core.pairing import MINDCACHE_EXTENSION_ID
from app.main import app
from app.models.files import IndexedFile, WatchedFolder
from app.services import memory_search
from app.services.chunk_store import replace_source

EXTENSION = {"origin": f"chrome-extension://{MINDCACHE_EXTENSION_ID}"}


def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost")


@pytest.mark.asyncio
async def test_capture_settings_are_shared_between_clients(tmp_path):
    with patch.object(capture, "CAPTURE_PATH", tmp_path / "capture.json"):
        async with client() as http:
            defaults = (await http.get("/settings/capture")).json()
            assert defaults["auto_tracking"] is False and defaults["delay_seconds"] == 10 and defaults["configured"] is False
            body = {"auto_tracking": True, "auto_extract": False, "delay_seconds": 30, "excluded_domains": [" Bank.com ", "bank.com", ""]}
            assert (await http.put("/settings/capture", json=body)).status_code == 200
            seen = (await http.get("/settings/capture", headers=EXTENSION)).json()
            assert seen == {**body, "excluded_domains": ["bank.com"], "configured": True}
            assert (await http.put("/settings/capture", json={**body, "delay_seconds": 0})).status_code == 422


@pytest.mark.asyncio
async def test_extension_has_the_same_access_as_the_app_except_pairing(client_override):
    async with client() as http:
        for path in ("/folders", "/files", "/index/status", "/memory/search?q=cedar", "/ai/models", "/privacy"):
            assert (await http.get(path, headers=EXTENSION)).status_code == 200, path
        assert (await http.get("/pairing", headers=EXTENSION)).status_code == 403


async def seed(db, tmp_path, name, content):
    folder = WatchedFolder(path=str(tmp_path))
    db.add(folder)
    await db.flush()
    path = tmp_path / name
    path.write_text(content)
    file = IndexedFile(folder_id=folder.id, path=str(path), name=name, ext=path.suffix, size=len(content), mtime_ns=1_700_000_000_000_000_000, status="indexed")
    db.add(file)
    await db.flush()
    await replace_source(db, "file", file.id, name, content)
    await db.commit()
    return file


@pytest.mark.asyncio
async def test_search_modes_kinds_and_file_context(client_override, tmp_path):
    file = await seed(client_override, tmp_path, "budget.md", "Quarterly cedar budget review.")
    async with client() as http:
        fast = (await http.get("/memory/search", params={"q": "cedar", "mode": "fast"})).json()
        assert fast["mode"] == "fast" and fast["terms"] == ["cedar"]
        hit = fast["results"][0]
        assert hit["kind"] == "file" and hit["id"] == file.id
        assert hit["folder"] == str(tmp_path) and hit["ext"] == ".md" and hit["open_url"] == f"/files/{file.id}/raw"
        assert hit["when"].startswith("2023-11-14")
        assert (await http.get("/memory/search", params={"q": "cedar", "kind": "page"})).json()["results"] == []
        assert (await http.get("/memory/search", params={"q": "cedar", "mode": "bogus"})).status_code == 422


@pytest.mark.asyncio
async def test_fast_mode_never_touches_the_embedder(client_override, tmp_path):
    await seed(client_override, tmp_path, "a.md", "Heron sanctuary notes.")
    with patch.object(memory_search.embedder, "embed_query", side_effect=AssertionError("embedded")):
        async with client() as http:
            assert (await http.get("/memory/search", params={"q": "heron", "mode": "fast"})).json()["results"]


@pytest.mark.asyncio
async def test_indexed_files_can_be_read_and_opened_from_the_browser(client_override, tmp_path):
    file = await seed(client_override, tmp_path, "notes.md", "Cedar.")
    outside = tmp_path.parent / "secret.txt"
    outside.write_text("secret")
    stray = IndexedFile(folder_id=file.folder_id, path=str(outside), name="secret.txt", status="indexed")
    client_override.add(stray)
    await client_override.commit()
    launched = []
    with patch.object(files, "launch", launched.append):
        async with client() as http:
            raw = await http.get(f"/files/{file.id}/raw")
            assert raw.status_code == 200 and raw.text == "Cedar."
            assert raw.headers["content-type"].startswith("text/plain")
            assert raw.headers["content-security-policy"] == "sandbox"
            assert (await http.get(f"/files/{stray.id}/raw")).status_code == 404
            assert (await http.get("/files/9999/raw")).status_code == 404
            assert (await http.post(f"/files/{file.id}/open")).status_code == 200
            assert (await http.post(f"/files/{file.id}/open", json={"reveal": True})).status_code == 200
            assert (await http.post(f"/files/{stray.id}/open")).status_code == 404
    assert launched == [str(tmp_path / "notes.md"), str(tmp_path)]


@pytest.mark.asyncio
async def test_unsafe_file_types_download_instead_of_rendering(client_override, tmp_path):
    file = await seed(client_override, tmp_path, "page.html", "<script>alert(1)</script>")
    async with client() as http:
        response = await http.get(f"/files/{file.id}/raw")
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["x-content-type-options"] == "nosniff"
