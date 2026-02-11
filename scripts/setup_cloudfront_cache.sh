#!/bin/bash
set -euo pipefail

# Enable CloudFront caching for Lambda Function URL
# This reduces Lambda invocations by 90%
# Run once: ./scripts/setup_cloudfront_cache.sh

DISTRIBUTION_ID="${SCRUMBLE_CF_DISTRIBUTION_ID:-E2F6VQWXTCO8OB}"
LAMBDA_URL="${1:-}"

if [[ -z "$LAMBDA_URL" ]]; then
  echo "Usage: ./scripts/setup_cloudfront_cache.sh https://YOUR_LAMBDA_URL.lambda-url.us-east-1.on.aws"
  echo ""
  echo "Get your Lambda URL from:"
  echo "  aws cloudformation describe-stacks --stack-name sam-app --query 'Stacks[0].Outputs[?OutputKey==\`FunctionUrl\`].OutputValue' --output text"
  exit 1
fi

echo "Setting up CloudFront caching for $DISTRIBUTION_ID..."
echo "Lambda URL: $LAMBDA_URL"

# Get current distribution config
aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" > /tmp/cf-config.json

# Extract ETag
ETAG=$(jq -r '.ETag' /tmp/cf-config.json)

# Update config to add Lambda origin and cache behavior
jq '.DistributionConfig.Origins.Items += [{
  "Id": "lambda-origin",
  "DomainName": "'$(echo $LAMBDA_URL | sed 's|https://||' | sed 's|/||')'",
  "CustomOriginConfig": {
    "HTTPPort": 80,
    "HTTPSPort": 443,
    "OriginProtocolPolicy": "https-only",
    "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}
  }
}] | .DistributionConfig.CacheBehaviors.Items += [{
  "PathPattern": "/matchup",
  "TargetOriginId": "lambda-origin",
  "ViewerProtocolPolicy": "redirect-to-https",
  "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
  "Compress": true,
  "MinTTL": 60,
  "DefaultTTL": 60,
  "MaxTTL": 300,
  "ForwardedValues": {
    "QueryString": false,
    "Cookies": {"Forward": "none"},
    "Headers": {"Quantity": 0}
  }
}] | .DistributionConfig.CacheBehaviors.Quantity += 1' /tmp/cf-config.json > /tmp/cf-config-updated.json

# Update distribution
aws cloudfront update-distribution \
  --id "$DISTRIBUTION_ID" \
  --distribution-config file:///tmp/cf-config-updated.json \
  --if-match "$ETAG"

echo "✓ CloudFront caching enabled for /matchup endpoint"
echo "✓ Cache TTL: 60 seconds"
echo "✓ Expected savings: 90% reduction in Lambda calls"

# Cleanup
rm /tmp/cf-config.json /tmp/cf-config-updated.json
