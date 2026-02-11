#!/bin/bash
set -euo pipefail

# Setup S3 lifecycle policy to delete old emails after 30 days
# Run once: ./scripts/setup_s3_lifecycle.sh

BUCKET="scrumble-ses-emails"

echo "Setting up S3 lifecycle policy for $BUCKET..."

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{
    "Id": "DeleteOldEmails",
    "Status": "Enabled",
    "Prefix": "emails/",
    "Expiration": {"Days": 30}
  }]
}'

echo "✓ S3 lifecycle policy created"
echo "✓ Emails older than 30 days will be automatically deleted"
