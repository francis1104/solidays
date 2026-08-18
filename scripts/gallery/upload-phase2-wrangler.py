#!/usr/bin/env python3
"""Publish Gallery phase-two assets under a separate R2 key prefix.

This uploader is intentionally limited to the generated phase-two directory.
It publishes only the versioned prefix declared by the committed manifest,
checks the public custom-domain URL before each put, and never overwrites an
object that is already publicly readable. The existence probe uses a one-byte
Range GET rather than HEAD because the custom domain can cache negative HEADs
while the object itself is already available to browser GET requests.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from catalog import PHASE2_DIR, PHASE2_MANIFEST
from phase2_manifest import Phase2ManifestError, load_phase2_manifest

BUCKET = "solidays-gallery"
PUBLIC_BASE = "https://media.solidays.win"
CACHE_CONTROL = "public, max-age=31536000, immutable"
REPO_ROOT = Path(__file__).resolve().parents[2]
WRANGLER = ["node", str(REPO_ROOT / ".yarn/releases/yarn-3.6.1.cjs"), "wrangler"]


def public_status(url: str) -> str:
    result = subprocess.run(
        ["curl", "-sS", "-r", "0-0", "-o", "/dev/null", "-w", "%{http_code}", url],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "curl failed"
        raise RuntimeError(f"GET {url}: {detail}")
    return result.stdout.strip()


def put_object(key: str, path: Path, content_type: str) -> None:
    command = WRANGLER + [
        "r2",
        "object",
        "put",
        f"{BUCKET}/{key}",
        "--file",
        str(path),
        "--content-type",
        content_type,
        "--cache-control",
        CACHE_CONTROL,
        "--remote",
        "-y",
    ]
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"put {key} failed: {detail[-1000:]}")


def asset_rows(manifest: dict[str, object], phase2_dir: Path):
    manifest_assets = manifest["assets"]
    if not isinstance(manifest_assets, list):
        raise Phase2ManifestError("phase-two manifest assets are invalid")
    for item in manifest_assets:
        if not isinstance(item, dict):
            raise Phase2ManifestError("phase-two asset is invalid")
        item_id = str(item["id"])
        preview_url = str(item["preview"])
        item_assets = [
            (preview_url.lstrip("/"), phase2_dir / Path(preview_url).name, "video/mp4"),
        ]
        poster_sources = item["posterSrcSet"]
        if not isinstance(poster_sources, list):
            raise Phase2ManifestError(f"phase-two asset {item_id} posterSrcSet is invalid")
        for source in poster_sources:
            source_url = str(source["src"])
            item_assets.append((source_url.lstrip("/"), phase2_dir / Path(source_url).name, "image/webp"))
        for key, path, content_type in item_assets:
            if not path.is_file():
                raise FileNotFoundError(path)
            yield key, path, content_type


def publish(asset: tuple[str, Path, str]) -> str:
    key, path, content_type = asset
    url = f"{PUBLIC_BASE}/{key}?phase2_probe=1"
    status = public_status(url)
    if status in {"200", "206"}:
        return f"exists {key}"
    if status != "404":
        raise RuntimeError(f"refusing {key}: public GET returned {status}")
    put_object(key, path, content_type)
    return f"uploaded {key}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=PHASE2_MANIFEST)
    parser.add_argument("--phase2-dir", default=PHASE2_DIR)
    parser.add_argument(
        "--prefix",
        help="Optional assertion for the versioned prefix declared by the manifest.",
    )
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()

    manifest = load_phase2_manifest(Path(args.manifest), expected_prefix=args.prefix)
    assets = list(asset_rows(manifest, Path(args.phase2_dir)))
    prefix = str(manifest["r2Prefix"])
    print(f"publishing {len(assets)} objects under {prefix.strip('/')}/", flush=True)

    uploaded = 0
    exists = 0
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(publish, asset): asset[0] for asset in assets}
        for index, future in enumerate(as_completed(futures), start=1):
            key = futures[future]
            try:
                result = future.result()
                print(f"[{index}/{len(assets)}] {result}", flush=True)
                if result.startswith("uploaded "):
                    uploaded += 1
                else:
                    exists += 1
            except Exception as error:  # noqa: BLE001 - report all failed objects
                message = f"{key}: {error}"
                failures.append(message)
                print(f"[{index}/{len(assets)}] ERROR {message}", flush=True)

    print(f"done uploaded={uploaded} exists={exists} failed={len(failures)}", flush=True)
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, Phase2ManifestError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
