import httpx
import pytest

from app.core.pairing import MINDCACHE_EXTENSION_ID
from app.main import app
from app.models.files import IndexedFile, WatchedFolder


@pytest.mark.asyncio
async def test_graph_includes_indexed_files_and_their_folders_for_every_client(client_override, tmp_path):
    folder = WatchedFolder(path=str(tmp_path))
    client_override.add(folder)
    await client_override.flush()
    indexed = IndexedFile(folder_id=folder.id, path=str(tmp_path / "notes.md"), name="notes.md", status="indexed", chunk_count=1)
    missing = IndexedFile(folder_id=folder.id, path=str(tmp_path / "gone.md"), name="gone.md", status="missing", chunk_count=1)
    client_override.add_all([indexed, missing])
    await client_override.flush()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        response = await client.get("/graph")
        assert response.status_code == 200
        graph = response.json()
        assert graph["nodes"]["files"] == [{"id": f"file_{indexed.id}", "label": "notes.md", "type": "file", "path": indexed.path}]
        assert graph["nodes"]["folders"] == [{"id": f"folder_{folder.id}", "label": str(tmp_path), "type": "folder"}]
        assert {"source": f"file_{indexed.id}", "target": f"folder_{folder.id}", "type": "in_folder"} in graph["edges"]
        origin = {"origin": f"chrome-extension://{MINDCACHE_EXTENSION_ID}"}
        extension_graph = (await client.get("/graph", headers=origin)).json()
        assert extension_graph == graph
