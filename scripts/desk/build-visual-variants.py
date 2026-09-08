"""Build two Desk PBR visual packs with Blender.

This script builds original hero models and room furnishings in Desk world
coordinates and exports
four self-contained GLBs (desktop/mobile for Studio and Neon).

Run through Blender from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender \
      --background --factory-startup --disable-autoexec \
      --python-exit-code 1 --python scripts/desk/build-visual-variants.py
"""

from __future__ import annotations

import json
import runpy
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/desk/models/variants"


def export_pack(variant: str, mobile: bool) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    runpy.run_path(str(Path(__file__).with_name("hero_assets.py")))["build"](variant, mobile)

    OUTPUT.mkdir(parents=True, exist_ok=True)
    suffix = "-mobile" if mobile else ""
    output = OUTPUT / f"desk-{variant}{suffix}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
    )

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
    triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
    return {
        "variant": variant,
        "mobile": mobile,
        "output": str(output),
        "bytes": output.stat().st_size,
        "props": [obj.name for obj in bpy.context.scene.objects if obj.type == "EMPTY"],
        "meshCount": len(meshes),
        "triangles": triangles,
    }


def main() -> None:
    reports = []
    for variant in ("studio", "neon"):
        reports.append(export_pack(variant, mobile=False))
        reports.append(export_pack(variant, mobile=True))
    print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
