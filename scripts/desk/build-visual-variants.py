"""Build two Desk PBR visual packs with Blender.

The source packs stay in the ignored local ``assets/3d`` library. This script
builds original hero models and imports CC0 Kenney scenery, normalizing props around their
own bottom-center anchor, composes them in Desk world coordinates, and exports
four self-contained GLBs (desktop/mobile for Studio and Neon).

Run through Blender from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender \
      --background --factory-startup --disable-autoexec \
      --python-exit-code 1 --python scripts/desk/build-visual-variants.py
"""

from __future__ import annotations

import json
import runpy
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
CITY = (
    ROOT
    / "assets/3d/packs/kenney/city-kit-commercial/source/unpacked/Models/GLB format"
)
OUTPUT = ROOT / "public/desk/models/variants"


@dataclass(frozen=True)
class Prop:
    name: str
    source: Path
    position: tuple[float, float, float]
    scale: float
    rotation_y: float = 0.0
    desktop_only: bool = False
    bevel_ratio: float = 0.0
    scale_axes: tuple[float, float, float] | None = None


def prop(
    name: str,
    source_root: Path,
    filename: str,
    position: tuple[float, float, float],
    scale: float,
    rotation_y: float = 0.0,
    desktop_only: bool = False,
    bevel_ratio: float = 0.0,
    scale_axes: tuple[float, float, float] | None = None,
) -> Prop:
    return Prop(
        name,
        source_root / filename,
        position,
        scale,
        rotation_y,
        desktop_only,
        bevel_ratio,
        scale_axes,
    )


CITY_FILES = [
    "low-detail-building-a.glb",
    "low-detail-building-b.glb",
    "low-detail-building-c.glb",
    "low-detail-building-d.glb",
    "low-detail-building-e.glb",
    "low-detail-building-f.glb",
    "low-detail-building-g.glb",
    "low-detail-building-h.glb",
    "low-detail-building-i.glb",
]


CITY_POSITIONS = [
    (-7.8, -3.1, -17.5, 5.0),
    (-5.7, -3.1, -18.7, 6.8),
    (-3.6, -3.1, -17.9, 5.8),
    (-1.4, -3.1, -19.6, 8.0),
    (0.9, -3.1, -18.0, 6.2),
    (3.1, -3.1, -19.2, 7.6),
    (5.4, -3.1, -17.7, 5.7),
    (7.4, -3.1, -19.0, 7.0),
    (9.2, -3.1, -18.2, 5.4),
]


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    for item in objects:
        if item.type != "MESH":
            continue
        for corner in item.bound_box:
            point = item.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum


def gltf_to_blender(position: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = position
    return (x, -z, y)


def import_prop(item: Prop, mobile: bool) -> None:
    if not item.source.is_file():
        raise SystemExit(f"Missing source model: {item.source}")

    previous = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(item.source))
    imported = [obj for obj in bpy.context.scene.objects if obj not in previous]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise SystemExit(f"Source has no meshes: {item.source}")

    root = bpy.data.objects.new(item.name, None)
    bpy.context.scene.collection.objects.link(root)
    top_level = [obj for obj in imported if obj.parent not in imported]
    for obj in top_level:
        obj.parent = root

    minimum, maximum = world_bounds(meshes)
    root.location = gltf_to_blender(item.position)
    root.rotation_euler[2] = item.rotation_y
    root.scale = item.scale_axes or (item.scale, item.scale, item.scale)
    for obj in top_level:
        obj.location -= Vector(
            ((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z)
        )

    for index, mesh in enumerate(meshes):
        mesh.name = f"{item.name}__{index:02d}"
        mesh.data.name = f"{item.name}__geometry_{index:02d}"


def import_city(mobile: bool) -> None:
    count = 5 if mobile else len(CITY_FILES)
    for index, (filename, placement) in enumerate(zip(CITY_FILES[:count], CITY_POSITIONS[:count])):
        x, y, z, scale = placement
        import_prop(
            prop(
                f"CityBuilding{index + 1:02d}",
                CITY,
                filename,
                (x, y, z),
                scale,
                0.0,
            ),
            mobile,
        )


def export_pack(variant: str, mobile: bool) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    runpy.run_path(str(Path(__file__).with_name("hero_assets.py")))["build"](variant, mobile)
    import_city(mobile)

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
