# Runbook: High Lambda Error Rate

## Trigger
CloudWatch alarm `scrumble-lambda-errors` enters `ALARM`.

## Likely Symptoms
- Voting requests fail (`POST /vote`).
- Submissions fail (`POST /submit`).
- API responses show elevated 5xx rates.

## Immediate Actions
1. Open CloudWatch dashboard `scrumble-ops` and confirm errors/latency/throttles trend.
2. Query recent Lambda logs for stack traces and correlation IDs.
3. Validate DynamoDB health and throttling metrics.
4. Check latest deploy history and recent config changes.

## Triage Commands
```bash
# Last 15 minutes of Lambda logs
aws logs tail /aws/lambda/sam-app-ScrumbleFunction-<suffix> --since 15m --follow

# Lambda built-in errors metric
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=<function-name> \
  --start-time "$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 300 \
  --statistics Sum
```

## Common Root Causes and Fixes
- Bad deploy/config mismatch:
  - Roll back to last known-good commit and redeploy.
- Invalid input path missed in validation:
  - Patch handler validation and deploy hotfix.
- Downstream AWS permission/config issue:
  - Validate IAM role permissions and resource names.

## Exit Criteria
- Error alarm returns to `OK`.
- API success rate is normal for 30 minutes.
- Root cause identified and documented.
