#!/usr/bin/env python3
"""
Build the published scenario set for the PBS Deal Archive Uploader.

Converts every PBN in Practice-Bidding-Scenarios/bba-filtered/ to an
unrotated LIN file in scenarios/, and writes scenarios/index.json:

    [{ "name": "1N", "file": "1N.lin", "dealCount": 432 }, ...]

Usage:
    python3 tools/build_scenarios.py [path-to-bba-filtered]

Default source: ~/Practice-Bidding-Scenarios/bba-filtered
Run from the repo root whenever scenarios change, then commit and push.
"""
import glob
import json
import os
import sys

from pbn_to_lin import convert

DEFAULT_SRC = os.path.expanduser("~/Practice-Bidding-Scenarios/bba-filtered")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(repo_root, "scenarios")
    os.makedirs(out_dir, exist_ok=True)

    index = []
    errors = []
    for pbn_path in sorted(glob.glob(os.path.join(src, "*.pbn"))):
        name = os.path.splitext(os.path.basename(pbn_path))[0]
        try:
            with open(pbn_path, encoding="utf-8", errors="replace") as f:
                lines = convert(f.read())
        except Exception as e:
            errors.append(f"{name}: {e}")
            continue
        if not lines:
            errors.append(f"{name}: no boards")
            continue
        with open(os.path.join(out_dir, f"{name}.lin"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        index.append({"name": name, "file": f"{name}.lin", "dealCount": len(lines)})

    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)

    print(f"Wrote {len(index)} scenarios to {out_dir}")
    if errors:
        print(f"{len(errors)} errors:")
        for e in errors:
            print(" ", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
