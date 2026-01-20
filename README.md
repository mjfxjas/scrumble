# Scrumble (Scenic City Rumble)

A lightweight, curated head-to-head app for local spots. Two entries, one pick. Simple, fast, fun.

## What this is
- A static MVP template for the "Scenic City Rumble" concept
- A starter doc set to guide content, scope, and data

## Repo layout
- `app/` static site template
- `backend/` Lambda handler
- `docs/` product notes and MVP scope
- `template.yaml` AWS SAM template

## Run locally
Open `app/index.html` in a browser.

## Backend (AWS native)
This repo includes a Lambda + DynamoDB + Function URL backend. See `docs/BACKEND_SETUP.md`.

Quick setup:
1) `sam build && sam deploy --guided`
2) Set the Function URL in `app/config.js`
3) Seed the DynamoDB table with `python3 scripts/seed.py scrumble-data`

## Next steps
- Add moderation and abuse controls
