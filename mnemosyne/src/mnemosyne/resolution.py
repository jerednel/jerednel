"""Identity resolution: mention string -> canonical or overlay entity.

Pipeline: normalize -> exact name match -> alias match -> fuzzy match with
confidence tiers. The overlay is always searched before the canonical tier
(private truth shadows shared truth). Low-confidence matches become merge
proposals rather than silent links (propose, don't autocommit)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from rapidfuzz import fuzz

from mnemosyne.models import Alias, Entity
from mnemosyne.storage.base import CanonicalStore, OverlayStore

AUTO_ACCEPT_SCORE = 92.0
PROPOSE_SCORE = 80.0

_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)
_LEGAL_SUFFIX_RE = re.compile(r"\b(inc|corp|corporation|llc|ltd|co|company)\.?$", re.IGNORECASE)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalize(name: str, strip_legal_suffix: bool = True) -> str:
    text = unicodedata.normalize("NFKC", name).casefold()
    text = _ARTICLE_RE.sub("", text)
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    if strip_legal_suffix:
        text = _LEGAL_SUFFIX_RE.sub("", text).strip()
    return text


@dataclass
class Candidate:
    """A single fuzzy-match candidate: an entity reachable via one of its names."""

    entity: Entity
    matched_text: str
    score: float
    via_alias: bool = False


@dataclass
class MatchOutcome:
    """Raw resolver outcome; the fabric turns this into a ResolutionResult."""

    status: str  # matched | auto_matched | proposed | not_found
    entity: Entity | None = None
    method: str | None = None  # exact | alias | fuzzy
    score: float = 0.0
    matched_text: str | None = None
    near_misses: list[Candidate] | None = None


class IdentityResolver:
    def __init__(self, canonical: CanonicalStore, overlay: OverlayStore):
        self.canonical = canonical
        self.overlay = overlay

    def _stores(self) -> list[CanonicalStore]:
        return [self.overlay, self.canonical]  # overlay shadows canonical

    def get_entity_any(self, entity_id: str) -> Entity | None:
        """Look up an entity by id in its home tier (id prefix routes it), with
        a cross-tier fallback so overlay rows referencing canonical ids work."""
        for store in self._stores():
            entity = store.get_entity(entity_id)
            if entity is not None:
                return entity
        return None

    def resolve(self, mention: str, entity_type: str | None = None) -> MatchOutcome:
        norm = normalize(mention)
        if not norm:
            return MatchOutcome(status="not_found")

        # 1. exact match on normalized name
        for store in self._stores():
            entities = [
                e for e in store.find_by_normalized_name(norm)
                if entity_type is None or e.entity_type == entity_type
            ]
            if entities:
                return MatchOutcome(
                    status="matched", entity=entities[0], method="exact", score=100.0
                )

        # 2. alias match (alias rows in the overlay may point at canonical
        # entities — learned spellings — so entity lookup spans both tiers)
        for store in self._stores():
            for alias in store.find_aliases(norm):
                entity = self.get_entity_any(alias.entity_id)
                if entity is None or entity.superseded_by is not None:
                    continue
                if entity_type is not None and entity.entity_type != entity_type:
                    continue
                return MatchOutcome(
                    status="matched",
                    entity=entity,
                    method="alias",
                    score=100.0 * alias.confidence,
                )

        # 3. fuzzy match over all live names + aliases in both tiers
        candidates = self._fuzzy_candidates(norm, entity_type)
        if candidates:
            best = candidates[0]
            if best.score >= AUTO_ACCEPT_SCORE:
                return MatchOutcome(
                    status="auto_matched",
                    entity=best.entity,
                    method="fuzzy",
                    score=best.score,
                    matched_text=best.matched_text,
                )
            if best.score >= PROPOSE_SCORE:
                return MatchOutcome(
                    status="proposed",
                    entity=best.entity,
                    method="fuzzy",
                    score=best.score,
                    matched_text=best.matched_text,
                )
        return MatchOutcome(status="not_found", near_misses=candidates[:3])

    def _fuzzy_candidates(self, norm: str, entity_type: str | None) -> list[Candidate]:
        """Score every live name and alias in both tiers. Fine at MVP scale;
        Phase 2 hook: blocking/pre-filter or embedding matcher slots in here."""
        entities: dict[str, Entity] = {}
        for store in reversed(self._stores()):  # canonical first so overlay wins on clashes
            for entity in store.all_entities(entity_type):
                entities[entity.id] = entity

        texts: list[tuple[str, str, bool]] = [
            (e.normalized_name, e.id, False) for e in entities.values()
        ]
        aliases: list[Alias] = [a for store in self._stores() for a in store.all_aliases()]
        texts.extend(
            (a.normalized_alias, a.entity_id, True)
            for a in aliases
            if a.entity_id in entities  # skips type-filtered and superseded entities
        )

        best_by_entity: dict[str, Candidate] = {}
        for text, entity_id, via_alias in texts:
            score = fuzz.WRatio(norm, text)
            existing = best_by_entity.get(entity_id)
            if existing is None or score > existing.score:
                best_by_entity[entity_id] = Candidate(
                    entity=entities[entity_id],
                    matched_text=text,
                    score=score,
                    via_alias=via_alias,
                )
        return sorted(best_by_entity.values(), key=lambda c: c.score, reverse=True)
