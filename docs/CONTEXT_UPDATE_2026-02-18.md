# Context Update — 2026-02-18

## What changed

### Live ops verification
- Verified production site: `https://scrumble.cc` (HTTP 200).
- Verified production API base:
  - `GET /future`
  - `GET /matchup`

### Future queue remediation
- Observed `/future` had dropped below guardrail (2 items).
- Added one new scheduled matchup through admin API:
  - `future-20260221-fiveguys-lupis-31`
- Post-change `/future` now returns 4 items:
  - `future-20260219-mellow-mainst-54`
  - `future-20260220-pizza-dom-89`
  - `future-20260221-fiveguys-bk-42`
  - `future-20260221-fiveguys-lupis-31`

### Access/runbook note
- AWS SSO re-auth was completed locally and used to inspect stack function config safely.
- Temporary remote contingency was set up via Tailscale userspace daemon + Tailscale SSH for away-from-home access.
- Follow-up: switch to proper Tailscale app/daemon install when local at Mac (for persistence + full routing).

## Current immediate priorities (virality/stickiness)
1. Implement streak system (daily streak + weekly streak saver).
2. Add direct challenge invites with deep links to specific matchup IDs.
3. Add instrumentation for invite funnel (`invite_sent`, `invite_accept`, `streak_continue`) and dashboard views for D1/D7 + share/invite conversion.
4. Define weekly live-ops calendar + quality rubric for matchup publishing.
