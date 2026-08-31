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
        "--only-mesh", action="append", default=[], metavar="NAME",
        help="Keep only this source mesh (repeatable); useful for individual props in a pack",
    )
    parser.add_argument(
        "--omit-mesh", action="append", default=[], metavar="NAME",
        help="Exclude this source mesh (repeatable); useful for a mobile LOD",
    )
    parser.add_argument(
        "--max-texture-size", type=int, default=None,
        help="Optionally downsample embedded textures before export; source files stay unchanged",
    )
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
    parser.add_argument(
        "--part-offset",
        nargs=4,
        action="append",
        default=[],
        metavar=("NAME", "X", "Y", "Z"),
        help="Offset a named normalized mesh in glTF coordinates; keep other parts anchored",
    )
    parser.add_argument(
        "--screen-uv",
        nargs=2,
        action="append",
        default=[],
        metavar=("MESH", "MATERIAL"),
        help="Reproject only the selected display faces onto normalized glTF X/Y UVs",
    )
    return parser.parse_args(cli_args)


def import_source(source_path: Path) -> None:
    suffix = source_path.suffix.lower()

    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source_path))
        restore_corona_constant_colors(source_path)
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(source_path))
    else:
        raise SystemExit(f"Unsupported model format: {source_path.suffix}")


def restore_corona_constant_colors(source_path: Path) -> None:
    """Recover FBX CoronaColor diffuse constants which Blender's importer ignores.

    Only direct constant-color links are supported, not arbitrary procedural maps.
    Read the actual source RGB/colour-space, never infer colors from material names.
    """
    from io_scene_fbx import parse_fbx

    root, _ = parse_fbx.parse(str(source_path))
    objects = next(element for element in root.elems if element.id == b"Objects")
    by_id = {element.props[0]: element for element in objects.elems}
    connections = next(element for element in root.elems if element.id == b"Connections")
    for link in connections.elems:
        if len(link.props) < 4 or link.props[3] != b"3dsMax|CoronaMtlPb|texmapDiffuse":
            continue
        color_map = by_id.get(link.props[1])
        material_element = by_id.get(link.props[2])
        if color_map is None or material_element is None:
            continue
        properties = {
            prop.props[0]: prop.props[4:]
            for group in color_map.elems if group.id == b"Properties70"
            for prop in group.elems
        }
        rgb = properties.get(b"3dsMax|CoronaColorPb|color")
        if not rgb or properties.get(b"3dsMax|CoronaColorPb|method") != [0]:
            continue
        if properties.get(b"3dsMax|CoronaColorPb|colorSpace") != [1]:
            continue  # Do not guess unknown color-space semantics.
        name = material_element.props[1].split(b"\x00\x01")[0].decode("utf-8")
        material = bpy.data.materials.get(name)
        if not material or not material.node_tree:
            continue
        # Corona's sRGB constant -> glTF/Principled linear base color.
        linear = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                socket = node.inputs["Base Color"]
                for node_link in list(socket.links):
                    material.node_tree.links.remove(node_link)
                socket.default_value = (*linear, 1.0)
                material.diffuse_color = (*linear, 1.0)
        print("RESTORED_CORONA_BASE_COLOR", name, list(rgb))


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
        # Mesh.copy() already copies its material slots; do not append them twice.
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


def offset_parts(objects: list[bpy.types.Object], offsets: list[list[str]]) -> None:
    by_name = {obj.name: obj for obj in objects}
    for name, x, y, z in offsets:
        if name not in by_name:
            raise SystemExit(f"Unknown normalized mesh for --part-offset: {name}")
        # glTF is Y-up; Blender is Z-up. Do not recenter after placement edits:
        # untouched parts (e.g. the keyboard) must keep their exact coordinates.
        translation = Matrix.Translation(Vector((float(x), -float(z), float(y))))
        by_name[name].data.transform(translation)
    bpy.context.view_layer.update()


def reproject_screen_uvs(objects: list[bpy.types.Object], screens: list[list[str]]) -> None:
    """Map rectangular media across an upright screen, preserving its curved mesh.

    Imported unwraps may fold/compress border triangles. Project from normalized
    front coordinates instead; do not alter the bezel or any vertex positions.
    Blender Z is glTF Y, and the exporter converts Blender's bottom-up UV V.
    """
    by_name = {obj.name: obj for obj in objects}
    for name, material_name in screens:
        if name not in by_name:
            raise SystemExit(f"Unknown normalized mesh for --screen-uv: {name}")
        mesh = by_name[name].data
        slots = {
            index for index, material in enumerate(mesh.materials)
            if material and material.name == material_name
        }
        faces = [face for face in mesh.polygons if face.material_index in slots]
        if not faces:
            raise SystemExit(f"No display faces for --screen-uv: {name} / {material_name}")
        points = [mesh.vertices[index].co for face in faces for index in face.vertices]
        min_x, max_x = min(p.x for p in points), max(p.x for p in points)
        min_z, max_z = min(p.z for p in points), max(p.z for p in points)
        if max_x - min_x <= 1e-6 or max_z - min_z <= 1e-6:
            raise SystemExit(f"--screen-uv requires a nondegenerate upright X/Y display: {name}")
        uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
        for face in faces:
            for index in face.loop_indices:
                point = mesh.vertices[mesh.loops[index].vertex_index].co
                uv.data[index].uv = (
                    (point.x - min_x) / (max_x - min_x),
                    (point.z - min_z) / (max_z - min_z),
                )


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
    if args.only_mesh:
        missing = set(args.only_mesh) - {obj.name for obj in mesh_objects}
        if missing:
            raise SystemExit(f"Unknown source mesh for --only-mesh: {sorted(missing)}")
        mesh_objects = [obj for obj in mesh_objects if obj.name in args.only_mesh]
    if args.omit_mesh:
        missing = set(args.omit_mesh) - {obj.name for obj in mesh_objects}
        if missing:
            raise SystemExit(f"Unknown source mesh for --omit-mesh: {sorted(missing)}")
        mesh_objects = [obj for obj in mesh_objects if obj.name not in args.omit_mesh]
        if not mesh_objects:
            raise SystemExit("--omit-mesh removed every mesh")

    missing_textures = make_paths_absolute()
    if args.max_texture_size is not None:
        if args.max_texture_size < 1:
            raise SystemExit("--max-texture-size must be positive")
        for image in bpy.data.images:
            width, height = image.size
            if max(width, height) > args.max_texture_size:
                ratio = args.max_texture_size / max(width, height)
                image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
                image.pack()
    baked_objects = bake_mesh_objects(mesh_objects, args.scale, tuple(args.rotation))
    place_origin_at_bottom_center(baked_objects)
    offset_parts(baked_objects, args.part_offset)
    reproject_screen_uvs(baked_objects, args.screen_uv)
    minimum, maximum = world_bounds(baked_objects)
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
                "origin": "normalized-bottom-center-anchor" if args.part_offset else "bottom-center",
                "partOffsets": args.part_offset,
                "screenUVs": args.screen_uv,
                "selectedMeshes": args.only_mesh,
                "omittedMeshes": args.omit_mesh,
                "maxTextureSize": args.max_texture_size,
                "missingTextures": missing_textures,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
