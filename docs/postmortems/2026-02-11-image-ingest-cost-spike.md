# Postmortem: Image Ingest Cost Spike

## Summary
An image enrichment workflow consumed paid Google Places photo API calls at a much higher rate than expected, causing approximately `$50` in unplanned spend.

## Impact
- Financial impact: unplanned cost increase.
- Operational impact: deployment confidence reduced until safeguards were added.

## Timeline (UTC)
- `2026-02-11 14:00` - Cost anomaly noticed.
- `2026-02-11 14:15` - Image enrichment script identified as primary source.
- `2026-02-11 14:40` - Script execution paused.
- `2026-02-11 15:00` - Guardrails planned (budget alerts, execution caps, cached assets).

## Root Cause
No hard cap or budget guardrail prevented repeated/large-scale paid image API calls during enrichment.

## Contributing Factors
- No pre-run cost estimate gate.
- No enforced per-run maximum API call count.
- Limited visibility into incremental API usage during script execution.

## What Went Well
- Cost issue was detected quickly.
- Workflow could be paused immediately.

## What Went Wrong
- Missing cost control defaults in enrichment scripts.
- Monitoring focused on runtime health more than third-party API spend controls.

## Action Items
1. Add a max-requests flag to image enrichment scripts with safe default.
2. Require explicit `--allow-paid-api` or equivalent opt-in for paid fetches.
3. Keep and reuse local image cache/manifests by default.
4. Enforce AWS billing alerts and monthly budget alarms.
5. Add pre-flight estimate output before any batch image job.

## Prevention Status
- Billing alarm helper exists in `scripts/setup_billing_alert.sh`.
- CI/CD now defaults to manual deploy and optional monitoring, minimizing unattended spend risk.
