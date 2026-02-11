#!/bin/bash
set -euo pipefail

# Compress existing images to reduce S3 storage and bandwidth costs
# Requires ImageMagick: brew install imagemagick
# Run once: ./scripts/compress_images.sh

command -v magick >/dev/null 2>&1 || { 
  echo "Error: ImageMagick not found. Install: brew install imagemagick"
  exit 1
}

echo "Compressing images in app/public/..."

for img in app/public/*.{avif,png,jpg,jpeg} 2>/dev/null; do
  if [[ -f "$img" ]]; then
    echo "Compressing: $img"
    magick "$img" -quality 75 -resize 800x800\> "$img"
  fi
done

echo "✓ Image compression complete"
echo "✓ Run ./autodeploy.sh to upload compressed images"
