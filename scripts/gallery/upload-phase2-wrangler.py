#!/usr/bin/env python3
"""Publish Gallery phase-two assets under a separate R2 key prefix.

This uploader is intentionally limited to the generated phase-two directory.
It checks the public custom-domain URL before each put and never overwrites an
object that is already publicly readable. The existence probe uses a one-byte
Range GET rather than HEAD because the custom domain can cache negative HEADs
while the object itself is already available to browser GET requests.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from catalog import OUTPUT_DIR, PHASE2_DIR, PHASE2_PREFIX

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
        raise RuntimeError(f"HEAD {url}: {detail}")
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


def asset_rows(manifest: list[dict[str, object]], phase2_dir: Path, prefix: str):
    prefix = prefix.strip("/")
    for item in manifest:
        item_id = str(item["id"])
        assets = [
            (f"{prefix}/{item_id}-preview.mp4", phase2_dir / f"{item_id}-preview.mp4", "video/mp4"),
        ]
        for width in (480, 768, 1280):
            assets.append(
                (f"{prefix}/{item_id}-{width}.webp", phase2_dir / f"{item_id}-{width}.webp", "image/webp")
            )
        for key, path, content_type in assets:
            if not path.is_file():
                raise FileNotFoundError(path)
            yield key, path, content_type


def publish(asset: tuple[str, Path, str]) -> str:
    key, path, content_type = asset
    url = f"{PUBLIC_BASE}/{key}"
    status = public_status(url)
    if status in {"200", "206"}:
        return f"exists {key}"
    if status != "404":
        raise RuntimeError(f"refusing {key}: public HEAD returned {status}")
    put_object(key, path, content_type)
    return f"uploaded {key}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(Path(OUTPUT_DIR) / "phase2-assets.json"))
    parser.add_argument("--phase2-dir", default=PHASE2_DIR)
    parser.add_argument("--prefix", default=PHASE2_PREFIX)
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    assets = list(asset_rows(manifest, Path(args.phase2_dir), args.prefix))
    print(f"publishing {len(assets)} objects under {args.prefix.strip('/')}/", flush=True)

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
    except (FileNotFoundError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
