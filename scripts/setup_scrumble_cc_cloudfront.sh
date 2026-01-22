#!/bin/bash
set -euo pipefail

CERT_ARN="arn:aws:acm:us-east-1:147795258921:certificate/4da72546-ba39-44f0-a28e-fe9271c33354"
HOSTED_ZONE_ID="Z03286231KV4SPOYN6UF"
OAC_ID="E2LNP5TVUGQGYF"
BUCKET_NAME="scrumble.cc"
CF_ZONE_ID="Z2FDTNDATAQYW2"

cert_status=$(aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn "$CERT_ARN" \
  --query 'Certificate.Status' \
  --output text)

if [[ "$cert_status" != "ISSUED" ]]; then
  echo "ACM cert not issued yet: $cert_status"
  echo "Update Namecheap nameservers to Route53 first, then retry."
  exit 1
fi

tmp_config=$(mktemp)
cat > "$tmp_config" <<JSON
{
  "CallerReference": "scrumble-cc-$(date +%s)",
  "Comment": "scrumble.cc",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "scrumble-s3-origin",
        "DomainName": "scrumble.cc.s3.amazonaws.com",
        "OriginAccessControlId": "$OAC_ID",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultRootObject": "index.html",
  "Aliases": {
    "Quantity": 2,
    "Items": [
      "scrumble.cc",
      "www.scrumble.cc"
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "scrumble-s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": [
        "GET",
        "HEAD"
      ],
      "CachedMethods": {
        "Quantity": 2,
        "Items": [
          "GET",
          "HEAD"
        ]
      }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "HttpVersion": "http2",
  "PriceClass": "PriceClass_100"
}
JSON

dist_json=$(aws cloudfront create-distribution --distribution-config "file://$tmp_config")
rm -f "$tmp_config"

dist_id=$(python - <<'PY' "$dist_json"
import json
import sys
data = json.loads(sys.argv[1])
print(data["Distribution"]["Id"])
PY
)

dist_domain=$(python - <<'PY' "$dist_json"
import json
import sys
data = json.loads(sys.argv[1])
print(data["Distribution"]["DomainName"])
PY
)

account_id=$(aws sts get-caller-identity --query Account --output text)

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"AllowCloudFrontServicePrincipalReadOnly\",
      \"Effect\": \"Allow\",
      \"Principal\": {\"Service\": \"cloudfront.amazonaws.com\"},
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::$BUCKET_NAME/*\",
      \"Condition\": {\"StringEquals\": {\"AWS:SourceArn\": \"arn:aws:cloudfront::$account_id:distribution/$dist_id\"}}
    }
  ]
}"

aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch "{
  \"Comment\": \"Alias scrumble.cc to CloudFront\",
  \"Changes\": [
    {
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"scrumble.cc.\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$CF_ZONE_ID\",
          \"DNSName\": \"${dist_domain}.\",
          \"EvaluateTargetHealth\": false
        }
      }
    },
    {
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"scrumble.cc.\",
        \"Type\": \"AAAA\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$CF_ZONE_ID\",
          \"DNSName\": \"${dist_domain}.\",
          \"EvaluateTargetHealth\": false
        }
      }
    },
    {
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"www.scrumble.cc.\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$CF_ZONE_ID\",
          \"DNSName\": \"${dist_domain}.\",
          \"EvaluateTargetHealth\": false
        }
      }
    },
    {
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"www.scrumble.cc.\",
        \"Type\": \"AAAA\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$CF_ZONE_ID\",
          \"DNSName\": \"${dist_domain}.\",
          \"EvaluateTargetHealth\": false
        }
      }
    }
  ]
}"

echo "CloudFront distribution created:"
echo "  ID: $dist_id"
echo "  Domain: $dist_domain"
echo "Set env var for deploys:"
echo "  export SCRUMBLE_CF_DISTRIBUTION_ID=$dist_id"
