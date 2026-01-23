# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the static frontend (HTML/CSS/JS) served directly in the browser.
  - `index.html` - Main voting page with dynamic matchup rendering
  - `submit.html` - User submission form for new matchup suggestions
  - `history.html` - Past matchup results list
  - `admin.html` - Legacy redirect to `/admin`
  - `admin/` - Admin login + panel shell (served at `/admin`)
  - `admin.js` - Admin logic: login gate, update matchups, reset votes, view submissions
  - `admin.css` - Modern dark theme styling for admin panel
  - `about.html` - About page (placeholder)
  - `jobs.html` - Jobs/hiring page with copywriter and developer positions
  - `main.js` - Frontend voting logic, API calls, and rendering
  - `styles.css` - Main styling with dark theme, navbar, and optional EVA theme
  - `config.js` - API endpoint configuration and preview overrides
  - `public/` - Static assets (mayor photos: berk.avif, bob_corker.avif)
- `backend/` holds the AWS Lambda handler (`backend/app.py`) and legacy Node wrapper (`backend/handler.js`).
  - Endpoints: `/matchup`, `/vote`, `/history`, `/submit`, `/admin/login`, `/admin/matchups`, `/admin/*`
  - Vote boosting: Base 150 + time-based variance for demo purposes
  - Admin endpoints: login, list matchups, PATCH matchup, reset votes, view submissions, activate, create
- `docs/` stores product notes and backend setup details (start with `docs/BACKEND_SETUP.md`).
  - `seed-data.json` - Initial matchup and entry data with URLs, addresses, end times
- `scripts/` contains utilities like the DynamoDB seeding script (`scripts/seed.py`).
  - `setup_scrumble_cc_cloudfront.sh` - CloudFront + Route53 setup helper
- `template.yaml` and `samconfig.toml` define the AWS SAM infrastructure.
- `autodeploy.sh` - One-command deployment script (SAM build/deploy + S3 sync + CloudFront invalidation)

## Build, Test, and Development Commands
- `sam build` builds the Lambda package using SAM.
- `sam deploy --guided` deploys the stack and prompts for `AdminKey` and other settings.
- `python3 scripts/seed.py scrumble-data` seeds DynamoDB using `docs/seed-data.json`.
- Frontend runs as static files: open `app/index.html` in a browser. For admin UI, open `app/admin.html`.
- Frontend runs as static files: open `app/index.html` in a browser. For admin UI, open `app/admin/index.html` (or `https://scrumble.cc/admin`).
- **`./autodeploy.sh`** - Auto-deploy script to sync and publish to production (S3 + CloudFront invalidation)
- `SCRUMBLE_CF_DISTRIBUTION_ID` and `SCRUMBLE_BUCKET` override the defaults in `autodeploy.sh`

## Coding Style & Naming Conventions
- JavaScript/CSS/HTML use 2-space indentation; Python uses 4 spaces.
- JavaScript uses semicolons and `const`/`let` (see `app/main.js`).
- CSS follows a light BEM-style modifier convention, e.g. `entry--has-preview`, `matchup-card--mayor`.
- Keep filenames lowercase (e.g. `admin.js`, `styles.css`).
- Recent UI changes: Dark theme with gold accents, diagonal matchup layout, animated hero title
- Vote display shows counts and percentages; backend adds artificial boost for demo
- Navbar: Responsive with hamburger menu, links to Vote/Submit/History/About/Jobs

## Testing Guidelines
- No automated tests are configured yet.
- Manual checks: 
  - Load `app/index.html`, verify matchups render with vote counts
  - Submit votes for multiple matchups
  - Test submission form at `app/submit.html`
  - Confirm submission success state + "Submit Another" reset
  - Check admin endpoints with `x-admin-key` header after deployment
  - Verify vote percentages update correctly after voting
  - Test admin login at `/admin` and inline editing/quick actions
  - Load `app/history.html` and confirm history list renders

## Configuration & Security Tips
- Set the Function URL in `app/config.js` (`window.SCRUMBLE_API_BASE = "https://..."`).
- Keep `AdminKey` private; pass it via deploy prompts and use the `x-admin-key` header for `/admin/*` endpoints.
- `Authorization: Bearer <AdminKey>` is also accepted by the backend.
- Admin UI stores the key in sessionStorage (login required per browser session).
- Avoid committing secrets or environment-specific values to the repo.
- Fingerprinting uses localStorage (`scrumble-fp`) to track votes per device
- User submissions stored in DynamoDB with `SUBMISSION` partition key

## Recent Changes (Latest Session - 2025-01-23)
- **Email Forwarding:**
  - SES configured for hello@scrumble.cc → jon@theatrico.org
  - Domain verified, MX records added
  - Lambda forwarder function deployed
  - S3 bucket for email storage
- **Custom Comment System:**
  - DynamoDB table: scrumble-comments
  - GET /comments, POST /comment, DELETE /comment endpoints
  - Expandable comment sections on matchup cards
  - Comment counts displayed before expanding
  - Seed comments feature (20 pre-written templates)
  - Admin-only delete with stored session key
  - 500 char limit, 50 char name limit
  - Zero third-party branding
- **Admin Mode Overlay:**
  - "Admin" button in navbar (prompts for key)
  - Session-based auth (stored in sessionStorage)
  - Admin controls on each matchup card:
    - Edit (ends_at, message)
    - Reset Votes
    - Seed Comments (1-10 random comments)
    - Activate/Deactivate
    - Delete
  - Comment delete buttons only visible in admin mode
  - Removed local "Edit" panel (replaced with admin overlay)
- **Admin Dashboard Redesign:**
  - New `/admin/` page with stats cards
  - Total Visits, Real Visits, Active/Total matchup counts
  - Split view: Active Matchups / Inactive Matchups
  - Schedule button for each matchup (set starts_at/ends_at)
  - Activate/Deactivate buttons
  - Shows scheduled dates on matchup cards
- **UI Improvements:**
  - Rotating poster backgrounds on hero (disabled due to 403 errors)
  - Random poster on page load
  - Fighter background images at 75% opacity (100% when selected, 25% when not)
  - Removed "Local" tag filter (all entries are local)
  - Vote counts/percentages moved into button after voting
  - Increased scroll delay after voting (800ms → 1600ms)
  - Mobile: Side-by-side fighter layout, VS box hidden
  - Mobile: Navbar height increased (300px → 400px)
  - Favicon added (public/scrumble_favicon.ico)
  - "Art" link in navbar → posters.html
  - Info grid updated with Chattanooga aliases
  - "Bring the heat" links to submit page
- **Admin Panel Redesign:**
  - Card-based layout with real-time stats (votes, percentages)
  - Inline editing for end times and banner messages
  - Quick extend buttons: +1d, +7d, +14d
  - Reset votes button with confirmation dialog
  - Modern dark theme with gold accents
  - Backend endpoints: PATCH /admin/matchup/:id, POST /admin/matchup/:id/reset-votes
- **Navigation Menu:**
  - Added responsive navbar to all pages
  - Hamburger menu for mobile
  - Links: Vote, Submit, History, About, Jobs
- **New Pages:**
  - `about.html` - About page (placeholder)
  - `jobs.html` - Hiring page for copywriter and developer roles
- **Vote Hiding:** Counts/percentages show as `?` until user votes (encourages engagement)
- **Auto-scroll:** After voting, page scrolls to next unvoted matchup
- **Vote Persistence:** Vote state saved in localStorage, survives page refresh
- **Mayor Matchup:** Red/white/blue patriotic theme with gradient header
- **Countdown Timers:** Display time remaining for each matchup
- **Button Text:** Changed from "PICK" to "VOTE"
- **Fixed Issues:** Diagonal card clipping (60px padding), Corker image (renamed to .avif)
- **Submit Confirmation:** Success state shows a confirmation card with submission details
- **Admin Login:** `/admin` route with login gating and session-based auth
- **Cadence Scheduling:** `starts_at` + `cadence` fields in admin and seed data

## Deployment to scrumble.cc
- Accessible at `https://scrumble.cc`
- S3 bucket: `scrumble.cc`
- CloudFront Distribution: `E2F6VQWXTCO8OB`
- Deploy command: `./autodeploy.sh` (in project root)

## Repository Standards
- **IMPORTANT**: Every new repository should include an `autodeploy.sh` script as one of the first files created
- The autodeploy script should handle the complete deployment pipeline for that project
- Make it executable: `chmod +x autodeploy.sh`
- Script should continue on SAM deploy errors (use `|| echo` pattern)
