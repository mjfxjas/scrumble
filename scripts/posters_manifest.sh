#!/usr/bin/env bash
set -euo pipefail

# Generate posters.json for the gallery.
# Usage: ./scripts/posters_manifest.sh [base_dir]
# Default base_dir: public/scrumble_posters

BASE_DIR="${1:-public/scrumble_posters}"
THUMBS="${BASE_DIR}/website_thumb"
HEROS="${BASE_DIR}/website_hero"

python3 - "$BASE_DIR" <<'PY'
import json
import os
import sys

base = sys.argv[1]
thumb_dir = os.path.join(base, "website_thumb")
hero_dir  = os.path.join(base, "website_hero")
out_path  = os.path.join(base, "posters.json")

def is_image(filename):
    filename_lower = filename.lower()
    return any(filename_lower.endswith(ext)
               for ext in [".png",".jpg",".jpeg",".webp",".avif",".gif"])

try:
    files = sorted([f for f in os.listdir(thumb_dir) if is_image(f)])
except FileNotFoundError:
    print(f"Error: directory not found: {thumb_dir}", file=sys.stderr)
    sys.exit(1)

items = []
for f in files:
    # Use relative path from public/
    base_name = os.path.basename(base)
    thumb = f"/{base_name}/website_thumb/{f}"
    hero  = f"/{base_name}/website_hero/{f}"
    if not os.path.exists(os.path.join(hero_dir, f)):
        continue
    items.append({"name": os.path.splitext(f)[0],
                  "thumb": thumb,
                  "hero": hero})

with open(out_path, "w") as fp:
    json.dump(items, fp, indent=2)

print(f"Wrote {len(items)} items -> {out_path}")
PY
