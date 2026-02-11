# Scrumble Incident Response Runbook

## Purpose
Provide a fast, repeatable process for handling production incidents affecting Scrumble APIs or site availability.

## Severity Levels
- `SEV-1`: Site unavailable or data corruption risk.
- `SEV-2`: Core feature degraded (voting/submission failing for many users).
- `SEV-3`: Partial degradation or non-critical admin issue.

## First 10 Minutes
1. Confirm impact quickly:
   - Check `https://scrumble.cc` and API health (`/matchup`, `/history`).
2. Identify current alerts:
   - CloudWatch alarms: `scrumble-lambda-errors`, `scrumble-lambda-p95-duration-high`, `scrumble-lambda-throttles`.
3. Triage with logs/metrics:
   - Lambda logs: `sam-app-ScrumbleFunction-*` log group.
   - Dashboard: `scrumble-ops`.
4. Stabilize first:
   - If error spike is caused by release, roll back to last known-good deployment.
   - If load spike, temporarily reduce blast radius (disable noisy clients, tighten caching, rate-limit abusive sources).

## Communication Template
- Incident start (UTC):
- Severity:
- Customer impact:
- Current status:
- Next update time:

## Containment Checklist
- [ ] Incident commander assigned.
- [ ] Customer impact verified and documented.
- [ ] Mitigation applied.
- [ ] Error rate and latency returning to baseline.

## Recovery Checklist
- [ ] End-to-end checks pass (`/matchup`, `/vote`, `/submit`, `/history`).
- [ ] Alarm state returns to `OK`.
- [ ] Metrics stable for 30 minutes.

## Post-Incident Requirements
- Create postmortem in `docs/postmortems/` within 24 hours.
- Include root cause, contributing factors, timeline, and action items.
- Link action items to concrete tasks and owners.
