# Image Enrichment Script

Automatically fetch images from Google Places API and enrich your Scrumble entries.

## Setup

### 1. Get Google Places API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Places API** and **Places API (New)**
4. Go to **APIs & Services > Credentials**
5. Create API Key
6. (Optional) Restrict key to Places API only

### 2. Install Dependencies

```bash
cd scripts
pip install -r requirements.txt
```

### 3. Set Environment Variables

```bash
export GOOGLE_PLACES_API_KEY='your-api-key-here'
export TABLE_NAME='scrumble-data'  # Optional, defaults to scrumble-data

# Only needed if using --download-to-s3
export S3_BUCKET='your-bucket-name'
```

## Usage

### Preview (Dry Run)
See what would be updated without making changes:
```bash
python enrich_images.py --dry-run
```

### Update with Google URLs
Fetch images and store Google Places photo URLs in DynamoDB:
```bash
python enrich_images.py
```

### Download to S3
Download images and store in your own S3 bucket:
```bash
python enrich_images.py --download-to-s3
```

### Force Re-fetch
Re-fetch images even if entries already have them:
```bash
python enrich_images.py --force
```

### Limit Processing
Process only first N entries (useful for testing):
```bash
python enrich_images.py --limit 10
```

## Options

- `--dry-run` - Preview without making changes
- `--force` - Re-fetch images even if they exist
- `--download-to-s3` - Download and store in S3 (requires S3_BUCKET env var)
- `--limit N` - Process only first N entries

## Cost Estimate

Google Places API pricing (as of 2024):
- **Places Search**: $0.032 per request
- **Place Details**: $0.017 per request
- **Photos**: Free (just a URL)

**Total per entry**: ~$0.05

For 200 entries: ~$10

## What It Does

1. Scans DynamoDB for entries without images
2. Searches Google Places for each entry (name + "Chattanooga, TN")
3. Fetches place details including photos
4. Either:
   - Stores Google Places photo URL directly (default)
   - Downloads image, resizes to 400x400, uploads to S3 (with `--download-to-s3`)
5. Updates DynamoDB entry with:
   - `image_url` - Photo URL
   - `address` - Formatted address from Google
   - `url` - Website URL if available

## Example Output

```
🔍 Fetching entries from DynamoDB...
📋 Found 15 entries to process

[1/15] Velo Coffee
  ✅ Google URL: https://maps.googleapis.com/maps/api/place/photo?...
  
[2/15] Tremont Tavern
  ✅ Google URL: https://maps.googleapis.com/maps/api/place/photo?...

============================================================
✅ Success: 13
⚠️  Skipped: 0
❌ Errors: 2
============================================================

💰 Estimated Google API cost: $0.65
```

## Troubleshooting

### "No results found"
- Entry name might not match Google Places exactly
- Try adding more context to the search (edit script's LOCATION variable)
- Manually add image_url for these entries

### "No photos available"
- Some places don't have photos in Google Places
- Consider using Unsplash API as fallback for generic images

### Rate Limiting
- Script includes small delays between requests
- Google Places has generous limits (default: 1000 requests/day free tier)
- Increase delay if you hit rate limits

## S3 Setup (Optional)

If using `--download-to-s3`:

1. Create S3 bucket:
```bash
aws s3 mb s3://scrumble-images
```

2. Enable public read access (for images):
```bash
aws s3api put-bucket-policy --bucket scrumble-images --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::scrumble-images/*"
  }]
}'
```

3. Set environment variable:
```bash
export S3_BUCKET='scrumble-images'
```

## Alternatives

If you don't want to use Google Places:

1. **Yelp Fusion API** - Good for restaurants/businesses (5000 calls/day free)
2. **Unsplash API** - Free stock photos (good for generic concepts)
3. **Manual curation** - Best quality but time-consuming
