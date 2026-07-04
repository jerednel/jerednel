"""Read-only SQLite implementation of the canonical (shared/universal) tier.

The connection is opened with SQLite URI mode=ro, so any write attempt raises
sqlite3.OperationalError — private overlay data structurally cannot land here.
The only write path to canonical.db is the offline seed loader."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from mnemosyne.storage.sqlite_common import SqliteReadStore


class SqliteCanonicalStore(SqliteReadStore):
    def __init__(self, db_path: Path):
        if not db_path.exists():
            raise FileNotFoundError(
                f"Canonical database not found at {db_path}. Run `mnemosyne-seed` first."
            )
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        super().__init__(conn)
