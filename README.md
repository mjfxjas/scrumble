# Scrumble - Scenic City Rumble

Daily head-to-head voting for Chattanooga locals. Two options enter, you pick the winner.

## Live Site
**https://scrumble.cc**

## Project Structure

```
scrumble/
├── app/                    # Frontend (static HTML/CSS/JS)
│   ├── index.html         # Main voting page
│   ├── submit.html        # User submission form
│   ├── history.html       # Past matchups list
│   ├── admin.html         # Legacy redirect to /admin
│   ├── admin/             # Admin login + panel shell
│   ├── about.html         # About page
│   ├── jobs.html          # Jobs/hiring page
│   ├── main.js            # Voting logic, API calls
│   ├── admin.js           # Admin panel logic
│   ├── config.js          # API base + preview overrides
│   ├── styles.css         # Main styles + navbar
│   ├── admin.css          # Admin panel styles
│   └── public/            # Images (mayor photos)
├── backend/               # AWS Lambda Function URL
│   ├── app.py            # Python Lambda handler
│   └── handler.js        # Legacy Node handler (unused)
├── docs/                  # Product documentation
│   ├── seed-data.json    # Initial matchup data
│   └── *.md              # Vision, data model, setup docs
├── scripts/
│   ├── seed.py           # DynamoDB seeding script
│   └── setup_scrumble_cc_cloudfront.sh # CloudFront + Route53 setup
├── template.yaml          # AWS SAM infrastructure
└── autodeploy.sh         # One-command deployment
```

## Requirements

- Python 3.x (Lambda handler + seed script)
- AWS SAM CLI (build/deploy)
- AWS CLI (S3 sync + CloudFront invalidation)


## Quick Start

### Deploy with SAM (CloudFormation)
```bash
./autodeploy.sh
```

### Deploy with Terraform
```bash
cd terraform
terraform init
terraform apply -var-file="environments/prod/terraform.tfvars" -var="admin_key=$ADMIN_KEY"
```

See `terraform/README.md` for detailed Terraform usage.

This will:
1. Build and deploy Lambda backend (SAM)
2. Sync frontend to S3
3. Invalidate CloudFront cache (if configured)

### Seed Database
```bash
python3 scripts/seed.py scrumble-data
```

### Local Development
- Open `app/index.html` in browser for frontend
- Set API URL in `app/config.js` (`window.SCRUMBLE_API_BASE`)
- Admin panel: `app/admin/index.html` (or `https://scrumble.cc/admin`)
- History: `app/history.html`

## Features

### Voting
- Dynamic matchup rendering (any number of active matchups)
- Vote counts hidden until you vote (encourages engagement)
- Auto-scroll to next unvoted matchup
- Vote state persists in localStorage
- Countdown timers for each matchup

### Submissions
- Submission form with confirmation summary
- Optional email and matchup rationale

### Admin Panel
- Login-gated admin UI at `/admin`
- Card-based layout with real-time stats
- Inline editing for start/end times, cadence, and messages
- Quick extend buttons (+1d, +7d, +14d)
- Reset votes with confirmation
- View user submissions

### Navigation
- Responsive navbar with hamburger menu
- Pages: Vote, Submit, History, About, Jobs

## Tech Stack

**Frontend:** Vanilla JS, CSS (dark theme with gold accents)
**Backend:** Python 3.12, AWS Lambda Function URL (no API Gateway)
**Database:** DynamoDB
**Deployment:** AWS SAM, S3, CloudFront
**Infrastructure as Code:** Terraform (see `terraform/` directory)
**CDN:** CloudFront (Distribution: E2F6VQWXTCO8OB)

## API Endpoints

### Public
- `GET /matchup` - Get active matchups
- `POST /vote` - Cast a vote
- `GET /history` - Get past matchups
- `POST /submit` - Submit matchup suggestion

### Admin (requires x-admin-key header)
- `POST /admin/login` - Validate admin key
- `GET /admin/matchups` - List active matchups (ignores time window)
- `GET /admin/submissions` - List submissions
- `PATCH /admin/matchup/:id` - Update matchup (starts_at, ends_at, cadence, message, active)
- `POST /admin/matchup/:id/reset-votes` - Reset votes to 0
- `POST /admin/activate` - Activate a matchup
- `POST /admin/matchup` - Create new matchup

## Configuration

**S3 Bucket:** scrumble.cc
**CloudFront:** E2F6VQWXTCO8OB
**DynamoDB Table:** scrumble-data
**Admin Key:** Set via SAM deploy prompts; admin UI stores it in sessionStorage
**CloudFront Invalidation:** set `SCRUMBLE_CF_DISTRIBUTION_ID` for `./autodeploy.sh`

## Environment Variables

- `SCRUMBLE_BUCKET` (default: `scrumble.cc`) for `./autodeploy.sh`
- `SCRUMBLE_CF_DISTRIBUTION_ID` (default: `E2F6VQWXTCO8OB`) for `./autodeploy.sh`

## CI/CD (Low Cost)

### Continuous Integration
- Workflow: `.github/workflows/ci.yml`
- Runs on PRs and pushes to `main`
- Performs:
  - Python compile checks (`backend/`, `scripts/`, `list_all_data.py`)
  - SAM template validation (`sam validate`)
  - Deploy script executable checks

### Continuous Delivery
- Workflow: `.github/workflows/deploy.yml`
- Trigger: manual only (`workflow_dispatch`)
- Default: no frontend deploy and ops monitoring disabled
- This prevents unattended deploys and surprise AWS spend.

Required GitHub secrets for deploy:
- `AWS_DEPLOY_ROLE_ARN` (OIDC role for GitHub Actions)
- `ADMIN_KEY` (SAM parameter)

Optional deploy secrets:
- `SCRUMBLE_BUCKET` (required only when `deploy_frontend=true`)
- `SCRUMBLE_CF_DISTRIBUTION_ID` (optional invalidation)
- `OPS_ALARM_EMAIL` (optional SNS email subscription)

## Ops Monitoring (Optional)

Monitoring resources are defined in `template.yaml` and are **disabled by default** with:
- `EnableOpsMonitoring=false`

When enabled, stack creates:
- SNS topic: `scrumble-ops-alerts`
- CloudWatch alarms:
  - `scrumble-lambda-errors`
  - `scrumble-lambda-p95-duration-high`
  - `scrumble-lambda-throttles`
- CloudWatch dashboard: `scrumble-ops`

To enable manually:
```bash
sam deploy --parameter-overrides AdminKey=... EnableOpsMonitoring=true OpsAlarmEmail=you@example.com
```

## Operations Artifacts

- Incident response runbook: `runbooks/incident-response.md`
- High error rate runbook: `runbooks/high-error-rate.md`
- Sample postmortem: `docs/postmortems/2026-02-11-image-ingest-cost-spike.md`
- Ansible config-management artifact: `ops/ansible/`

## Development Notes

- Vote boosting: Base 150 + time-based variance for demo
- Fingerprinting via localStorage for vote tracking
- Mayor matchup has red/white/blue patriotic theme
- EVA theme easter egg (NERV MODE button) - anime styling
- Preview overrides live in `app/config.js` (`window.SCRUMBLE_PREVIEW_OVERRIDES`)
