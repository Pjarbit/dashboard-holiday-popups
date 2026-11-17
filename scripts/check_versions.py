#!/usr/bin/env python3
"""List every version reference (manifest, const.py, JS constants and 'pja' stamps).

Usage: python3 scripts/check_versions.py [expected_version]
Exits 1 if any reference differs from the expected version (default: manifest.json).
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PKG = ROOT / "custom_components" / "dashboard_holiday_popups"
manifest = json.loads((PKG / "manifest.json").read_text())
expected = sys.argv[1] if len(sys.argv) > 1 else manifest["version"]

found = [("manifest.json", 0, manifest["version"])]
patterns = [
    re.compile(r'^VERSION\s*=\s*"([^"]+)"'),
    re.compile(r"const VERSION = '([^']+)'"),
    re.compile(r"pja v(\d+\.\d+\.\d+)"),
    re.compile(r"Integration version:\s*(\d+\.\d+\.\d+)"),
    re.compile(r"(?:runtime|panel) v(\d+\.\d+\.\d+)"),
]
for path in [*PKG.glob("*.py"), PKG / "panel.js", *(PKG / "frontend").glob("*.js")]:
    for number, line in enumerate(path.read_text().splitlines(), 1):
        for pattern in patterns:
            for match in pattern.finditer(line):
                found.append((f"{path.relative_to(PKG)}", number, match.group(1)))

bad = 0
for name, number, value in found:
    flag = "ok " if value == expected else "BAD"
    bad += value != expected
    print(f"{flag} {name}:{number} {value}")
print(f"\nExpected {expected}; {len(found)} references; {bad} mismatched.")
sys.exit(1 if bad else 0)
