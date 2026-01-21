# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the static frontend (HTML/CSS/JS) served directly in the browser.
- `backend/` holds the AWS Lambda handler (`backend/app.py`) and Node wrapper (`backend/handler.js`).
- `docs/` stores product notes and backend setup details (start with `docs/BACKEND_SETUP.md`).
- `scripts/` contains utilities like the DynamoDB seeding script (`scripts/seed.py`).
- `template.yaml` and `samconfig.toml` define the AWS SAM infrastructure.

## Build, Test, and Development Commands
- `sam build` builds the Lambda package using SAM.
- `sam deploy --guided` deploys the stack and prompts for `AdminKey` and other settings.
- `python3 scripts/seed.py scrumble-data` seeds DynamoDB using `docs/seed-data.json`.
- Frontend runs as static files: open `app/index.html` in a browser. For admin UI, open `app/admin.html`.

## Coding Style & Naming Conventions
- JavaScript/CSS/HTML use 2-space indentation; Python uses 4 spaces.
- JavaScript uses semicolons and `const`/`let` (see `app/main.js`).
- CSS follows a light BEM-style modifier convention, e.g. `entry--has-preview`.
- Keep filenames lowercase (e.g. `admin.js`, `styles.css`).

## Testing Guidelines
- No automated tests are configured yet.
- Manual checks: load `app/index.html`, verify `/matchup` renders, submit a vote, and check admin endpoints with `x-admin-key` after deployment.

## Commit & Pull Request Guidelines
- Only one commit exists; no strict convention is established. Use short, imperative subjects (e.g., "Add matchup preview iframe").
- PRs should include a concise description, local testing steps, and screenshots for UI changes. Link relevant issues when available.

## Configuration & Security Tips
- Set the Function URL in `app/config.js` (`window.SCRUMBLE_API_BASE = "https://..."`).
- Keep `AdminKey` private; pass it via deploy prompts and use the `x-admin-key` header for `/admin/*` endpoints.
- Avoid committing secrets or environment-specific values to the repo.
