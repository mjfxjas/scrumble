#!/bin/bash
set -euo pipefail

echo "=== Scrumble Auto-Deploy ==="

SCRUMBLE_BUCKET="${SCRUMBLE_BUCKET:-scrumble.cc}"
SCRUMBLE_CF_DISTRIBUTION_ID="${SCRUMBLE_CF_DISTRIBUTION_ID:-E2F6VQWXTCO8OB}"

# Build Lambda
echo "→ Building Lambda..."
sam build

# Deploy Lambda (continue on error)
echo "→ Deploying Lambda to AWS..."
sam deploy || echo "⚠ SAM deploy skipped (no changes or error)"

# Deploy frontend to scrumble.cc
echo "→ Deploying frontend to scrumble.cc..."
# HTML files: short cache (1 hour)
aws s3 sync app/ "s3://${SCRUMBLE_BUCKET}/" --delete --exclude "*" --include "*.html" --cache-control "max-age=3600" --exclude ".DS_Store"
# JS/CSS/Images: long cache (1 year)
aws s3 sync app/ "s3://${SCRUMBLE_BUCKET}/" --exclude "*.html" --cache-control "max-age=31536000" --exclude ".DS_Store"

# Invalidate CloudFront (if distribution ID is set)
if [[ -n "${SCRUMBLE_CF_DISTRIBUTION_ID}" ]]; then
  echo "→ Invalidating CloudFront..."
  aws cloudfront create-invalidation --distribution-id "$SCRUMBLE_CF_DISTRIBUTION_ID" --paths "/*" --query 'Invalidation.Id' --output text
else
  echo "⚠ Skipping CloudFront invalidation (set SCRUMBLE_CF_DISTRIBUTION_ID)"
fi

echo ""
echo "✓ Backend: Check AWS Lambda console"
echo "✓ Frontend: https://scrumble.cc/"
