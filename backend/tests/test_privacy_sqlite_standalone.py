import asyncio
import sys
import sqlite3
import tempfile
from pathlib import Path
from types import ModuleType
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.document import SearchQuery


class AsyncSessionAdapter:
    def __init__(self, session):
        self.session = session

    async def get(self, *args):
        return self.session.get(*args)

    async def execute(self, *args):
        return self.session.execute(*args)

    async def commit(self):
        self.session.commit()

    def add(self, item):
        self.session.add(item)


class PrivacySQLiteTests(unittest.TestCase):
    def test_database_backup_contains_committed_rows(self):
        module = ModuleType("app.db.session")
        module.get_db = lambda: None
        with patch.dict(sys.modules, {"app.db.session": module}):
            from app.api.privacy import _copy_database
            with tempfile.TemporaryDirectory() as directory:
                source, target = Path(directory) / "source.sqlite", Path(directory) / "backup.sqlite"
                with sqlite3.connect(source) as conn:
                    conn.execute("CREATE TABLE example(value TEXT)")
                    conn.execute("INSERT INTO example VALUES ('saved')")
                _copy_database(source, target)
                with sqlite3.connect(target) as copy:
                    self.assertEqual(copy.execute("SELECT value FROM example").fetchone()[0], "saved")

    def test_preferences_and_deletion(self):
        module = ModuleType("app.db.session")
        module.get_db = lambda: None
        with patch.dict(sys.modules, {"app.db.session": module}):
            from app.api.privacy import PrivacyPreferences, clear_history, privacy_status, update_preferences
            engine = create_engine("sqlite:///:memory:")
            Base.metadata.create_all(engine)
            with Session(engine, expire_on_commit=False) as session:
                db = AsyncSessionAdapter(session)
                session.add(SearchQuery(query="old search"))
                session.commit()
                async def exercise():
                    initial = await privacy_status(db)
                    self.assertTrue(initial["save_search_history"])
                    self.assertEqual(initial["search_queries"], 1)
                    await update_preferences(PrivacyPreferences(save_search_history=False, learn_from_clicks=False), db)
                    current = await privacy_status(db)
                    self.assertFalse(current["save_search_history"])
                    self.assertFalse(current["learn_from_clicks"])
                    await clear_history(db)
                    self.assertEqual(len(session.execute(select(SearchQuery)).scalars().all()), 0)
                asyncio.run(exercise())
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
