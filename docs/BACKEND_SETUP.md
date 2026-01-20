# Backend Setup

## Architecture
- **DynamoDB**: Single table design with pk/sk pattern
- **Lambda**: Python 3.11 with Function URL (no API Gateway)
- **CORS**: Open for MVP (restrict later)

## Deploy

```bash
sam build
sam deploy --guided
```

Follow prompts:
- Stack name: `scrumble`
- Region: `us-east-1` (or your choice)
- Confirm changes: `y`
- Allow Function URL: `y`
- Allow IAM role creation: `y`
- Save config: `y`
- AdminKey: set a strong value (used by `/admin/*` endpoints)

After deploy, copy the `FunctionUrl` from outputs.

## Seed Data

```bash
python3 scripts/seed.py scrumble-data
```

## Update Frontend

Edit `app/config.js`:
```js
window.SCRUMBLE_API_BASE = "https://YOUR_FUNCTION_URL_HERE";
```

Admin actions require the header `x-admin-key` with the `AdminKey` value.

## Table Schema

### Entries
```
pk: ENTRY
sk: {entry_id}
name, blurb, neighborhood, category, tag
```

### Matchups
```
pk: MATCHUP
sk: {matchup_id} or ACTIVE
id, title, left_entry_id, right_entry_id, category, active
```

### Votes
```
pk: VOTES#{matchup_id}
sk: TOTAL or V#{fingerprint}#{timestamp}
left, right (for TOTAL)
side, ts (for individual votes)
```

## API Endpoints

### GET /matchup
Returns active matchup with entries and vote counts

### POST /vote
Body: `{"matchup_id": "m001", "side": "left", "fingerprint": "..."}`
