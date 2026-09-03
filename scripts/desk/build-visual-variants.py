"""Build the two cohesive low-poly Desk visual packs with Blender.

The source packs stay in the ignored local ``assets/3d`` library. This script
imports only the selected CC0 Kenney models, normalizes every prop around its
own bottom-center anchor, composes them in Desk world coordinates, and exports
four self-contained GLBs (desktop/mobile for Studio and Neon).

Run through Blender from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender \
      --background --factory-startup --disable-autoexec \
      --python-exit-code 1 --python scripts/desk/build-visual-variants.py
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from math import radians
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FURNITURE = (
    ROOT
    / "assets/3d/packs/kenney/furniture-kit/source/unpacked/Models/GLTF format"
)
SPACE = (
    ROOT
    / "assets/3d/packs/kenney/space-station-kit/source/unpacked/Models/GLB format"
)
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


STUDIO_PROPS = [
    prop(
        "Desk",
        FURNITURE,
        "table.glb",
        (0.0, -3.38, -3.2),
        1.0,
        bevel_ratio=0.01,
        # Keep the existing 1.81 tabletop height while giving the studio an
        # open, human-scale desk rather than a solid cabinet front.
        scale_axes=(12.83, 9.0, 15.88),
    ),
    prop(
        "Computer",
        FURNITURE,
        "computerScreen.glb",
        (0.0, 1.81, -4.45),
        8.8,
        bevel_ratio=0.018,
    ),
    prop(
        "Keyboard",
        FURNITURE,
        "computerKeyboard.glb",
        (0.0, 1.81, -2.65),
        10.0,
        bevel_ratio=0.018,
    ),
    prop(
        "Mouse",
        FURNITURE,
        "computerMouse.glb",
        (2.0, 1.81, -2.6),
        10.0,
        -0.08,
        bevel_ratio=0.025,
    ),
    prop(
        "Radio",
        FURNITURE,
        "radio.glb",
        (-3.65, 1.81, -3.65),
        6.2,
        0.04,
        bevel_ratio=0.012,
    ),
    prop(
        "PhotoDisplay",
        FURNITURE,
        "televisionModern.glb",
        (3.2, 1.81, -4.25),
        4.2,
        -0.12,
        bevel_ratio=0.016,
    ),
    prop(
        "Lamp",
        FURNITURE,
        "lampRoundTable.glb",
        (4.45, 1.81, -3.9),
        7.0,
        -0.18,
        bevel_ratio=0.015,
    ),
    prop(
        "DeskSpeakerLeft",
        FURNITURE,
        "speakerSmall.glb",
        (-2.25, 1.81, -4.45),
        5.0,
        0.03,
        bevel_ratio=0.015,
    ),
    prop(
        "DeskSpeakerRight",
        FURNITURE,
        "speakerSmall.glb",
        (2.25, 1.81, -4.45),
        5.0,
        -0.03,
        bevel_ratio=0.015,
    ),
    prop("Bookcase", FURNITURE, "bookcaseOpenLow.glb", (6.35, -3.38, -6.45), 9.0, -0.08),
    prop("Books", FURNITURE, "books.glb", (6.2, 0.2, -6.25), 7.5, -0.08),
    prop("Plant", FURNITURE, "pottedPlant.glb", (-6.35, -3.38, -6.45), 7.5, 0.08),
    prop("Chair", FURNITURE, "chairDesk.glb", (-1.0, -3.38, 0.4), 9.0, 3.05, True),
    prop("Rug", FURNITURE, "rugRounded.glb", (0.0, -3.35, -1.7), 15.0, 0.0, True),
]


NEON_PROPS = [
    prop(
        "Desk",
        SPACE,
        "table-display.glb",
        (0.0, -3.38, -3.25),
        8.35,
        bevel_ratio=0.006,
    ),
    prop(
        "Computer",
        SPACE,
        "computer-wide.glb",
        (0.0, 1.64, -4.45),
        4.8,
        bevel_ratio=0.009,
    ),
    prop(
        "Radio",
        SPACE,
        "computer-system.glb",
        (-3.55, 1.64, -3.45),
        2.65,
        0.04,
        bevel_ratio=0.009,
    ),
    prop(
        "PhotoDisplay",
        SPACE,
        "display-wall-wide.glb",
        (3.35, 1.64, -4.1),
        3.4,
        -0.1,
        bevel_ratio=0.009,
    ),
    prop("ConsoleLeft", SPACE, "table-display-small.glb", (-5.75, -3.38, -5.8), 5.2, 0.08),
    prop("ConsoleRight", SPACE, "table-inset-small.glb", (5.75, -3.38, -5.8), 5.2, -0.08),
    prop("ContainerLeft", SPACE, "container-tall.glb", (-7.0, -3.38, -6.9), 4.2, 0.12),
    prop("ContainerRight", SPACE, "container-wide.glb", (6.95, -3.38, -6.7), 4.2, -0.08),
    prop("Chair", SPACE, "chair-armrest-headrest.glb", (-0.9, -3.38, 0.7), 5.7, 3.05, True),
    prop("FloorPanelLeft", SPACE, "floor-panel.glb", (-4.0, -3.36, -0.8), 5.4, 0.0, True),
    prop("FloorPanelRight", SPACE, "floor-panel.glb", (3.9, -3.36, -0.8), 5.4, 0.0, True),
    prop("PipeLeft", SPACE, "pipe-bend.glb", (-7.4, 1.2, -7.8), 4.5, 0.0, True),
    prop("PipeRight", SPACE, "pipe.glb", (7.4, 1.0, -7.8), 4.5, 0.0, True),
]


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


def bevel_mesh(mesh: bpy.types.Object, ratio: float, mobile: bool) -> None:
    """Add a small manufactured edge without turning background props high-poly."""

    dimensions = [abs(value) for value in mesh.dimensions if abs(value) > 0.0001]
    if len(dimensions) < 2:
        return

    width = min(max(dimensions) * ratio, min(dimensions) * 0.18)
    if width <= 0.00005:
        return

    modifier = mesh.modifiers.new("Desk finish bevel", "BEVEL")
    modifier.width = width
    modifier.segments = 1 if mobile else 2
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = radians(28)
    modifier.harden_normals = True
    modifier.miter_outer = "MITER_ARC"

    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh.select_set(False)


def create_material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = color
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = 0.58
        principled.inputs["Metallic"].default_value = metallic
    return material


def create_box(
    name: str,
    position: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    bevel: float = 0.02,
    mobile: bool = False,
) -> None:
    x, y, z = position
    width, height, depth = dimensions
    bpy.ops.mesh.primitive_cube_add(location=gltf_to_blender((x, y, z)))
    box = bpy.context.active_object
    box.name = name
    box.dimensions = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    box.data.materials.append(material)
    if bevel:
        bevel_mesh(box, bevel / max(dimensions), mobile)


def add_studio_finish_details(mobile: bool) -> None:
    charcoal = create_material("Studio charcoal", (0.055, 0.07, 0.08, 1.0), 0.18)
    brass = create_material("Studio warm metal", (0.34, 0.20, 0.12, 1.0), 0.52)

    create_box("DeskMat__00", (0.15, 1.845, -3.05), (5.25, 0.055, 1.75), charcoal, 0.08, mobile)
    create_box("DeskTrim__00", (0.0, 1.63, -1.24), (9.85, 0.16, 0.14), brass, 0.045, mobile)

    columns = 10 if mobile else 12
    rows = 3
    key_width = 0.205
    key_depth = 0.225
    x_start = -((columns - 1) * 0.235) / 2
    for row in range(rows):
        for column in range(columns):
            create_box(
                f"KeyboardKey__{row:02d}_{column:02d}",
                (x_start + column * 0.235, 1.965, -2.91 + row * 0.255),
                (key_width, 0.07, key_depth),
                charcoal,
                0.022,
                mobile,
            )
    create_box("KeyboardKey__space", (0.0, 1.965, -2.13), (1.28, 0.07, 0.22), charcoal, 0.022, mobile)


def add_neon_finish_details(mobile: bool) -> None:
    deck = create_material("Neon deck", (0.035, 0.055, 0.13, 1.0), 0.46)
    cyan = create_material("Neon cyan", (0.05, 0.62, 0.82, 1.0), 0.25)
    pink = create_material("Neon pink", (0.92, 0.08, 0.48, 1.0), 0.25)

    create_box("NeonDeck__00", (0.0, 1.69, -2.4), (4.45, 0.13, 1.42), deck, 0.09, mobile)
    rows = 2
    columns = 6 if mobile else 8
    x_start = -((columns - 1) * 0.38) / 2
    for row in range(rows):
        for column in range(columns):
            create_box(
                f"NeonKey{'Cyan' if (row + column) % 3 else 'Pink'}__{row:02d}_{column:02d}",
                (x_start + column * 0.38, 1.805, -2.64 + row * 0.43),
                (0.25, 0.055, 0.22),
                cyan if (row + column) % 3 else pink,
                0.025,
                mobile,
            )
    create_box("NeonKeyCyan__status", (0.0, 1.805, -1.91), (2.2, 0.04, 0.08), cyan, 0.015, mobile)


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
        if item.bevel_ratio:
            bevel_mesh(mesh, item.bevel_ratio, mobile)


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


def export_pack(variant: str, props: list[Prop], mobile: bool) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    selected = [item for item in props if not mobile or not item.desktop_only]
    for item in selected:
        import_prop(item, mobile)
    if variant == "studio":
        add_studio_finish_details(mobile)
    else:
        add_neon_finish_details(mobile)
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
        "props": [item.name for item in selected],
        "meshCount": len(meshes),
        "triangles": triangles,
    }


def main() -> None:
    reports = []
    for variant, props in (("studio", STUDIO_PROPS), ("neon", NEON_PROPS)):
        reports.append(export_pack(variant, props, mobile=False))
        reports.append(export_pack(variant, props, mobile=True))
    print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
