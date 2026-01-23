#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/posters_build.sh public/scrumble_posters
#
# What it does:
# - Finds all images in <base>/originals (png/jpg/jpeg/webp/avif/tif/tiff)
# - Writes resized/cropped outputs into:
#     instagram_feed_4x5   (1080x1350 crop)
#     instagram_story_9x16 (1080x1920 crop)
#     website_hero         (2400w preserve aspect)
#     website_thumb        (1000w preserve aspect)
#
# Notes:
# - Originals are never modified.
# - Output format is kept the same as input (png stays png, avif stays avif, etc.)

BASE_DIR="${1:-public/scrumble_posters}"
ORIG_DIR="${BASE_DIR}/originals"

FEED_DIR="${BASE_DIR}/instagram_feed_4x5"
STORY_DIR="${BASE_DIR}/instagram_story_9x16"
HERO_DIR="${BASE_DIR}/website_hero"
THUMB_DIR="${BASE_DIR}/website_thumb"

command -v magick >/dev/null 2>&1 || { echo "Error: ImageMagick not found. Install: brew install imagemagick"; exit 1; }

mkdir -p "$FEED_DIR" "$STORY_DIR" "$HERO_DIR" "$THUMB_DIR"

# Find all supported images (case-insensitive)
mapfile -d '' FILES < <(find "$ORIG_DIR" -type f \( \
  -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" -o -iname "*.avif" -o -iname "*.tif" -o -iname "*.tiff" \
\) -print0)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No images found in: $ORIG_DIR"
  exit 0
fi

echo "Found ${#FILES[@]} originals. Building outputs..."

for f in "${FILES[@]}"; do
  base="$(basename "$f")"

  # Instagram Feed 4:5 — fill then center-crop
  magick "$f" -resize 1080x1350^ -gravity center -extent 1080x1350 "$FEED_DIR/$base"

  # Instagram Story 9:16 — fill then center-crop
  magick "$f" -resize 1080x1920^ -gravity center -extent 1080x1920 "$STORY_DIR/$base"

  # Website hero — 2400 wide, keep aspect
  magick "$f" -resize 2400x "$HERO_DIR/$base"

  # Website thumb — 1000 wide, keep aspect
  magick "$f" -resize 1000x "$THUMB_DIR/$base"
done

echo "Done."
echo "Feed:  $FEED_DIR"
echo "Story: $STORY_DIR"
echo "Hero:  $HERO_DIR"
echo "Thumb: $THUMB_DIR"
