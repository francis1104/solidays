from __future__ import annotations

import sys
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase2_manifest import (  # noqa: E402
    Phase2ManifestError,
    load_gallery_inventory,
    load_phase2_manifest,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "data" / "gallery-phase2-assets.json"
INVENTORY = REPO_ROOT / "data" / "gallery-inventory.json"


class Phase2ManifestTests(unittest.TestCase):
    def test_committed_manifest_is_complete_and_versioned(self) -> None:
        document = load_phase2_manifest(MANIFEST, expected_prefix="/gallery-phase2/v2")
        inventory_ids = load_gallery_inventory(INVENTORY)
        assets = document["assets"]
        self.assertIsInstance(assets, list)
        self.assertGreater(len(assets), 0)
        self.assertEqual(len(assets), len(document["by_id"]))
        self.assertEqual(set(document["by_id"]), inventory_ids)
        for asset in assets:
            self.assertEqual(
                [source["width"] for source in asset["posterSrcSet"]],
                [480, 768, 1280],
            )

    def test_missing_manifest_is_a_hard_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.json"
            with self.assertRaises(FileNotFoundError):
                load_phase2_manifest(missing)

    def test_unversioned_prefix_is_rejected(self) -> None:
        with self.assertRaises(Phase2ManifestError):
            load_phase2_manifest_from_document(
                {
                    "schemaVersion": 1,
                    "r2Prefix": "/gallery-phase2",
                    "assets": [],
                }
            )

    def test_cross_wired_asset_path_is_rejected(self) -> None:
        with self.assertRaises(Phase2ManifestError):
            load_phase2_manifest_from_document(
                {
                    "schemaVersion": 1,
                    "r2Prefix": "/gallery-phase2/v2",
                    "assets": [
                        {
                            "id": "atomic-heart-20230226-064348",
                            "preview": "/gallery-phase2/v2/baldurs-gate-3-20231215-152600-preview.mp4",
                            "posterSrcSet": [
                                {
                                    "src": "/gallery-phase2/v2/atomic-heart-20230226-064348-480.webp",
                                    "width": 480,
                                },
                                {
                                    "src": "/gallery-phase2/v2/atomic-heart-20230226-064348-768.webp",
                                    "width": 768,
                                },
                                {
                                    "src": "/gallery-phase2/v2/atomic-heart-20230226-064348-1280.webp",
                                    "width": 1280,
                                },
                            ],
                        }
                    ],
                }
            )

    def test_generator_rejects_incomplete_full_source_directory(self) -> None:
        source_id = next(iter(load_gallery_inventory(INVENTORY)))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "gaming"
            source_dir.mkdir()
            (source_dir / f"{source_id}.mp4").touch()
            result = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts/gallery/generate-phase2-assets.py"),
                    "--source-dir",
                    str(source_dir),
                    "--output-dir",
                    str(root / "phase2"),
                    "--manifest",
                    str(MANIFEST),
                    "--inventory",
                    str(INVENTORY),
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("refusing to rewrite", result.stderr + result.stdout)


def load_phase2_manifest_from_document(document: dict[str, object]) -> None:
    import json

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "manifest.json"
        path.write_text(json.dumps(document))
        load_phase2_manifest(path)


if __name__ == "__main__":
    unittest.main()
