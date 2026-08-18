#!/usr/bin/env python3
"""Generate optional Gallery hover-preview and responsive-poster assets.

The script reads the already processed Web MP4/WebP files from the local
gallery output directory. It never uploads or deletes remote objects.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from catalog import GALLERY_INVENTORY, PHASE2_DIR, PHASE2_MANIFEST, PHASE2_PREFIX, WEB_DIR
from phase2_manifest import (
    build_phase2_manifest,
    load_gallery_inventory,
    load_phase2_manifest,
    write_gallery_inventory,
)

PREVIEW_SECONDS = 4
PREVIEW_START = 1
PREVIEW_WIDTH = 854
POSTER_WIDTHS = (480, 768, 1280)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def generate_preview(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp.mp4')
    run(
        [
            'ffmpeg',
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-ss',
            str(PREVIEW_START),
            '-i',
            str(source),
            '-t',
            str(PREVIEW_SECONDS),
            '-vf',
            f"scale=w='min({PREVIEW_WIDTH},iw)':h=-2",
            '-an',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '28',
            '-maxrate',
            '2M',
            '-bufsize',
            '4M',
            '-movflags',
            '+faststart',
            str(temporary),
        ]
    )
    temporary.replace(destination)


def generate_poster_variant(source: Path, destination: Path, width: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp.webp')
    run(
        [
            'cwebp',
            '-quiet',
            '-q',
            '80',
            '-resize',
            str(width),
            '0',
            str(source),
            '-o',
            str(temporary),
        ]
    )
    temporary.replace(destination)


def phase2_url(prefix: str, filename: str) -> str:
    return f"{prefix.rstrip('/')}/{filename}"


def process_item(
    video: Path,
    source_dir: Path,
    output_dir: Path,
    r2_prefix: str,
    force: bool,
) -> dict[str, object]:
    item_id = video.stem
    poster = source_dir / f'{item_id}.webp'
    if not poster.exists():
        raise FileNotFoundError(f'missing poster for {item_id}: {poster}')

    preview = output_dir / f'{item_id}-preview.mp4'
    if force or not preview.exists():
        print(f'preview {item_id}', flush=True)
        generate_preview(video, preview)
    else:
        print(f'skip preview {item_id}', flush=True)

    sources: list[dict[str, object]] = []
    for width in POSTER_WIDTHS:
        variant = output_dir / f'{item_id}-{width}.webp'
        if force or not variant.exists():
            print(f'poster {item_id} {width}w', flush=True)
            generate_poster_variant(poster, variant, width)
        sources.append({'src': phase2_url(r2_prefix, variant.name), 'width': width})

    return {
        'id': item_id,
        'preview': phase2_url(r2_prefix, preview.name),
        'posterSrcSet': sources,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--manifest',
        default=PHASE2_MANIFEST,
        help='Committed phase-two manifest path.',
    )
    parser.add_argument('--source-dir', default=WEB_DIR)
    parser.add_argument('--output-dir', default=PHASE2_DIR)
    parser.add_argument('--r2-prefix', default=PHASE2_PREFIX)
    parser.add_argument('--inventory', default=GALLERY_INVENTORY)
    parser.add_argument('--id', action='append', dest='ids', help='Only process a selected id.')
    parser.add_argument(
        '--allow-inventory-change',
        action='store_true',
        help='Allow full generation to add or remove Gallery source ids and update inventory.',
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Regenerate selected assets instead of reusing local files.',
    )
    parser.add_argument('--jobs', type=int, default=3)
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = set(args.ids or [])
    videos = sorted(path for path in source_dir.glob('*.mp4') if not path.name.endswith('-preview.mp4'))
    available_ids = {path.stem for path in videos}
    unknown_ids = sorted(selected - available_ids)
    if unknown_ids:
        raise SystemExit(f'unknown phase-two ids: {", ".join(unknown_ids)}')
    if selected:
        videos = [path for path in videos if path.stem in selected]

    manifest_path = Path(args.manifest)
    inventory_path = Path(args.inventory)
    existing_assets: dict[str, dict[str, object]] = {}
    if selected:
        existing = load_phase2_manifest(manifest_path, expected_prefix=args.r2_prefix)
        existing_assets = existing['by_id']
    else:
        current_ids = available_ids
        if not manifest_path.is_file() and not args.allow_inventory_change:
            raise SystemExit(
                'full generation requires an existing phase-two manifest; '
                'use --allow-inventory-change to create or change inventory'
            )
        if not inventory_path.is_file() and not args.allow_inventory_change:
            raise SystemExit(
                'full generation requires the committed Gallery inventory; '
                'use --allow-inventory-change to create or change inventory'
            )

        mismatches: list[str] = []
        if manifest_path.is_file():
            existing = load_phase2_manifest(manifest_path, expected_prefix=args.r2_prefix)
            existing_ids = set(existing['by_id'])
            if current_ids != existing_ids:
                missing = ', '.join(sorted(existing_ids - current_ids))
                extra = ', '.join(sorted(current_ids - existing_ids))
                mismatches.append(
                    f'manifest mismatch (missing source ids: {missing or "none"}; '
                    f'new source ids: {extra or "none"})'
                )
        if inventory_path.is_file():
            inventory_ids = load_gallery_inventory(inventory_path)
            if current_ids != inventory_ids:
                missing = ', '.join(sorted(inventory_ids - current_ids))
                extra = ', '.join(sorted(current_ids - inventory_ids))
                mismatches.append(
                    f'inventory mismatch (missing source ids: {missing or "none"}; '
                    f'new source ids: {extra or "none"})'
                )
        if mismatches and not args.allow_inventory_change:
            raise SystemExit(
                'refusing to rewrite the full phase-two manifest: '
                + '; '.join(mismatches)
                + '; use --allow-inventory-change to confirm this inventory change'
            )

    manifest: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [
            pool.submit(process_item, video, source_dir, output_dir, args.r2_prefix, args.force)
            for video in videos
        ]
        for future in as_completed(futures):
            manifest.append(future.result())

    generated_assets = {str(item['id']): item for item in manifest}
    if selected:
        existing_assets.update(generated_assets)
        manifest_assets = [existing_assets[item_id] for item_id in sorted(existing_assets)]
    else:
        manifest_assets = [generated_assets[item_id] for item_id in sorted(generated_assets)]

    document = build_phase2_manifest(manifest_assets, args.r2_prefix)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
    if not selected:
        write_gallery_inventory(inventory_path, available_ids)
    print(f'wrote {manifest_path}')


if __name__ == '__main__':
    main()
