#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from catalog import (
    AB_DIR,
    AB_SOURCES,
    AUDIO_BITRATE,
    BUFSIZE,
    CRF,
    MAXRATE,
    OUTPUT_DIR,
    POSTER_QUALITY,
    POSTER_SS,
    PRESET,
    SOURCE_DIR,
    WEB_DIR,
    decision_for_mbps,
    parse_source_name,
)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def probe(path: Path) -> dict:
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]
    )
    data = json.loads(raw)
    fmt = data["format"]
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = next(s for s in data["streams"] if s["codec_type"] == "audio")
    size = int(fmt.get("size") or path.stat().st_size)
    duration = float(fmt.get("duration") or 0)
    bitrate = int(fmt["bit_rate"]) if fmt.get("bit_rate") else int(size * 8 / duration)
    num, den = (video.get("avg_frame_rate") or "0/1").split("/")
    avg_fps = int(num) / int(den) if int(den) else 0
    return {
        "duration": duration,
        "size": size,
        "bitrate": bitrate,
        "mbps": bitrate / 1_000_000,
        "width": int(video["width"]),
        "height": int(video["height"]),
        "avg_fps": avg_fps,
        "r_frame_rate": video.get("r_frame_rate"),
        "vcodec": video.get("codec_name"),
        "vprofile": video.get("profile"),
        "pix_fmt": video.get("pix_fmt"),
        "has_b_frames": video.get("has_b_frames"),
        "color_space": video.get("color_space"),
        "color_primaries": video.get("color_primaries"),
        "color_transfer": video.get("color_transfer"),
        "acodec": audio.get("codec_name"),
        "aprofile": audio.get("profile"),
    }


def transcode(src: Path, dest: Path, crf: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.mp4")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-stats",
            "-y",
            "-i",
            str(src),
            "-c:v",
            "libx264",
            "-threads",
            "2",
            "-preset",
            PRESET,
            "-crf",
            str(crf),
            "-maxrate",
            MAXRATE,
            "-bufsize",
            BUFSIZE,
            "-c:a",
            "aac",
            "-b:a",
            AUDIO_BITRATE,
            "-movflags",
            "+faststart",
            str(tmp),
        ]
    )
    tmp.replace(dest)


def remux(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.mp4")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(src),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(tmp),
        ]
    )
    tmp.replace(dest)


def poster(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    frame = dest.with_suffix(".tmp.png")
    tmp = dest.with_suffix(".tmp.webp")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            POSTER_SS,
            "-i",
            str(src),
            "-frames:v",
            "1",
            str(frame),
        ]
    )
    run(
        [
            "cwebp",
            "-quiet",
            "-q",
            POSTER_QUALITY,
            str(frame),
            "-o",
            str(tmp),
        ]
    )
    frame.unlink(missing_ok=True)
    tmp.replace(dest)


def moov_is_faststart(path: Path) -> bool:
    data = path.read_bytes()[: 2_000_000]
    moov = data.find(b"moov")
    mdat = data.find(b"mdat")
    return moov != -1 and (mdat == -1 or moov < mdat)


def list_sources() -> list[Path]:
    return sorted(Path(SOURCE_DIR).glob("*.mp4"))


def write_gallery_ts(rows: list[dict], dest: Path) -> None:
    items = []
    for row in sorted(rows, key=lambda item: (item["title"], item["recorded_at"], item["id"])):
        items.append(
            "  {\n"
            f"    id: {json.dumps(row['id'])},\n"
            "    type: 'gaming',\n"
            f"    title: {json.dumps(row['title'], ensure_ascii=False)},\n"
            f"    game: {json.dumps(row['title'], ensure_ascii=False)},\n"
            f"    recordedAt: {json.dumps(row['recorded_at'])},\n"
            f"    video: {json.dumps('/gaming/' + row['id'] + '.mp4')},\n"
            f"    poster: {json.dumps('/gaming/' + row['id'] + '.webp')},\n"
            f"    width: {row['out_width']},\n"
            f"    height: {row['out_height']},\n"
            f"    duration: {round(row['out_duration'], 1)},\n"
            "  },"
        )

    dest.write_text(
        "export type GalleryItemType = 'gaming' | 'phone'\n"
        "\n"
        "// `phone` only shares this schema. Phone sources need a separate\n"
        "// codec / color / rotation / frame-timing intake before encode.\n"
        "\n"
        "export type GalleryItem = {\n"
        "  id: string\n"
        "  type: GalleryItemType\n"
        "  title: string\n"
        "  game?: string\n"
        "  recordedAt: string\n"
        "  video: string\n"
        "  poster: string\n"
        "  width: number\n"
        "  height: number\n"
        "  duration: number\n"
        "}\n"
        "\n"
        "export const galleryItems: GalleryItem[] = [\n"
        + "\n".join(items)
        + "\n]\n"
    )


def cmd_ab(jobs: int) -> None:
    Path(AB_DIR).mkdir(parents=True, exist_ok=True)
    tasks: list[tuple[Path, Path, int, str]] = []
    for name in AB_SOURCES:
        src = Path(SOURCE_DIR) / name
        _, _, item_id, _ = parse_source_name(name)
        source_meta = probe(src)
        print(
            f"AB source {name} {source_meta['width']}x{source_meta['height']} "
            f"{source_meta['mbps']:.1f}Mbps {source_meta['duration']:.1f}s"
        )
        for crf in (20, 21, 22):
            dest = Path(AB_DIR) / f"{item_id}-crf{crf}.mp4"
            tasks.append((src, dest, crf, item_id))

    def work(task: tuple[Path, Path, int, str]) -> dict:
        src, dest, crf, item_id = task
        print(f"encoding {dest.name}", flush=True)
        transcode(src, dest, crf)
        meta = probe(dest)
        return {
            "id": item_id,
            "crf": crf,
            "path": str(dest),
            "mbps": round(meta["mbps"], 2),
            "size_mb": round(meta["size"] / 1024 / 1024, 1),
            "duration": round(meta["duration"], 2),
            "faststart": moov_is_faststart(dest),
        }

    results = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = [pool.submit(work, task) for task in tasks]
        for future in as_completed(futures):
            results.append(future.result())

    report = Path(OUTPUT_DIR) / "ab-report.json"
    report.write_text(json.dumps(sorted(results, key=lambda r: (r["id"], r["crf"])), indent=2))
    print(f"wrote {report}")
    for row in sorted(results, key=lambda r: (r["id"], r["crf"])):
        print(
            f"{row['id']} crf={row['crf']} {row['mbps']:.2f}Mbps "
            f"{row['size_mb']}MB faststart={row['faststart']}"
        )


def process_one(src: Path, crf: int) -> dict:
    slug, title, item_id, recorded = parse_source_name(src.name)
    source = probe(src)
    decision = decision_for_mbps(source["mbps"])
    video_path = Path(WEB_DIR) / f"{item_id}.mp4"
    poster_path = Path(WEB_DIR) / f"{item_id}.webp"

    if not video_path.exists():
        print(f"{decision} {item_id} ({source['mbps']:.1f}Mbps)", flush=True)
        if decision == "remux":
            remux(src, video_path)
        else:
            transcode(src, video_path, crf)
    elif not poster_path.exists():
        print(f"poster only {item_id}", flush=True)
    else:
        print(f"skip existing {item_id}", flush=True)

    if not poster_path.exists():
        poster(video_path, poster_path)

    output = probe(video_path)
    return {
        "id": item_id,
        "slug": slug,
        "title": title,
        "game": title,
        "recorded_at": recorded.strftime("%Y-%m-%d"),
        "source_name": src.name,
        "decision": decision,
        "source_width": source["width"],
        "source_height": source["height"],
        "source_bitrate_mbps": round(source["mbps"], 2),
        "source_avg_fps": round(source["avg_fps"], 3),
        "source_r_frame_rate": source["r_frame_rate"],
        "source_duration": round(source["duration"], 3),
        "source_has_b_frames": source["has_b_frames"],
        "source_color_space": source["color_space"],
        "source_color_primaries": source["color_primaries"],
        "source_color_transfer": source["color_transfer"],
        "output_bitrate_mbps": round(output["mbps"], 2),
        "output_duration": round(output["duration"], 3),
        "output_faststart": moov_is_faststart(video_path),
        "crf": None if decision == "remux" else crf,
        "out_width": output["width"],
        "out_height": output["height"],
        "out_duration": output["duration"],
        "video_path": str(video_path),
        "poster_path": str(poster_path),
    }


def cmd_batch(jobs: int, crf: int, gallery_ts: Path) -> None:
    Path(WEB_DIR).mkdir(parents=True, exist_ok=True)
    sources = list_sources()
    if len(sources) != 82:
        raise SystemExit(f"expected 82 sources, found {len(sources)}")

    rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = [pool.submit(process_one, src, crf) for src in sources]
        for future in as_completed(futures):
            rows.append(future.result())

    report = Path(OUTPUT_DIR) / "process-report.json"
    report.write_text(json.dumps(sorted(rows, key=lambda r: r["id"]), ensure_ascii=False, indent=2))
    write_gallery_ts(rows, gallery_ts)
    print(f"wrote {report}")
    print(f"wrote {gallery_ts}")
    remux_count = sum(1 for row in rows if row["decision"] == "remux")
    print(f"done remux={remux_count} transcode={len(rows) - remux_count}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["ab", "batch"])
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--crf", type=int, default=CRF)
    parser.add_argument(
        "--gallery-ts",
        default=str(Path(__file__).resolve().parents[2] / "data" / "gallery.ts"),
    )
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parent)
    if args.command == "ab":
        cmd_ab(args.jobs)
    else:
        cmd_batch(args.jobs, args.crf, Path(args.gallery_ts))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
