#!/usr/bin/env python3
"""
Image Enrichment Script for Scrumble Entries

Fetches images from Google Places API and optionally stores them in S3.

Usage:
    python scripts/enrich_images.py --dry-run              # Preview only
    python scripts/enrich_images.py                        # Update DynamoDB with Google URLs
    python scripts/enrich_images.py --download-to-s3       # Download and store in S3
    python scripts/enrich_images.py --force                # Re-fetch even if image exists

Requirements:
    pip install boto3 requests pillow
    
Environment Variables:
    GOOGLE_PLACES_API_KEY - Your Google Places API key
    TABLE_NAME - DynamoDB table name (default: scrumble-data)
    S3_BUCKET - S3 bucket for images (optional, for --download-to-s3)
"""

import os
import sys
import argparse
import time
import requests
from io import BytesIO
from PIL import Image
import boto3

# Configuration
LOCATION = "Chattanooga, TN"
IMAGE_SIZE = 800  # Max width/height for Google Places photos
S3_IMAGE_SIZE = (400, 400)  # Resize to consistent dimensions

def get_dynamodb_table():
    """Get DynamoDB table"""
    dynamodb = boto3.resource('dynamodb')
    table_name = os.environ.get('TABLE_NAME', 'scrumble-data')
    return dynamodb.Table(table_name)

def get_s3_client():
    """Get S3 client"""
    return boto3.client('s3')

def fetch_entries(table, force=False):
    """Fetch all entries that need images"""
    if force:
        # Get all entries
        resp = table.query(
            KeyConditionExpression='pk = :pk',
            ExpressionAttributeValues={':pk': 'ENTRY'}
        )
    else:
        # Only entries without images
        resp = table.scan(
            FilterExpression='pk = :pk AND (attribute_not_exists(image_url) OR image_url = :empty)',
            ExpressionAttributeValues={':pk': 'ENTRY', ':empty': ''}
        )
    
    return resp.get('Items', [])

def search_google_places(api_key, name, category=''):
    """Search Google Places for a business/location using new API"""
    query = f"{name} {LOCATION}"
    
    try:
        # Use Text Search (New)
        url = "https://places.googleapis.com/v1/places:searchText"
        headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': api_key,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.photos'
        }
        data = {
            'textQuery': query
        }
        
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        result = response.json()
        
        if not result.get('places'):
            print(f"  ⚠️  No results found")
            return None
        
        place = result['places'][0]
        
        if not place.get('photos'):
            print(f"  ⚠️  No photos available")
            return None
        
        # Get first photo name
        photo_name = place['photos'][0]['name']
        
        return {
            'photo_name': photo_name,
            'address': place.get('formattedAddress', ''),
            'website': place.get('websiteUri', ''),
            'rating': place.get('rating')
        }
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return None

def get_google_photo_url(api_key, photo_name, max_width=IMAGE_SIZE):
    """Construct Google Places photo URL using new API"""
    # Extract resource name from photo_name (format: places/{place_id}/photos/{photo_id})
    return f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx={max_width}&key={api_key}"

def download_and_resize_image(url):
    """Download image and resize to consistent dimensions"""
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    
    # Open and resize image
    img = Image.open(BytesIO(response.content))
    
    # Convert to RGB if necessary (handles RGBA, etc)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Resize maintaining aspect ratio, then crop to square
    img.thumbnail(S3_IMAGE_SIZE, Image.Resampling.LANCZOS)
    
    # Create square image with padding if needed
    new_img = Image.new('RGB', S3_IMAGE_SIZE, (255, 255, 255))
    offset = ((S3_IMAGE_SIZE[0] - img.size[0]) // 2, (S3_IMAGE_SIZE[1] - img.size[1]) // 2)
    new_img.paste(img, offset)
    
    # Convert to bytes
    buffer = BytesIO()
    new_img.save(buffer, format='JPEG', quality=85, optimize=True)
    buffer.seek(0)
    
    return buffer

def upload_to_s3(s3_client, bucket, entry_id, image_data):
    """Upload image to S3"""
    key = f"entries/{entry_id}.jpg"
    
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=image_data,
        ContentType='image/jpeg',
        CacheControl='max-age=31536000',
        ACL='public-read'
    )
    
    return f"https://{bucket}.s3.amazonaws.com/{key}"

def update_entry(table, entry_id, image_url, place_data, dry_run=False):
    """Update DynamoDB entry with image and metadata"""
    if dry_run:
        print(f"  [DRY RUN] Would update with: {image_url}")
        return
    
    update_expr = 'SET image_url = :url'
    expr_values = {':url': image_url}
    expr_names = {}
    
    if place_data.get('address'):
        update_expr += ', address = :addr'
        expr_values[':addr'] = place_data['address']
    
    if place_data.get('website'):
        update_expr += ', #url = :web'
        expr_values[':web'] = place_data['website']
        expr_names['#url'] = 'url'
    
    update_params = {
        'Key': {'pk': 'ENTRY', 'sk': entry_id},
        'UpdateExpression': update_expr,
        'ExpressionAttributeValues': expr_values
    }
    
    if expr_names:
        update_params['ExpressionAttributeNames'] = expr_names
    
    table.update_item(**update_params)

def main():
    parser = argparse.ArgumentParser(description='Enrich Scrumble entries with images')
    parser.add_argument('--dry-run', action='store_true', help='Preview without making changes')
    parser.add_argument('--force', action='store_true', help='Re-fetch images even if they exist')
    parser.add_argument('--download-to-s3', action='store_true', help='Download and store in S3')
    parser.add_argument('--limit', type=int, help='Limit number of entries to process')
    args = parser.parse_args()
    
    # Check for API key
    api_key = os.environ.get('GOOGLE_PLACES_API_KEY')
    if not api_key:
        print("❌ Error: GOOGLE_PLACES_API_KEY environment variable not set")
        print("\nGet your API key from: https://console.cloud.google.com/apis/credentials")
        print("Then run: export GOOGLE_PLACES_API_KEY='your-key-here'")
        sys.exit(1)
    
    # Check for S3 bucket if needed
    if args.download_to_s3:
        s3_bucket = os.environ.get('S3_BUCKET')
        if not s3_bucket:
            print("❌ Error: S3_BUCKET environment variable not set")
            sys.exit(1)
        s3_client = get_s3_client()
    else:
        s3_bucket = None
        s3_client = None
    
    # Initialize clients
    table = get_dynamodb_table()
    
    # Fetch entries
    print(f"🔍 Fetching entries from DynamoDB...")
    entries = fetch_entries(table, force=args.force)
    
    if args.limit:
        entries = entries[:args.limit]
    
    print(f"📋 Found {len(entries)} entries to process")
    
    if args.dry_run:
        print("🔍 DRY RUN MODE - No changes will be made\n")
    
    # Process each entry
    success_count = 0
    skip_count = 0
    error_count = 0
    
    for i, entry in enumerate(entries, 1):
        entry_id = entry['sk']
        name = entry.get('name', entry_id)
        category = entry.get('category', '')
        
        print(f"\n[{i}/{len(entries)}] {name}")
        
        # Search Google Places
        place_data = search_google_places(api_key, name, category)
        
        if not place_data:
            error_count += 1
            continue
        
        # Get image URL
        if args.download_to_s3:
            # Download and upload to S3
            try:
                google_url = get_google_photo_url(api_key, place_data['photo_name'])
                print(f"  📥 Downloading image...")
                image_data = download_and_resize_image(google_url)
                
                if not args.dry_run:
                    print(f"  ☁️  Uploading to S3...")
                    image_url = upload_to_s3(s3_client, s3_bucket, entry_id, image_data)
                else:
                    image_url = f"https://{s3_bucket}.s3.amazonaws.com/entries/{entry_id}.jpg"
                
                print(f"  ✅ S3 URL: {image_url}")
            except Exception as e:
                print(f"  ❌ S3 upload failed: {e}")
                error_count += 1
                continue
        else:
            # Use Google Places photo URL directly
            image_url = get_google_photo_url(api_key, place_data['photo_name'])
            print(f"  ✅ Google URL: {image_url}")
        
        # Update DynamoDB
        update_entry(table, entry_id, image_url, place_data, dry_run=args.dry_run)
        success_count += 1
        
        # Rate limiting (Google Places has limits)
        if not args.dry_run and i < len(entries):
            time.sleep(0.1)  # Small delay between requests
    
    # Summary
    print(f"\n{'='*60}")
    print(f"✅ Success: {success_count}")
    print(f"⚠️  Skipped: {skip_count}")
    print(f"❌ Errors: {error_count}")
    print(f"{'='*60}")
    
    if args.dry_run:
        print("\n💡 Run without --dry-run to apply changes")
    
    # Cost estimate
    if success_count > 0 and not args.dry_run:
        places_cost = success_count * 0.032  # Places search
        details_cost = success_count * 0.017  # Place details
        total_cost = places_cost + details_cost
        print(f"\n💰 Estimated Google API cost: ${total_cost:.2f}")

if __name__ == '__main__':
    main()
