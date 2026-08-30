"""Normalize one desk model in Blender and export a self-contained GLB.

The source asset is never modified. Blender imports the model in its native
Z-up scene; the script bakes each mesh's world transform into a fresh mesh,
applies optional scale/rotation, and places the model's origin at its
bottom-center. The glTF exporter performs the standard Blender-to-glTF axis
conversion once at export time.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector


def parse_args() -> argparse.Namespace:
    if "--" not in sys.argv:
        cli_args: list[str] = []
    else:
        cli_args = sys.argv[sys.argv.index("--") + 1 :]

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="FBX, GLB, or glTF source path")
    parser.add_argument("--output", required=True, help="Output GLB path")
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="Additional source scale applied before normalization (default: 1)",
    )
    parser.add_argument(
        "--rotation",
        nargs=3,
        type=float,
        metavar=("X", "Y", "Z"),
        default=(0.0, 0.0, 0.0),
        help="Additional XYZ rotation in degrees before normalization",
    )
    return parser.parse_args(cli_args)


def import_source(source_path: Path) -> None:
    suffix = source_path.suffix.lower()

    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source_path))
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(source_path))
    else:
        raise SystemExit(f"Unsupported model format: {source_path.suffix}")


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))

    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)

    return minimum, maximum


def bake_mesh_objects(
    objects: list[bpy.types.Object], scale: float, rotation_degrees: tuple[float, float, float]
) -> list[bpy.types.Object]:
    global_transform = Euler(
        tuple(value * 3.141592653589793 / 180 for value in rotation_degrees), "XYZ"
    ).to_matrix().to_4x4() @ Matrix.Scale(scale, 4)
    baked_objects: list[bpy.types.Object] = []

    # Baking the complete world matrix avoids losing FBX parent transforms
    # (the MINGTU keyboard uses a scaled parent) during export.
    for source in objects:
        mesh = source.data.copy()
        mesh.transform(global_transform @ source.matrix_world)
        baked = bpy.data.objects.new(source.name, mesh)
        bpy.context.scene.collection.objects.link(baked)
        for material in source.data.materials:
            mesh.materials.append(material)
        baked_objects.append(baked)

    for scene_object in list(bpy.context.scene.objects):
        if scene_object not in baked_objects:
            bpy.data.objects.remove(scene_object, do_unlink=True)

    bpy.context.view_layer.update()
    return baked_objects


def place_origin_at_bottom_center(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum, maximum = world_bounds(objects)
    translation = Matrix.Translation(
        Vector((-(minimum.x + maximum.x) / 2, -(minimum.y + maximum.y) / 2, -minimum.z))
    )

    for obj in objects:
        obj.data.transform(translation)

    bpy.context.view_layer.update()
    return world_bounds(objects)


def make_paths_absolute() -> list[str]:
    missing: list[str] = []

    for image in bpy.data.images:
        if image.source != "FILE" or not image.filepath:
            continue

        image.filepath = bpy.path.abspath(image.filepath)
        # Some FBX exporters store procedural material names here rather than
        # actual files (for example "Map #..."). They are not missing files.
        if not Path(image.filepath).suffix:
            continue
        if not os.path.isfile(image.filepath):
            missing.append(image.filepath)

    return sorted(set(missing))


def export_glb(output_path: Path, objects: list[bpy.types.Object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )


def main() -> None:
    args = parse_args()
    source_path = Path(args.source).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not source_path.is_file():
        raise SystemExit(f"Source model does not exist: {source_path}")
    if args.scale <= 0:
        raise SystemExit("--scale must be greater than zero")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    import_source(source_path)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise SystemExit("The source model contains no mesh objects")

    missing_textures = make_paths_absolute()
    baked_objects = bake_mesh_objects(mesh_objects, args.scale, tuple(args.rotation))
    minimum, maximum = place_origin_at_bottom_center(baked_objects)
    dimensions = maximum - minimum
    export_glb(output_path, baked_objects)

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise SystemExit(f"Blender did not create a valid output: {output_path}")

    print(
        json.dumps(
            {
                "source": str(source_path),
                "output": str(output_path),
                "meshCount": len(mesh_objects),
                "bounds": {
                    "min": [round(value, 6) for value in minimum],
                    "max": [round(value, 6) for value in maximum],
                },
                "dimensions": [round(value, 6) for value in dimensions],
                "origin": "bottom-center",
                "missingTextures": missing_textures,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
