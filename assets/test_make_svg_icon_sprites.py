"""Regression checks for the current Inkscape icon master."""

import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ASSETS = Path(__file__).parent
MASTER = ASSETS / "master_icons.svg"
sys.path.insert(0, str(ASSETS))

import make_svg_icon_sprites as sprites


REQUIRED_KEYS = {
    "inspect",
    "movenodeup",
    "movenodedown",
    "centertext",
    "box",
    "cluster",
    "addboxborder",
    "increasegap",
    "decreasegap",
    "increasepadding",
    "decreasepadding",
    "increasemeasure",
    "decreasemeasure",
}


class IconSpriteRegressionTest(unittest.TestCase):
    def test_current_master_generates_matching_registries(self):
        guides = sprites._guide_rectangles(ET.parse(MASTER).getroot(), "layer2")
        guide_ids = {name for name, *_ in guides}
        icons = sprites._compile_icons(MASTER, "layer2")
        icon_ids = {name for name, *_ in icons}

        self.assertTrue(REQUIRED_KEYS <= icon_ids)
        self.assertEqual(guide_ids, icon_ids)

        with tempfile.TemporaryDirectory(prefix=".icon-regression-", dir=ASSETS) as directory:
            directory = Path(directory)
            svg_path = directory / "icons.svg"
            ts_path = directory / "icons.ts"
            sprites._write_svg_sprite(icons, svg_path)
            sprites._write_typescript_icons(icons, ts_path)

            svg_ids = {
                symbol.get("id")
                for symbol in ET.parse(svg_path).getroot().findall(
                    ".//{http://www.w3.org/2000/svg}symbol"
                )
            }
            typescript_ids = set(
                re.findall(r"^  ([A-Za-z_$][A-Za-z0-9_$]*): \{$", ts_path.read_text(), re.M)
            )
            self.assertEqual(svg_ids, icon_ids)
            self.assertEqual(typescript_ids, icon_ids)


if __name__ == "__main__":
    unittest.main()
