"""Run with Blender --background --python scripts/render-gold-border.py -- --output PATH.

Requires Inkscape and ImageMagick. NumPy is included with Blender.
"""

import argparse
import copy
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import bpy
import numpy as np


SVG = "{http://www.w3.org/2000/svg}"
BODY = "#b58a35"
DETAIL = "#00ff00"
GEOMETRY_SCALE = 2
SOURCE = Path(__file__).resolve().parents[1] / "src/assets/gold-border.svg"


def prepare_geometry(destination):
    root = ET.parse(SOURCE).getroot()
    root.set("width", "1440")
    root.set("height", "300")
    root.set("viewBox", "-480 0 1440 300")
    groups = {"#" + element.get("id") for element in root.iter(SVG + "g") if element.get("id")}

    def clean(parent):
        for element in list(parent):
            tag = element.tag.removeprefix(SVG)
            fill = element.get("fill", "")
            stroke = element.get("stroke", "")
            reference = element.get("href", "")
            if tag in {"path", "use"}:
                if element.get("id"):
                    pass
                elif tag == "use" and reference in groups:
                    pass
                elif fill.startswith("url("):
                    element.set("fill", BODY)
                    element.attrib.pop("stroke", None)
                    element.attrib.pop("stroke-width", None)
                elif reference == "#joining-vine" and element.get("stroke-width") == "28":
                    element.set("stroke", BODY)
                elif tag == "path" and stroke.startswith("url("):
                    element.set("stroke", BODY)
                elif tag == "path" and stroke in {"#fff0b1", "#fff0b5"}:
                    element.set("stroke", DETAIL)
                else:
                    parent.remove(element)
                    continue
            clean(element)

    clean(root)
    vine = root.find(f".//{SVG}path[@id='joining-vine']")
    segment = vine.get("d").removeprefix("M0 145")
    vine.set("d", "M-480 145" + segment * 3)
    parts = [element for element in root if element.tag != SVG + "defs"]
    for element in parts:
        root.remove(element)
    # This lower half is already supplied by the neighboring tile.
    parts = [
        element for element in parts
        if element.get("transform") != "translate(360 291) scale(1 -1)"
    ]
    for offset in (-480, 0, 480):
        group = ET.SubElement(root, SVG + "g", {"transform": f"translate({offset} 0)"})
        for element in parts:
            if element.get("href") == "#joining-vine":
                if offset == 0:
                    root.append(copy.deepcopy(element))
            else:
                group.append(copy.deepcopy(element))
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    source = destination.with_name("relief-input.svg")
    ET.ElementTree(root).write(source, encoding="unicode")
    subprocess.run(
        [
            "inkscape", str(source), "--export-area-page",
            f"--export-width={1440 * GEOMETRY_SCALE}",
            f"--export-height={300 * GEOMETRY_SCALE}",
            f"--export-filename={destination}",
        ],
        check=True,
    )


def gold_material():
    material = bpy.data.materials.new("Polished carved gold")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.83, 0.50, 0.12, 1)
    shader.inputs["Metallic"].default_value = 1
    shader.inputs["Roughness"].default_value = 0.21
    return material


def sculpt_geometry(geometry, temporary):
    def pixels(path):
        image = bpy.data.images.load(str(path))
        image.colorspace_settings.name = "Non-Color"
        width, height = image.size
        values = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(values)
        bpy.data.images.remove(image)
        return values.reshape(height, width, 4)

    def smooth(values):
        padded = np.pad(values, 1, mode="edge")
        return (
            4 * values
            + padded[:-2, 1:-1] + padded[2:, 1:-1]
            + padded[1:-1, :-2] + padded[1:-1, 2:]
        ) / 8

    distance_path = temporary / "distance.png"
    subprocess.run(
        [
            "magick", str(geometry), "-alpha", "extract", "-threshold", "50%",
            "-morphology", "Dilate", f"Disk:{1.5 * GEOMETRY_SCALE}",
            "-morphology", "Distance", "Euclidean:4", "-depth", "16",
            str(distance_path),
        ],
        check=True,
    )
    color = pixels(geometry)
    # ImageMagick's Euclidean kernel increments Q16 samples by 100 per pixel.
    distance = pixels(distance_path)[:, :, 0] * 655.35 / GEOMETRY_SCALE
    silhouette = distance > 0
    grooves = np.clip((color[:, :, 1] - color[:, :, 0]) * 2, 0, 1)
    elevation = 2.8 * np.sqrt(distance)
    for _ in range(GEOMETRY_SCALE ** 2):
        grooves = smooth(grooves)
        elevation = smooth(smooth(elevation))
    elevation -= 2 * grooves
    elevation = np.maximum(elevation, 0.5) * 0.01

    height, width = silhouette.shape
    rows, columns = np.indices((height, width))
    vertices = np.stack(
        (
            ((columns + 0.5) / GEOMETRY_SCALE - 480) * 0.01,
            (rows + 0.5) / GEOMETRY_SCALE * 0.01,
            elevation,
        ),
        axis=-1,
    ).reshape(-1, 3)
    valid = (
        silhouette[:-1, :-1] & silhouette[:-1, 1:]
        & silhouette[1:, :-1] & silhouette[1:, 1:]
    )
    start = (rows[:-1, :-1] * width + columns[:-1, :-1])[valid]
    faces = np.stack((start, start + 1, start + width + 1, start + width), axis=-1)
    used = np.unique(faces)
    indices = np.full(height * width, -1, dtype=np.int32)
    indices[used] = np.arange(len(used))
    mesh = bpy.data.meshes.new("Rounded and engraved carving")
    mesh.from_pydata(vertices[used].tolist(), [], indices[faces].tolist())
    mesh.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    mesh.update()
    obj = bpy.data.objects.new("Sculpted gold relief", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(gold_material())
    solid = obj.modifiers.new("Solid carved backing", "SOLIDIFY")
    solid.thickness = 0.025
    solid.offset = -1
    return obj


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=1536)
    parser.add_argument("--samples", type=int, default=64)
    parser.add_argument("--scene", type=Path)
    args = parser.parse_args(arguments)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.preferences.addon_enable(module="cycles")
    with tempfile.TemporaryDirectory(prefix="enjoy-gold-") as directory:
        temporary = Path(directory)
        geometry = temporary / "relief.png"
        prepare_geometry(geometry)
        carving = sculpt_geometry(geometry, temporary)

        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = True
        scene.render.threads_mode = "FIXED"
        scene.render.threads = min(8, os.cpu_count() or 1)
        scene.render.resolution_x = args.width
        scene.render.resolution_y = round(args.width * 300 / 480)
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.image_settings.color_depth = "8"
        scene.render.filepath = str(temporary / "gold.png")
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.7

        world = bpy.data.worlds.new("Studio reflection environment")
        world.use_nodes = True
        nodes = world.node_tree.nodes
        links = world.node_tree.links
        environment = nodes.new("ShaderNodeTexEnvironment")
        studio = Path(bpy.utils.system_resource("DATAFILES")) / "studiolights/world/studio.exr"
        environment.image = bpy.data.images.load(str(studio))
        environment.image.pack()
        coordinates = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0.9, math.radians(35))
        links.new(coordinates.outputs["Normal"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], environment.inputs["Vector"])
        background = nodes.get("Background")
        background.inputs["Strength"].default_value = 0.85
        links.new(environment.outputs["Color"], background.inputs["Color"])
        scene.world = world
        for name, location, energy, height in [
            ("Upper reflection strip", (2.4, 3.8, 6), 400, 2),
            ("Lower reflection strip", (2.4, -2.5, 4), 140, 1),
            ("Soft frontal fill", (2.4, 1.5, 7), 120, 5.5),
        ]:
            light = bpy.data.lights.new(name, "AREA")
            light.energy = energy
            light.shape = "RECTANGLE"
            light.size = 40
            light.size_y = height
            obj = bpy.data.objects.new(name, light)
            scene.collection.objects.link(obj)
            obj.location = location

        bpy.ops.object.camera_add(location=(2.4, 1.5, 12))
        camera = bpy.context.object
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 4.8
        scene.camera = camera
        if args.scene:
            args.scene.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(args.scene.resolve()))
        bpy.ops.render.render(write_still=True)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "magick", scene.render.filepath,
                "-define", "webp:alpha-quality=100", "-quality", "94",
                str(args.output.resolve()),
            ],
            check=True,
        )
        print(f"Rendered {len(carving.data.polygons)} sculpted gold faces to {args.output}")


if __name__ == "__main__":
    main()
