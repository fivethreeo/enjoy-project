"""Build SVG or TypeScript icon output from icon bounding boxes in an SVG layer."""

import argparse
import copy
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import xml.etree.ElementTree as ET


SVG_NAMESPACE = "http://www.w3.org/2000/svg"
SVG = f"{{{SVG_NAMESPACE}}}"
EDITOR_NAMESPACES = (
    "http://www.inkscape.org/namespaces/inkscape",
    "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
)

ET.register_namespace("", SVG_NAMESPACE)


def _local_name(tag):
    return tag.rsplit("}", 1)[-1]


def _simplify_presentation(element):
    style_fill = None
    style_opacity = {}
    style = element.attrib.pop("style", "")
    for declaration in style.split(";"):
        property_name, separator, value = declaration.partition(":")
        if not separator:
            continue
        property_name = property_name.strip()
        value = value.strip()
        if property_name == "fill":
            style_fill = value
        elif property_name in {"fill-opacity", "opacity"}:
            style_opacity[property_name] = value

    if style_fill is not None:
        element.set("fill", "none" if style_fill == "none" else "currentColor")
    elif element.get("fill") not in {None, "none"}:
        element.set("fill", "currentColor")

    for property_name, value in style_opacity.items():
        element.set(property_name, value)

    for attribute in list(element.attrib):
        local_name = _local_name(attribute)
        if (
            attribute.startswith(tuple(f"{{{namespace}}}" for namespace in EDITOR_NAMESPACES))
            or local_name == "stroke"
            or local_name.startswith("stroke-")
        ):
            del element.attrib[attribute]

    for child in element:
        _simplify_presentation(child)


def _remove_ids(element):
    element.attrib.pop("id", None)
    for child in element:
        _remove_ids(child)


def _number(value, attribute, rect_id):
    if value is None:
        raise ValueError(f"Rectangle '{rect_id}' has no {attribute!r} attribute.")
    return float(value)


def _guide_rectangles(root, layer_id):
    label_attribute = "{http://www.inkscape.org/namespaces/inkscape}label"
    # Keep the caller-selected layer for old masters, and also recognize the
    # stable label used by newer masters.  Artwork guides below supplement
    # these sources; they must never replace the ViewBoxes collection.
    guide_layers = [
        layer
        for layer in root.findall(f".//{SVG}g")
        if layer.get("id") == layer_id or layer.get(label_attribute) == "ViewBoxes"
    ]
    if not guide_layers:
        raise ValueError(f"Could not find guide layer '{layer_id}'.")

    rectangles = []
    rectangle_bounds = {}

    def add_rectangle(rect):
        rect_id = rect.get("id")
        if not rect_id:
            raise ValueError("Every guide rectangle must have an id.")

        x = _number(rect.get("x", "0"), "x", rect_id)
        y = _number(rect.get("y", "0"), "y", rect_id)
        width = _number(rect.get("width"), "width", rect_id)
        height = _number(rect.get("height"), "height", rect_id)
        if width <= 0 or height <= 0:
            raise ValueError(f"Rectangle '{rect_id}' must have positive dimensions.")

        bounds = (x, y, width, height)
        previous_bounds = rectangle_bounds.get(rect_id)
        if previous_bounds is not None:
            if previous_bounds != bounds:
                raise ValueError(
                    f"Guide '{rect_id}' has conflicting bounds {previous_bounds} and "
                    f"{bounds}."
                )
            return
        rectangle_bounds[rect_id] = bounds
        rectangles.append((rect_id, x, y, width, height))

    for layer in guide_layers:
        for rect in layer.findall(f".//{SVG}rect"):
            # This was the historic behavior for the ViewBoxes source: retain
            # named icon guides while ignoring Inkscape's anonymous rectN
            # artwork rectangles.
            if not re.fullmatch(r"rect\d+", rect.get("id", "")):
                add_rectangle(rect)

    # Sidebar controls live with the artwork. An exact label/id match makes a
    # rectangle an intentional guide without treating ordinary artwork as one.
    for artwork_layer in root.findall(f".//{SVG}g[@{label_attribute}='Artwork']"):
        for rect in artwork_layer.findall(f".//{SVG}rect"):
            rect_id = rect.get("id")
            if rect_id and rect.get(label_attribute) == rect_id:
                add_rectangle(rect)

    if not rectangles:
        raise ValueError(f"Guide layers have no rectangles.")

    return rectangles


def _assert_icon_registry_complete(icons, guide_ids):
    icon_ids = {name for name, *_ in icons}
    missing = sorted(set(guide_ids) - icon_ids)
    if missing:
        raise ValueError(
            "The generated icon registry is missing guide icons: "
            + ", ".join(missing)
        )

    sidebar_ids = {
        "withsidebarleft",
        "withsidebarright",
        "increasewithsidebarcontentwidth",
        "decreasewithsidebarcontentwidth",
        "increasewithsidebarsidebarwidth",
        "decreasewithsidebarsidebarwidth",
    }
    missing_sidebar = sorted(sidebar_ids - icon_ids)
    if missing_sidebar:
        raise ValueError(
            "The generated icon registry is missing sidebar icons: "
            + ", ".join(missing_sidebar)
        )

def _flatten_svg(source_tree, output_svg, guide_ids):
    source_tree = copy.deepcopy(source_tree)
    for parent in source_tree.getroot().iter():
        for child in list(parent):
            if _local_name(child.tag) == "rect" and child.get("id") in guide_ids:
                parent.remove(child)

    output_path = Path(output_svg)
    with tempfile.TemporaryDirectory(
        prefix=".prosango-icon-flatten-", dir=output_path.parent
    ) as temp_dir:
        temp_dir = Path(temp_dir)
        artwork_path = temp_dir / "artwork.svg"
        flattened_path = temp_dir / "path-flattened.svg"
        source_tree.write(artwork_path, encoding="utf-8", xml_declaration=True)

        ungrouped_path = _recursively_ungroup(artwork_path, "before-paths", temp_dir)
        _run_inkscape(
            str(ungrouped_path),
            str(flattened_path),
            "select-all;object-to-path;object-stroke-to-path;path-flatten",
        )
        ungrouped_path = _recursively_ungroup(
            flattened_path, "after-flatten", temp_dir
        )
        _run_inkscape(
            str(ungrouped_path),
            str(output_path),
            "select-all;path-union",
        )

def _run_inkscape(input_svg, output_svg, actions):
    command = [
        "inkscape",
        input_svg,
        f"--actions={actions}",
        "--export-plain-svg",
        f"--export-filename={output_svg}",
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("Inkscape must be installed and available on PATH.") from error
    if result.returncode:
        details = (result.stderr or result.stdout).strip()
        message = (
            f"Inkscape failed while applying actions: {actions!r}.\n"
            f"Command: {shlex.join(command)}"
        )
        if details:
            message = f"{message}\n{details}"
        raise RuntimeError(message)
    if not Path(output_svg).is_file():
        raise RuntimeError(f"Inkscape did not create expected output: {output_svg}")


def _path_bounds(svg_path):
    command = ["inkscape", str(svg_path), "--query-all"]
    try:
        result = subprocess.run(command, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("Inkscape must be installed and available on PATH.") from error
    if result.returncode:
        details = (result.stderr or result.stdout).strip()
        message = (
            f"Inkscape failed while querying paths in '{svg_path}'.\n"
            f"Command: {shlex.join(command)}"
        )
        if details:
            message = f"{message}\n{details}"
        raise RuntimeError(message)

    bounds = {}
    for line in result.stdout.splitlines():
        path_id, separator, values = line.partition(",")
        if not separator:
            continue
        try:
            x, y, width, height = (float(value) for value in values.split(","))
        except ValueError:
            continue
        bounds[path_id] = (x, y, width, height)
    return bounds


def _contains_groups(svg_path):
    root = ET.parse(svg_path).getroot()
    return any(_local_name(element.tag) == "g" for element in root.iter())


def _recursively_ungroup(input_svg, output_stem, temp_dir):
    current_path = Path(input_svg)
    for pass_number in range(1, 101):
        output_path = temp_dir / f"{output_stem}-ungrouped-{pass_number}.svg"
        _run_inkscape(
            str(current_path),
            str(output_path),
            "select-all:all;selection-ungroup",
        )
        if not _contains_groups(output_path):
            return output_path
        current_path = output_path

    raise RuntimeError(
        f"Could not ungroup icon source '{input_svg}' after 100 Inkscape passes."
    )


def _combine_symbol_paths(artwork, rect_id, x, y, width, height, temp_dir):
    source_path = temp_dir / f"{rect_id}.svg"
    ungrouped_stem = f"{rect_id}"
    flattened_path = temp_dir / f"{rect_id}-flattened.svg"
    intersection_path = temp_dir / f"{rect_id}-intersection.svg"
    unioned_path = temp_dir / f"{rect_id}-unioned.svg"
    source = ET.Element(
        f"{SVG}svg",
        {
            "width": f"{width:g}",
            "height": f"{height:g}",
            "viewBox": f"0 0 {width:g} {height:g}",
        },
    )
    translated_artwork = ET.SubElement(
        source,
        f"{SVG}g",
        {"transform": f"translate({-x:g} {-y:g})"},
    )
    for element in artwork:
        clone = copy.deepcopy(element)
        _remove_ids(clone)
        _simplify_presentation(clone)
        translated_artwork.append(clone)

    ET.ElementTree(source).write(source_path, encoding="utf-8", xml_declaration=True)
    ungrouped_path = _recursively_ungroup(source_path, ungrouped_stem, temp_dir)
    _run_inkscape(
        str(ungrouped_path),
        str(flattened_path),
        "select-all;object-to-path;object-stroke-to-path",
    )

    paths = {
        path.get("id"): path
        for path in ET.parse(flattened_path).getroot().findall(f".//{SVG}path")
        if path.get("id")
    }
    bounds = _path_bounds(flattened_path)
    clipped_paths = [
        path
        for path_id, path in paths.items()
        if path_id in bounds
        and bounds[path_id][0] < width
        and bounds[path_id][1] < height
        and bounds[path_id][0] + bounds[path_id][2] > 0
        and bounds[path_id][1] + bounds[path_id][3] > 0
    ]
    if not clipped_paths:
        return None

    intersection = ET.Element(
        f"{SVG}svg",
        {
            "width": f"{width:g}",
            "height": f"{height:g}",
            "viewBox": f"0 0 {width:g} {height:g}",
        },
    )
    actions = []
    for index, path in enumerate(clipped_paths):
        art_id = f"art-{index}"
        crop_id = f"crop-{index}"
        ET.SubElement(
            intersection, f"{SVG}path", {"id": art_id, "d": path.get("d", "")}
        )
        ET.SubElement(
            intersection,
            f"{SVG}path",
            {
                "id": crop_id,
                "d": f"M 0 0 H {width:g} V {height:g} H 0 Z",
            },
        )
        # A combined compound path can cancel overlapping subpaths during
        # boolean intersection. Clip each flattened path independently.
        actions.extend(
            (
                "select-clear",
                f"select-by-id:{art_id}",
                f"select-by-id:{crop_id}",
                "path-intersection",
            )
        )
    # Boolean union can also discard disjoint subpaths with opposing winding
    # directions (for example, cycleframeratios' right frame segment).
    # Combining retains every clipped subpath in the one output path.
    actions.extend(("select-all", "path-combine"))
    ET.ElementTree(intersection).write(intersection_path, encoding="utf-8", xml_declaration=True)
    _run_inkscape(
        str(intersection_path),
        str(unioned_path),
        ";".join(actions),
    )
    unioned_paths = ET.parse(unioned_path).getroot().findall(f".//{SVG}path")
    unioned_data = " ".join(path.get("d", "") for path in unioned_paths).strip()
    if not unioned_data:
        return None
    return unioned_data


def _compile_icons(input_svg, squares_layer_id):
    source_path = Path(input_svg)
    tree = ET.parse(source_path)
    rectangles = _guide_rectangles(tree.getroot(), squares_layer_id)
    icons = []

    with tempfile.TemporaryDirectory(
        prefix=".prosango-icon-sprite-", dir=source_path.parent
    ) as temp_dir:
        flattened_path = Path(temp_dir) / "flattened.svg"
        _flatten_svg(
            tree,
            str(flattened_path),
            {rect_id for rect_id, *_ in rectangles},
        )

        flattened_root = ET.parse(flattened_path).getroot()
        artwork = [
            child
            for child in flattened_root
            if _local_name(child.tag) not in {"defs", "metadata", "namedview"}
        ]

        for rect_id, x, y, width, height in rectangles:
            path_data = _combine_symbol_paths(
                artwork,
                rect_id,
                x,
                y,
                width,
                height,
                Path(temp_dir),
            )
            if path_data is None:
                print(f"Skipped empty icon guide '{rect_id}'.")
                continue
            icons.append((rect_id, width, height, path_data))

    _assert_icon_registry_complete(icons, [rect_id for rect_id, *_ in rectangles])
    return icons


def _write_svg_sprite(icons, output_path):
    sprite_sheet = ET.Element(f"{SVG}svg", {"style": "display: none"})
    defs = ET.SubElement(sprite_sheet, f"{SVG}defs")
    for rect_id, width, height, path_data in icons:
        symbol = ET.SubElement(
            defs,
            f"{SVG}symbol",
            {
                "id": rect_id,
                "viewBox": f"0 0 {width:g} {height:g}",
                "overflow": "hidden",
            },
        )
        ET.SubElement(
            symbol,
            f"{SVG}path",
            {"d": path_data, "fill": "currentColor"},
        )

    output_tree = ET.ElementTree(sprite_sheet)
    ET.indent(output_tree, space="  ")
    output_tree.write(output_path, encoding="utf-8", xml_declaration=True)


def _typescript_property(name):
    if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", name):
        return name
    return json.dumps(name)


def _write_typescript_icons(icons, output_path):
    lines = [
        "export interface IconSpec {",
        "  width: number;",
        "  height: number;",
        "  path: string;",
        "}",
        "",
        "export const icons = {",
    ]
    for name, width, height, path_data in icons:
        lines.extend(
            [
                f"  {_typescript_property(name)}: {{",
                f"    width: {width:g},",
                f"    height: {height:g},",
                f"    path: {json.dumps(path_data)},",
                "  },",
            ],
        )
    lines.extend(["} satisfies Record<string, IconSpec>;", ""])
    contents = "\n".join(lines)
    if output_path.is_file() and output_path.read_text(encoding="utf-8") == contents:
        return
    output_path.write_text(contents, encoding="utf-8")


def compile_precise_spritesheet_by_layer_input(
    input_svg,
    output_path,
    squares_layer_id,
    output_format="svg",
):
    """Create clipped icon paths as an SVG sprite sheet or TypeScript registry."""
    output_path = Path(output_path)
    icons = _compile_icons(input_svg, squares_layer_id)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_format == "svg":
        _write_svg_sprite(icons, output_path)
    elif output_format == "ts":
        _write_typescript_icons(icons, output_path)
    else:
        raise ValueError(f"Unsupported output format: {output_format}")
    print(f"Created {output_path} with {len(icons)} icons.")


def main():
    assets_dir = Path(__file__).resolve().parent
    project_dir = assets_dir.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=assets_dir / "master_icons.svg")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--format", choices=("svg", "ts"), default="svg")
    parser.add_argument("--layer", default="layer2", help="ID of the guide rectangle layer")
    args = parser.parse_args()

    output_path = args.output or (
        assets_dir / "production_icons.svg"
        if args.format == "svg"
        else project_dir / "typescript-frontend/src/icons.ts"
    )
    compile_precise_spritesheet_by_layer_input(
        args.input,
        output_path,
        args.layer,
        args.format,
    )


if __name__ == "__main__":
    main()
