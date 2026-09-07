"""Blender CLI: downsample the existing table textures and HDR for the Web.

Run from the repository root. Source files and table transforms stay unchanged.
"""
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(
    filepath=str(root / "assets/3d/models/desks/computer-desk/processed/desk-only.glb")
)
for image in bpy.data.images:
    width, height = image.size
    if max(width, height) > 1024:
        ratio = 1024 / max(width, height)
        image.scale(round(width * ratio), round(height * ratio))
        image.pack()
output = root / "public/desk/models/desk-web.glb"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB")
print("TABLE_WEB_BYTES", output.stat().st_size)

source = root / "assets/3d/environments/kloofendal-overcast/source/kloofendal_overcast_puresky_4k.hdr"
for width in (1024, 2048):
    image = bpy.data.images.load(str(source), check_existing=False)
    image.scale(width, width // 2)
    image.file_format = "HDR"
    image.filepath_raw = str(root / f"public/desk/kloofendal-overcast-{width // 1024}k.hdr")
    image.save()
    print("ENVIRONMENT_WEB", width, Path(image.filepath_raw).stat().st_size)
    bpy.data.images.remove(image)
