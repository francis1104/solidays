#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

REPORT = Path("/Users/francis/Movies/xbox-gallery-web/process-report.json")
BUCKET = "solidays-gallery"
PUBLIC = "https://media.solidays.win"
RETRIES = 5


def already_public(key: str) -> bool:
    result = subprocess.run(
        ["curl", "-sI", "-o", "/dev/null", "-w", "%{http_code}", f"{PUBLIC}/{key}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == "200"


def put(key: str, file_path: str, content_type: str) -> None:
    cmd = [
        "npx",
        "wrangler",
        "r2",
        "object",
        "put",
        f"{BUCKET}/{key}",
        "--file",
        file_path,
        "--content-type",
        content_type,
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--remote",
        "-y",
    ]
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            subprocess.run(cmd, check=True)
            return
        except subprocess.CalledProcessError as error:
            last_error = error
            wait = min(2 ** attempt, 30)
            print(f"retry {attempt}/{RETRIES} {key} in {wait}s", flush=True)
            time.sleep(wait)
    raise last_error or RuntimeError(f"failed {key}")


def main() -> None:
    rows = json.loads(REPORT.read_text())
    total = len(rows) * 2
    done = 0
    skipped = 0
    uploaded = 0
    for item in rows:
        for key, path, ctype in (
            (f"gaming/{item['id']}.mp4", item["video_path"], "video/mp4"),
            (f"gaming/{item['id']}.webp", item["poster_path"], "image/webp"),
        ):
            done += 1
            if already_public(key):
                skipped += 1
                print(f"[{done}/{total}] skip {key}", flush=True)
                continue
            print(f"[{done}/{total}] {key}", flush=True)
            put(key, path, ctype)
            uploaded += 1
    print(f"done total={total} uploaded={uploaded} skipped={skipped}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
