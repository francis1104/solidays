#!/usr/bin/env python3
"""Validation and serialization helpers for the Gallery phase-two manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path

SCHEMA_VERSION = 1
INVENTORY_SCHEMA_VERSION = 1
POSTER_WIDTHS = (480, 768, 1280)
VERSIONED_PREFIX = re.compile(r"^gallery-phase2/v\d+$")


class Phase2ManifestError(ValueError):
    """Raised when a phase-two manifest is missing or violates its contract."""


def normalize_prefix(prefix: object) -> str:
    if not isinstance(prefix, str) or not prefix.strip("/"):
        raise Phase2ManifestError("phase-two manifest r2Prefix must be a non-empty string")
    return "/" + prefix.strip("/")


def validate_versioned_prefix(prefix: object) -> str:
    normalized = normalize_prefix(prefix)
    if not VERSIONED_PREFIX.fullmatch(normalized.lstrip("/")):
        raise Phase2ManifestError(
            "phase-two r2Prefix must be versioned, for example /gallery-phase2/v2"
        )
    return normalized


def _validate_asset_path(
    value: object, label: str, prefix: str, expected_basename: str | None = None
) -> str:
    if not isinstance(value, str) or not value.startswith(prefix + "/"):
        raise Phase2ManifestError(f"{label} must start with {prefix}/")
    if value.endswith("/") or "?" in value or "#" in value:
        raise Phase2ManifestError(f"{label} must be a plain asset path")
    if expected_basename is not None and value.rsplit("/", 1)[-1] != expected_basename:
        raise Phase2ManifestError(f"{label} must end with {expected_basename}")
    return value


def _validate_document(document: object, expected_prefix: str | None = None) -> tuple[str, list[dict[str, object]]]:
    if not isinstance(document, dict):
        raise Phase2ManifestError("phase-two manifest must be a JSON object")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        raise Phase2ManifestError(
            f"unsupported phase-two manifest schema: {document.get('schemaVersion')!r}"
        )

    prefix = validate_versioned_prefix(document.get("r2Prefix"))
    if expected_prefix is not None and prefix != validate_versioned_prefix(expected_prefix):
        raise Phase2ManifestError(
            f"phase-two manifest prefix {prefix} does not match expected {expected_prefix}"
        )

    raw_assets = document.get("assets")
    if not isinstance(raw_assets, list) or not raw_assets:
        raise Phase2ManifestError("phase-two manifest assets must be a non-empty array")

    assets: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for index, raw_asset in enumerate(raw_assets):
        label = f"assets[{index}]"
        if not isinstance(raw_asset, dict):
            raise Phase2ManifestError(f"{label} must be an object")

        item_id = raw_asset.get("id")
        if not isinstance(item_id, str) or not item_id or "/" in item_id:
            raise Phase2ManifestError(f"{label}.id must be a non-empty path-safe string")
        if item_id in seen_ids:
            raise Phase2ManifestError(f"duplicate phase-two asset id: {item_id}")
        seen_ids.add(item_id)

        preview = _validate_asset_path(
            raw_asset.get("preview"),
            f"{label}.preview",
            prefix,
            f"{item_id}-preview.mp4",
        )
        raw_sources = raw_asset.get("posterSrcSet")
        if not isinstance(raw_sources, list):
            raise Phase2ManifestError(f"{label}.posterSrcSet must be an array")

        poster_sources: list[dict[str, object]] = []
        seen_widths: set[int] = set()
        for source_index, raw_source in enumerate(raw_sources):
            source_label = f"{label}.posterSrcSet[{source_index}]"
            if not isinstance(raw_source, dict):
                raise Phase2ManifestError(f"{source_label} must be an object")
            width = raw_source.get("width")
            if isinstance(width, bool) or not isinstance(width, int):
                raise Phase2ManifestError(f"{source_label}.width must be an integer")
            if width in seen_widths:
                raise Phase2ManifestError(f"duplicate poster width in {label}: {width}")
            seen_widths.add(width)
            poster_sources.append(
                {
                    "src": _validate_asset_path(
                        raw_source.get("src"),
                        f"{source_label}.src",
                        prefix,
                        f"{item_id}-{width}.webp",
                    ),
                    "width": width,
                }
            )

        if tuple(sorted(seen_widths)) != POSTER_WIDTHS:
            raise Phase2ManifestError(
                f"{label}.posterSrcSet must contain widths {POSTER_WIDTHS}"
            )

        assets.append(
            {
                "id": item_id,
                "preview": preview,
                "posterSrcSet": poster_sources,
            }
        )

    return prefix, assets


def load_phase2_manifest(
    path: Path, expected_prefix: str | None = None
) -> dict[str, object]:
    if not path.is_file():
        raise FileNotFoundError(f"phase-two manifest is required: {path}")
    try:
        document = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise Phase2ManifestError(f"invalid phase-two manifest JSON: {path}") from error

    prefix, assets = _validate_document(document, expected_prefix)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "r2Prefix": prefix,
        "assets": assets,
        "by_id": {str(asset["id"]): asset for asset in assets},
    }


def build_phase2_manifest(
    assets: list[dict[str, object]], prefix: str
) -> dict[str, object]:
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "r2Prefix": validate_versioned_prefix(prefix),
        "assets": assets,
    }
    normalized_prefix, normalized_assets = _validate_document(document)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "r2Prefix": normalized_prefix,
        "assets": normalized_assets,
    }


def write_phase2_manifest(path: Path, assets: list[dict[str, object]], prefix: str) -> None:
    document = build_phase2_manifest(assets, prefix)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")


def load_gallery_inventory(path: Path) -> set[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Gallery inventory is required: {path}")
    try:
        document = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise Phase2ManifestError(f"invalid Gallery inventory JSON: {path}") from error

    if not isinstance(document, dict):
        raise Phase2ManifestError("Gallery inventory must be a JSON object")
    if document.get("schemaVersion") != INVENTORY_SCHEMA_VERSION:
        raise Phase2ManifestError(
            f"unsupported Gallery inventory schema: {document.get('schemaVersion')!r}"
        )
    raw_ids = document.get("ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise Phase2ManifestError("Gallery inventory ids must be a non-empty array")

    ids: set[str] = set()
    for index, item_id in enumerate(raw_ids):
        if not isinstance(item_id, str) or not item_id or "/" in item_id:
            raise Phase2ManifestError(f"Gallery inventory ids[{index}] is not path-safe")
        if item_id in ids:
            raise Phase2ManifestError(f"duplicate Gallery inventory id: {item_id}")
        ids.add(item_id)
    return ids


def write_gallery_inventory(path: Path, ids: set[str]) -> None:
    if not ids:
        raise Phase2ManifestError("cannot write an empty Gallery inventory")
    document = {
        "schemaVersion": INVENTORY_SCHEMA_VERSION,
        "ids": sorted(ids),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
