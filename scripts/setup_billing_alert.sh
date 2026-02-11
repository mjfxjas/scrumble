#!/bin/bash
set -euo pipefail

# Setup CloudWatch billing alert for $5 threshold
# Run once: ./scripts/setup_billing_alert.sh YOUR_EMAIL@example.com

EMAIL="${1:-}"

if [[ -z "$EMAIL" ]]; then
  echo "Usage: ./scripts/setup_billing_alert.sh YOUR_EMAIL@example.com"
  exit 1
fi

echo "Setting up billing alert for $EMAIL..."

# Create SNS topic
TOPIC_ARN=$(aws sns create-topic --name scrumble-billing-alerts --query 'TopicArn' --output text)
echo "Created SNS topic: $TOPIC_ARN"

# Subscribe email
aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint "$EMAIL"
echo "Subscribed $EMAIL (check your email to confirm)"

# Create CloudWatch alarm
aws cloudwatch put-metric-alarm \
  --alarm-name scrumble-cost-alert \
  --alarm-description "Alert when AWS bill exceeds $5" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --dimensions Name=Currency,Value=USD

echo "✓ Billing alert created (threshold: $5)"
echo "✓ Confirm your email subscription to receive alerts"
