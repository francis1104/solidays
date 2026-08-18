from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase2_manifest import (  # noqa: E402
    Phase2ManifestError,
    load_phase2_manifest,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "data" / "gallery-phase2-assets.json"


class Phase2ManifestTests(unittest.TestCase):
    def test_committed_manifest_is_complete_and_versioned(self) -> None:
        document = load_phase2_manifest(MANIFEST, expected_prefix="/gallery-phase2/v2")
        assets = document["assets"]
        self.assertIsInstance(assets, list)
        self.assertGreater(len(assets), 0)
        self.assertEqual(len(assets), len(document["by_id"]))
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


def load_phase2_manifest_from_document(document: dict[str, object]) -> None:
    import json

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "manifest.json"
        path.write_text(json.dumps(document))
        load_phase2_manifest(path)


if __name__ == "__main__":
    unittest.main()
