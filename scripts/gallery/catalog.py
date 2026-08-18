from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

SOURCE_DIR = "/Users/francis/Movies/xbox录屏精选"
OUTPUT_DIR = "/Users/francis/Movies/xbox-gallery-web"
WEB_DIR = f"{OUTPUT_DIR}/web/gaming"
PHASE2_DIR = f"{OUTPUT_DIR}/web/gallery-phase2"
PHASE2_PREFIX = "/gallery-phase2/v2"
PHASE2_MANIFEST = str(Path(__file__).resolve().parents[2] / "data" / "gallery-phase2-assets.json")
GALLERY_INVENTORY = str(Path(__file__).resolve().parents[2] / "data" / "gallery-inventory.json")
AB_DIR = f"{OUTPUT_DIR}/ab"

REMUX_MAX_MBPS = 12.0
CRF = 21
MAXRATE = "12M"
BUFSIZE = "24M"
AUDIO_BITRATE = "160k"
PRESET = "slow"
POSTER_SS = "1"
POSTER_QUALITY = "80"

GAMES: list[tuple[str, str, str]] = [
    ("Atomic Heart", "atomic-heart", "Atomic Heart"),
    ("Baldur's Gate 3", "baldurs-gate-3", "Baldur's Gate 3"),
    ("Call of Duty®", "call-of-duty", "Call of Duty"),
    ("Hellblade_ Senua's Sacrifice", "hellblade-senuas-sacrifice", "Hellblade: Senua's Sacrifice"),
    ("Hi-Fi RUSH", "hi-fi-rush", "Hi-Fi RUSH"),
    ("JOJO的奇妙冒险 群星之战 重制版", "jojo-all-star-battle-r", "JoJo's Bizarre Adventure: All-Star Battle R"),
    ("Monster Train 2", "monster-train-2", "Monster Train 2"),
    ("RESIDENT EVIL 2", "resident-evil-2", "Resident Evil 2"),
    ("RESIDENT EVIL 3", "resident-evil-3", "Resident Evil 3"),
    ("Street Fighter 6", "street-fighter-6", "Street Fighter 6"),
    ("Superliminal", "superliminal", "Superliminal"),
    ("THE FINALS", "the-finals", "THE FINALS"),
    ("Tom Clancy's Rainbow Six Siege", "rainbow-six-siege", "Rainbow Six Siege"),
    ("Tom Clancy's Rainbow Six® Siege", "rainbow-six-siege", "Rainbow Six Siege"),
    ("Yakuza 0", "yakuza-0", "Yakuza 0"),
    ("《战地风云™ 2042》Xbox Series X_S", "battlefield-2042", "Battlefield 2042"),
    ("《極惡戰線》：Closed Beta", "evil-west", "Evil West"),
    ("光与影：33号远征队", "clair-obscur-expedition-33", "Clair Obscur: Expedition 33"),
    ("双人成行", "it-takes-two", "It Takes Two"),
    ("双影奇境", "split-fiction", "Split Fiction"),
    ("女神异闻录３ Reload", "persona-3-reload", "Persona 3 Reload"),
    ("女神异闻录５ 皇家版", "persona-5-royal", "Persona 5 Royal"),
    ("猛兽派对", "party-animals", "Party Animals"),
    ("精灵与萤火意志", "ori-and-the-will-of-the-wisps", "Ori and the Will of the Wisps"),
]

AB_SOURCES = [
    "女神异闻录５ 皇家版-2022_11_12-16_43_07.mp4",
    "Atomic Heart-2023_02_28-12_35_15.mp4",
    "RESIDENT EVIL 3-2025_07_09-13-18-58.mp4",
]

FILENAME_TS = re.compile(
    r"-(\d{4})[_-](\d{2})[_-](\d{2})-(\d{2})[_-](\d{2})[_-](\d{2})\.mp4$"
)


def parse_source_name(name: str) -> tuple[str, str, str, datetime]:
    match = FILENAME_TS.search(name)
    if not match:
        raise ValueError(f"unrecognized xbox filename: {name}")

    prefix = name[: match.start()]
    recorded = datetime(
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
        int(match.group(4)),
        int(match.group(5)),
        int(match.group(6)),
    )

    for game_prefix, slug, title in GAMES:
        if prefix == game_prefix:
            item_id = f"{slug}-{recorded.strftime('%Y%m%d-%H%M%S')}"
            return slug, title, item_id, recorded

    raise ValueError(f"unknown game prefix: {prefix}")


def decision_for_mbps(mbps: float) -> str:
    return "remux" if mbps <= REMUX_MAX_MBPS else "transcode"
