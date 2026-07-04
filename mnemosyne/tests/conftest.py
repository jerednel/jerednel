import pytest

from mnemosyne.fabric import MemoryFabric
from mnemosyne.models import Provenance
from mnemosyne.ontology import OntologyRegistry
from mnemosyne.seed.loader import build_canonical_db
from mnemosyne.storage.sqlite_canonical import SqliteCanonicalStore
from mnemosyne.storage.sqlite_overlay import SqliteOverlayStore


@pytest.fixture(scope="session")
def canonical_db(tmp_path_factory):
    path = tmp_path_factory.mktemp("canonical") / "canonical.db"
    build_canonical_db(path)
    return path


@pytest.fixture()
def canonical_store(canonical_db):
    store = SqliteCanonicalStore(canonical_db)
    yield store
    store.close()


@pytest.fixture()
def overlay_store(tmp_path):
    store = SqliteOverlayStore(tmp_path / "overlay.db")
    yield store
    store.close()


@pytest.fixture()
def fabric(canonical_store, overlay_store):
    return MemoryFabric(canonical_store, overlay_store, OntologyRegistry.load())


@pytest.fixture()
def provenance():
    return Provenance(source_type="assistant", assistant_id="pytest/1.0", stated_confidence=0.9)
