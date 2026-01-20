# Data Model

## matchup
- id
- title
- left_entry_id
- right_entry_id
- category
- city
- active
- start_at
- end_at

## entry
- id
- name
- short_blurb
- neighborhood
- tagline (optional)
- url
- photo_url

## vote
- id
- matchup_id
- entry_id
- created_at
- source (web)
- fingerprint (ip/session hash)

## derived metrics
- total_votes
- left_votes
- right_votes
- left_pct
- right_pct

## MVP DynamoDB shape
- Table key: `matchup_id`
- Store the active matchup as `matchup_id = active`
- Embed `left` and `right` entries directly in the matchup item
