"""Offline canonical-tier builder — the ONLY write path to canonical.db.

Reuses the overlay store's transactional writers (so seed rows get full
assertion history and provenance) but stamps tier='canonical' and a single
source_type='seed' provenance record. At runtime the resulting file is opened
strictly read-only."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from mnemosyne.config import canonical_db_path
from mnemosyne.models import Alias, Entity, Provenance, Relationship, utcnow
from mnemosyne.ontology import OntologyRegistry
from mnemosyne.resolution import normalize
from mnemosyne.storage.sqlite_overlay import SqliteOverlayStore

SEED_ENTITIES_PATH = Path(__file__).parent / "canonical_entities.json"


def build_canonical_db(
    db_path: Path,
    seed_path: Path = SEED_ENTITIES_PATH,
    force: bool = False,
) -> int:
    """Build canonical.db from seed JSON. Returns number of entities loaded."""
    if db_path.exists():
        if not force:
            raise FileExistsError(f"{db_path} already exists. Pass --force to rebuild it.")
        db_path.unlink()
        for suffix in ("-wal", "-shm"):
            sidecar = db_path.with_name(db_path.name + suffix)
            sidecar.unlink(missing_ok=True)

    ontology = OntologyRegistry.load()
    raw = json.loads(seed_path.read_text())
    store = SqliteOverlayStore(db_path, tier="canonical", with_fts=False)
    provenance = Provenance(
        source_type="seed",
        assistant_id="mnemosyne-seed-loader",
        derivation={"seed_file": seed_path.name},
    )

    entity_types: dict[str, str] = {}
    now = utcnow()
    for raw_entity in raw["entities"]:
        ontology.validate_entity_type(raw_entity["entity_type"])
        entity = Entity(
            id=raw_entity["id"],
            entity_type=raw_entity["entity_type"],
            name=raw_entity["name"],
            normalized_name=normalize(raw_entity["name"]),
            summary=raw_entity.get("summary"),
            attributes=raw_entity.get("attributes", {}),
            valid_from=now,
            provenance_id=provenance.id,
        )
        store.create_entity(entity, provenance)
        entity_types[entity.id] = entity.entity_type
        for raw_alias in raw_entity.get("aliases", []):
            store.add_alias(
                Alias(
                    entity_id=entity.id,
                    alias=raw_alias["alias"],
                    normalized_alias=normalize(raw_alias["alias"]),
                    alias_type=raw_alias.get("alias_type", "name"),
                    provenance_id=provenance.id,
                ),
                provenance,
            )

    for raw_rel in raw["relationships"]:
        ontology.validate_relationship(
            raw_rel["rel_type"],
            entity_types[raw_rel["source"]],
            entity_types[raw_rel["target"]],
        )
        store.assert_relationship(
            Relationship(
                source_entity_id=raw_rel["source"],
                target_entity_id=raw_rel["target"],
                rel_type=raw_rel["rel_type"],
                attributes=raw_rel.get("attributes", {}),
                valid_from=now,
                provenance_id=provenance.id,
            ),
            provenance,
        )

    store.conn.execute(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('seeded_at', ?)", (now,)
    )
    store.conn.commit()
    # Fold WAL sidecar files back into the main db so the file is standalone
    # and read-only opens cleanly.
    store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    store.conn.execute("PRAGMA journal_mode = DELETE")
    store.close()
    return len(raw["entities"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the Mnemosyne canonical ontology DB.")
    parser.add_argument(
        "--db", type=Path, default=None, help="Output path (default: <data-dir>/canonical.db)"
    )
    parser.add_argument("--force", action="store_true", help="Rebuild even if the DB exists.")
    args = parser.parse_args(argv)
    db_path = args.db or canonical_db_path()
    try:
        count = build_canonical_db(db_path, force=args.force)
    except FileExistsError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Seeded {count} canonical entities into {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
