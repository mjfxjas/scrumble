import json
import os
import boto3
import uuid
import time
from datetime import datetime, timezone
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])
cloudwatch = boto3.client('cloudwatch')
ADMIN_KEY = os.environ.get('ADMIN_KEY', '').strip()

# Error codes
ERROR_CODES = {
    'VOTE_INVALID': 'Invalid vote parameters',
    'VOTE_ALREADY_CAST': 'Vote already cast for this matchup',
    'MATCHUP_NOT_FOUND': 'Matchup not found',
    'MATCHUP_NOT_ACTIVE': 'Matchup is not active',
    'MATCHUP_NOT_STARTED': 'Matchup has not started yet',
    'MATCHUP_ENDED': 'Matchup has ended',
    'MISSING_FIELD': 'Missing required field',
    'UNAUTHORIZED': 'Unauthorized access',
    'NOT_FOUND': 'Resource not found'
}

def log(level, message, **kwargs):
    """Structured JSON logging"""
    log_entry = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'level': level,
        'message': message,
        **kwargs
    }
    print(json.dumps(log_entry))

def put_metric(metric_name, value, unit='Count', dimensions=None):
    """Put custom CloudWatch metric"""
    try:
        metric_data = {
            'MetricName': metric_name,
            'Value': value,
            'Unit': unit,
            'Timestamp': datetime.now(timezone.utc)
        }
        if dimensions:
            metric_data['Dimensions'] = [{'Name': k, 'Value': v} for k, v in dimensions.items()]
        
        cloudwatch.put_metric_data(
            Namespace='Scrumble',
            MetricData=[metric_data]
        )
    except Exception as e:
        log('WARN', 'Failed to put metric', metric=metric_name, error=str(e))

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj)
    raise TypeError

def json_response(status_code, headers, body, cache_seconds=0, error_code=None):
    """Standardized API response wrapper"""
    response_headers = {**headers}
    if cache_seconds > 0:
        response_headers['Cache-Control'] = f'public, max-age={cache_seconds}, s-maxage={cache_seconds}'
    else:
        response_headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    
    # Wrap response in standard format
    if status_code >= 400:
        standardized = {
            'success': False,
            'error': body.get('error', 'Unknown error'),
            'error_code': error_code,
            'data': None
        }
    else:
        standardized = {
            'success': True,
            'data': body,
            'error': None,
            'error_code': None
        }
    
    return {'statusCode': status_code, 'headers': response_headers, 'body': json.dumps(standardized, default=decimal_default)}

def parse_iso8601(value):
    if not value:
        return None
    try:
        text = value.strip()
        if text.endswith('Z'):
            text = text[:-1] + '+00:00'
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

def get_header(event, name):
    headers = event.get('headers') or {}
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return None

def parse_body(event):
    try:
        return json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return {}

def validate_request(method, body, required_fields):
    if method == 'POST' and not body:
        return False, 'Request body required'
    for field in required_fields:
        if field not in body or not body[field]:
            return False, f'Missing required field: {field}'
    return True, None

def is_synthetic(event):
    value = get_header(event, 'x-scrumble-synthetic')
    if not value:
        return False
    value = value.strip().lower()
    return value not in ('0', 'false', 'no', 'off')

def require_admin(event, headers):
    if not ADMIN_KEY:
        return False, json_response(500, headers, {'error': 'Admin key not configured'})

    provided = get_header(event, 'x-admin-key') or get_header(event, 'authorization')
    if provided and provided.lower().startswith('bearer '):
        provided = provided[7:].strip()

    if not provided or provided != ADMIN_KEY:
        return False, json_response(403, headers, {'error': 'Forbidden'})

    return True, None

def handler(event, context):
    correlation_id = str(uuid.uuid4())
    path = event.get('rawPath', '/')
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    start_time = time.time()
    
    log('INFO', 'Request received', correlation_id=correlation_id, path=path, method=method)
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'X-Correlation-ID': correlation_id
    }
    
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    try:
        if path == '/matchup' and method == 'GET':
            return get_active_matchup(headers)
        elif path == '/history' and method == 'GET':
            return get_history(headers)
        elif path == '/future' and method == 'GET':
            return get_future_matchups(headers)
        elif path == '/vote' and method == 'POST':
            body = parse_body(event)
            valid, error = validate_request(method, body, ['matchup_id', 'side'])
            if not valid:
                return json_response(400, headers, {'error': error})
            return cast_vote(body, headers, is_synthetic(event))
        elif path == '/admin/login' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return json_response(200, headers, {'ok': True})
        elif path == '/admin/matchups' and method == 'GET':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return get_admin_matchups(headers)
        elif path == '/admin/activate' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            body = parse_body(event)
            return activate_matchup(body, headers)
        elif path == '/admin/matchup' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            body = parse_body(event)
            valid, error = validate_request(method, body, [])
            if not valid:
                return json_response(400, headers, {'error': error})
            return create_matchup(body, headers)
        elif path == '/submit' and method == 'POST':
            body = parse_body(event)
            valid, error = validate_request(method, body, ['left_name', 'right_name', 'category'])
            if not valid:
                return json_response(400, headers, {'error': error})
            return submit_matchup(body, headers)
        elif path == '/newsletter' and method == 'POST':
            body = parse_body(event)
            valid, error = validate_request(method, body, ['email'])
            if not valid:
                return json_response(400, headers, {'error': error})
            return subscribe_newsletter(body, headers)
        elif path == '/visit' and method == 'POST':
            body = parse_body(event)
            return record_visit(body, headers, is_synthetic(event))
        elif path == '/admin/submissions' and method == 'GET':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return get_submissions(headers)
        elif path == '/admin/visits' and method == 'GET':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return get_visits(headers)
        elif path == '/admin/entries' and method == 'GET':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return get_entries(headers)
        elif path.startswith('/admin/matchup/') and method == 'PATCH':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            matchup_id = path.split('/')[-1]
            body = parse_body(event)
            return update_matchup(matchup_id, body, headers)
        elif path.startswith('/admin/matchup/') and method == 'DELETE':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            matchup_id = path.split('/')[-1]
            return delete_matchup(matchup_id, headers)
        elif path.startswith('/admin/matchup/') and path.endswith('/reset-votes') and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            matchup_id = path.split('/')[-2]
            return reset_votes(matchup_id, headers)
        elif path.startswith('/admin/matchup/') and path.endswith('/clone') and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            matchup_id = path.split('/')[-2]
            return clone_matchup(matchup_id, headers)
        elif path.startswith('/admin/submission/') and method == 'PATCH':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            timestamp = path.split('/')[-1]
            body = parse_body(event)
            return update_submission(timestamp, body, headers)
        elif path == '/admin/bulk-activate' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            body = parse_body(event)
            return bulk_activate(body, headers)
        elif path == '/admin/bulk-deactivate' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            body = parse_body(event)
            return bulk_deactivate(body, headers)
        elif path == '/admin/archive-ended' and method == 'POST':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return archive_ended_matchups(headers)
        elif path == '/comments' and method == 'GET':
            matchup_id = event.get('queryStringParameters', {}).get('matchup_id')
            if not matchup_id:
                return json_response(400, headers, {'error': 'matchup_id required'})
            return get_comments(matchup_id, headers)
        elif path == '/comment' and method == 'POST':
            body = parse_body(event)
            valid, error = validate_request(method, body, ['matchup_id', 'author_name', 'comment_text'])
            if not valid:
                return json_response(400, headers, {'error': error})
            return post_comment(body, headers)
        elif path == '/comment/vote' and method == 'POST':
            body = parse_body(event)
            return vote_comment(body, headers)
        elif path == '/matchup/rate' and method == 'POST':
            body = parse_body(event)
            valid, error = validate_request(method, body, ['matchup_id', 'rating'])
            if not valid:
                return json_response(400, headers, {'error': error})
            return rate_matchup(body, headers)
        elif path.startswith('/comment/') and method == 'DELETE':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            parts = path.split('/')
            matchup_id = parts[2]
            timestamp = parts[3]
            return delete_comment(matchup_id, timestamp, headers)
        else:
            log('WARN', 'Route not found', correlation_id=correlation_id, path=path, method=method)
            put_metric('RouteNotFound', 1)
            return json_response(404, headers, {'error': 'Not found'})
    except Exception as e:
        log('ERROR', 'Request failed', correlation_id=correlation_id, error=str(e), path=path, method=method)
        put_metric('RequestError', 1, dimensions={'Path': path})
        return json_response(500, headers, {'error': str(e)})
    finally:
        latency = (time.time() - start_time) * 1000
        put_metric('RequestLatency', latency, unit='Milliseconds', dimensions={'Path': path})
        log('INFO', 'Request completed', correlation_id=correlation_id, latency_ms=latency)

def build_matchup_payload(matchup, entries_cache=None, votes_cache=None):
    """Build matchup payload with optional caching for batch operations"""
    if entries_cache:
        left = entries_cache.get(matchup['left_entry_id'])
        right = entries_cache.get(matchup['right_entry_id'])
    else:
        left = table.get_item(Key={'pk': 'ENTRY', 'sk': matchup['left_entry_id']})['Item']
        right = table.get_item(Key={'pk': 'ENTRY', 'sk': matchup['right_entry_id']})['Item']

    if votes_cache and matchup['id'] in votes_cache:
        votes = votes_cache[matchup['id']]
    else:
        vote_resp = table.get_item(Key={'pk': f"VOTES#{matchup['id']}", 'sk': 'TOTAL'})
        votes = vote_resp.get('Item', {'left': 0, 'right': 0})

    base_boost = 0

    return {
        'matchup': {
            'id': matchup['id'],
            'title': matchup['title'],
            'category': matchup['category'],
            'active': bool(matchup.get('active', False)),
            'cadence': matchup.get('cadence', ''),
            'starts_at': matchup.get('starts_at', ''),
            'ends_at': matchup.get('ends_at', ''),
            'message': matchup.get('message', '')
        },
        'left': {
            'id': left['id'],
            'name': left['name'],
            'blurb': left.get('blurb', ''),
            'neighborhood': left.get('neighborhood', ''),
            'tag': left.get('tag', 'Local'),
            'url': left.get('url', ''),
            'image_url': left.get('image_url', ''),
            'address': left.get('address', '')
        },
        'right': {
            'id': right['id'],
            'name': right['name'],
            'blurb': right.get('blurb', ''),
            'neighborhood': right.get('neighborhood', ''),
            'tag': right.get('tag', 'Local'),
            'url': right.get('url', ''),
            'image_url': right.get('image_url', ''),
            'address': right.get('address', '')
        },
        'votes': {
            'left': int(votes.get('left', 0)) + base_boost,
            'right': int(votes.get('right', 0)) + base_boost
        }
    }

def batch_get_items(keys):
    """Batch get items from DynamoDB"""
    if not keys:
        return {}
    
    client = boto3.client('dynamodb')
    table_name = os.environ['TABLE_NAME']
    
    # DynamoDB batch_get_item limit is 100 items
    results = {}
    for i in range(0, len(keys), 100):
        batch = keys[i:i+100]
        response = client.batch_get_item(
            RequestItems={
                table_name: {
                    'Keys': [{'pk': {'S': k['pk']}, 'sk': {'S': k['sk']}} for k in batch]
                }
            }
        )
        
        for item in response.get('Responses', {}).get(table_name, []):
            # Deserialize DynamoDB item
            from boto3.dynamodb.types import TypeDeserializer
            deserializer = TypeDeserializer()
            deserialized = {k: deserializer.deserialize(v) for k, v in item.items()}
            key = (deserialized['pk'], deserialized['sk'])
            results[key] = deserialized
    
    return results

def get_matchups(headers, apply_time_window=True):
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        FilterExpression='active = :active',
        ExpressionAttributeValues={':pk': 'MATCHUP', ':active': True}
    )

    now = datetime.now(timezone.utc)
    filtered_matchups = []
    for matchup in resp.get('Items', []):
        if matchup['sk'] == 'ACTIVE':
            continue
        if apply_time_window:
            starts_at = parse_iso8601(matchup.get('starts_at', ''))
            ends_at = parse_iso8601(matchup.get('ends_at', ''))
            if starts_at and now < starts_at:
                continue
            if ends_at and now > ends_at:
                continue
        filtered_matchups.append(matchup)

    # De-duplicate by entry pair to avoid showing accidental duplicate active matchups.
    # Keep the most specific/current item (prefer one with a start time, then latest start).
    def dedupe_rank(item):
        starts_at = parse_iso8601(item.get('starts_at', ''))
        has_start = 1 if starts_at else 0
        ts = starts_at.timestamp() if starts_at else 0
        return (has_start, ts, item.get('id', ''))

    deduped = {}
    for matchup in filtered_matchups:
        pair_key = tuple(sorted([matchup.get('left_entry_id', ''), matchup.get('right_entry_id', '')]))
        existing = deduped.get(pair_key)
        if not existing or dedupe_rank(matchup) >= dedupe_rank(existing):
            deduped[pair_key] = matchup

    matchups = [build_matchup_payload(m) for m in deduped.values()]

    log('INFO', 'Matchups retrieved', count=len(matchups), apply_time_window=apply_time_window)
    cache_seconds = 60 if apply_time_window else 0
    return json_response(200, headers, {'matchups': matchups}, cache_seconds=cache_seconds)

def get_active_matchup(headers):
    return get_matchups(headers, apply_time_window=True)

def get_admin_matchups(headers):
    return get_matchups(headers, apply_time_window=False)

def has_recent_vote(matchup_id, fingerprint, within_seconds=86400):
    vote_prefix = f"V#{fingerprint}#"
    resp = table.query(
        KeyConditionExpression='pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues={
            ':pk': f"VOTES#{matchup_id}",
            ':prefix': vote_prefix
        },
        ScanIndexForward=False,
        Limit=1
    )
    items = resp.get('Items', [])
    if not items:
        return False

    latest = items[0]
    ts_text = latest.get('ts') or latest.get('sk', '').replace(vote_prefix, '')
    vote_dt = parse_iso8601(ts_text)
    if not vote_dt:
        return True

    now = datetime.now(timezone.utc)
    return (now - vote_dt).total_seconds() < within_seconds


def cast_vote(body, headers, synthetic=False):
    matchup_id = body.get('matchup_id')
    side = body.get('side')
    fingerprint = body.get('fingerprint', 'anon')
    
    if not matchup_id or side not in ['left', 'right']:
        return json_response(400, headers, {'error': 'Invalid vote'}, error_code='VOTE_INVALID')

    matchup = table.get_item(Key={'pk': 'MATCHUP', 'sk': matchup_id}).get('Item')
    if not matchup:
        return json_response(404, headers, {'error': 'Matchup not found'}, error_code='MATCHUP_NOT_FOUND')
    if not matchup.get('active', False):
        return json_response(400, headers, {'error': 'Matchup not active'}, error_code='MATCHUP_NOT_ACTIVE')

    now = datetime.now(timezone.utc)
    starts_at = parse_iso8601(matchup.get('starts_at', ''))
    ends_at = parse_iso8601(matchup.get('ends_at', ''))
    if starts_at and now < starts_at:
        return json_response(400, headers, {'error': 'Matchup not started'}, error_code='MATCHUP_NOT_STARTED')
    if ends_at and now > ends_at:
        return json_response(400, headers, {'error': 'Matchup ended'}, error_code='MATCHUP_ENDED')
    
    vote_prefix = "VOTES_SYNTH" if synthetic else "VOTES"
    vote_key = {'pk': f"{vote_prefix}#{matchup_id}", 'sk': 'TOTAL'}

    if not synthetic and has_recent_vote(matchup_id, fingerprint):
        return json_response(409, headers, {'error': 'Vote already cast for this matchup in the last 24 hours'}, error_code='VOTE_ALREADY_CAST')

    try:
        table.update_item(
            Key=vote_key,
            UpdateExpression='ADD #side :inc',
            ExpressionAttributeNames={'#side': side},
            ExpressionAttributeValues={':inc': 1}
        )
        
        if not synthetic:
            table.put_item(Item={
                'pk': f"VOTES#{matchup_id}",
                'sk': f"V#{fingerprint}#{datetime.utcnow().isoformat()}",
                'side': side,
                'ts': datetime.utcnow().isoformat()
            })
        
        log('INFO', 'Vote cast', matchup_id=matchup_id, side=side, synthetic=synthetic)
        put_metric('VoteCast', 1, dimensions={'MatchupId': matchup_id, 'Side': side})
        return json_response(200, headers, {'voted': True})
    except Exception as e:
        log('ERROR', 'Vote failed', matchup_id=matchup_id, error=str(e))
        put_metric('VoteError', 1)
        return json_response(500, headers, {'error': str(e)})

def get_history(headers):
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={':pk': 'MATCHUP'},
        ScanIndexForward=False
    )
    
    history = []
    for item in resp.get('Items', []):
        if item['sk'] == 'ACTIVE':
            continue
        
        matchup_id = item['id']
        vote_resp = table.get_item(Key={'pk': f"VOTES#{matchup_id}", 'sk': 'TOTAL'})
        votes = vote_resp.get('Item', {'left': 0, 'right': 0})
        
        left = table.get_item(Key={'pk': 'ENTRY', 'sk': item['left_entry_id']})['Item']
        right = table.get_item(Key={'pk': 'ENTRY', 'sk': item['right_entry_id']})['Item']
        
        history.append({
            'id': matchup_id,
            'title': item['title'],
            'category': item['category'],
            'left': {'name': left.get('name', ''), 'neighborhood': left.get('neighborhood', '')},
            'right': {'name': right.get('name', ''), 'neighborhood': right.get('neighborhood', '')},
            'votes': {'left': int(votes.get('left', 0)), 'right': int(votes.get('right', 0))},
            'active': item.get('active', False)
        })
    
    return json_response(200, headers, {'history': history}, cache_seconds=300)

def get_future_matchups(headers):
    """Get upcoming scheduled matchups (public endpoint)"""
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        FilterExpression='active = :active',
        ExpressionAttributeValues={':pk': 'MATCHUP', ':active': True}
    )
    
    now = datetime.now(timezone.utc)
    future = []
    
    for matchup in resp.get('Items', []):
        if matchup['sk'] == 'ACTIVE':
            continue
        
        starts_at = parse_iso8601(matchup.get('starts_at', ''))
        if not starts_at or starts_at <= now:
            continue
        
        left = table.get_item(Key={'pk': 'ENTRY', 'sk': matchup['left_entry_id']})['Item']
        right = table.get_item(Key={'pk': 'ENTRY', 'sk': matchup['right_entry_id']})['Item']
        
        future.append({
            'matchup': {
                'id': matchup['id'],
                'title': matchup['title'],
                'category': matchup['category'],
                'starts_at': matchup.get('starts_at', ''),
                'ends_at': matchup.get('ends_at', '')
            },
            'left': {'name': left.get('name', '')},
            'right': {'name': right.get('name', '')}
        })
    
    # Sort by start time, limit to 5
    future.sort(key=lambda x: x['matchup']['starts_at'])
    future = future[:5]
    
    return json_response(200, headers, {'matchups': future}, cache_seconds=300)

def get_entry(entry_id):
    if not entry_id:
        return None
    resp = table.get_item(Key={'pk': 'ENTRY', 'sk': entry_id})
    return resp.get('Item')

def upsert_entry(entry, category):
    entry_id = entry.get('id')
    name = entry.get('name')
    if not entry_id or not name:
        return False, 'Entry id and name are required'

    item = {
        'pk': 'ENTRY',
        'sk': entry_id,
        'id': entry_id,
        'name': name,
        'blurb': entry.get('blurb', ''),
        'neighborhood': entry.get('neighborhood', ''),
        'category': entry.get('category', category),
        'tag': entry.get('tag', 'Local')
    }
    table.put_item(Item=item)
    return True, None

def activate_matchup(body, headers):
    """Admin helper: mark a matchup as active (enabled).

    Important: Scrumble supports *multiple* active matchups at once.
    This endpoint MUST NOT deactivate other matchups or maintain a global
    `sk = ACTIVE` pointer.
    """
    matchup_id = body.get('matchup_id')
    if not matchup_id:
        return json_response(400, headers, {'error': 'matchup_id is required'})

    target = table.get_item(Key={'pk': 'MATCHUP', 'sk': matchup_id}).get('Item')
    if not target:
        return json_response(404, headers, {'error': 'Matchup not found'})

    # Check for duplicate active matchups with same entries
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        FilterExpression='active = :active',
        ExpressionAttributeValues={':pk': 'MATCHUP', ':active': True}
    )

    for item in resp.get('Items', []):
        if item['sk'] == 'ACTIVE' or item['id'] == matchup_id:
            continue
        if ((item['left_entry_id'] == target['left_entry_id'] and item['right_entry_id'] == target['right_entry_id']) or
            (item['left_entry_id'] == target['right_entry_id'] and item['right_entry_id'] == target['left_entry_id'])):
            return json_response(400, headers, {'error': f"Duplicate matchup already active: {item['id']}"})

    table.update_item(
        Key={'pk': 'MATCHUP', 'sk': matchup_id},
        UpdateExpression='SET active = :active',
        ExpressionAttributeValues={':active': True}
    )

    return json_response(200, headers, {'ok': True, 'active': matchup_id})

def create_matchup(body, headers):
    payload = body.get('matchup', body)
    matchup_id = payload.get('id')
    title = payload.get('title')
    category = payload.get('category')
    left_entry_id = payload.get('left_entry_id')
    right_entry_id = payload.get('right_entry_id')
    is_active = bool(payload.get('active', False))
    cadence = payload.get('cadence', '')
    starts_at = payload.get('starts_at', '')
    ends_at = payload.get('ends_at', '')
    message = payload.get('message', '')

    left_entry = body.get('left')
    right_entry = body.get('right')

    if left_entry and not left_entry_id:
        left_entry_id = left_entry.get('id')
    if right_entry and not right_entry_id:
        right_entry_id = right_entry.get('id')

    if not matchup_id or not title or not category or not left_entry_id or not right_entry_id:
        return json_response(400, headers, {'error': 'id, title, category, left_entry_id, right_entry_id are required'})

    if left_entry:
        ok, error = upsert_entry(left_entry, category)
        if not ok:
            return json_response(400, headers, {'error': error})
    elif not get_entry(left_entry_id):
        return json_response(404, headers, {'error': f'Entry not found: {left_entry_id}'})

    if right_entry:
        ok, error = upsert_entry(right_entry, category)
        if not ok:
            return json_response(400, headers, {'error': error})
    elif not get_entry(right_entry_id):
        return json_response(404, headers, {'error': f'Entry not found: {right_entry_id}'})

    table.put_item(Item={
        'pk': 'MATCHUP',
        'sk': matchup_id,
        'id': matchup_id,
        'title': title,
        'left_entry_id': left_entry_id,
        'right_entry_id': right_entry_id,
        'category': category,
        'active': is_active,
        'cadence': cadence,
        'starts_at': starts_at,
        'ends_at': ends_at,
        'message': message
    })

    vote_key = {'pk': f"VOTES#{matchup_id}", 'sk': 'TOTAL'}
    existing_votes = table.get_item(Key=vote_key).get('Item')
    if not existing_votes:
        table.put_item(Item={
            'pk': f"VOTES#{matchup_id}",
            'sk': 'TOTAL',
            'left': 0,
            'right': 0
        })

    # NOTE: `active` means "enabled/eligible for display".
    # Do NOT auto-switch a global "ACTIVE" pointer here; the site can have multiple active matchups.
    return json_response(200, headers, {'ok': True, 'matchup_id': matchup_id})

def submit_matchup(body, headers):
    left_name = body.get('left_name', '').strip()
    right_name = body.get('right_name', '').strip()
    category = body.get('category', '').strip()
    email = body.get('email', '').strip()
    reason = body.get('reason', '').strip()
    
    if not left_name or not right_name or not category:
        return json_response(400, headers, {'error': 'Missing required fields'})
    
    timestamp = datetime.utcnow().isoformat()
    
    table.put_item(Item={
        'pk': 'SUBMISSION',
        'sk': timestamp,
        'left_name': left_name,
        'right_name': right_name,
        'category': category,
        'email': email,
        'reason': reason,
        'status': 'pending',
        'created_at': timestamp,
        'reviewed_by': '',
        'reviewed_at': '',
        'rejection_reason': ''
    })
    
    return json_response(200, headers, {'ok': True})


def subscribe_newsletter(body, headers):
    email = body.get('email', '').strip().lower()
    source = body.get('source', 'site').strip()

    if not email or '@' not in email:
        return json_response(400, headers, {'error': 'Valid email required'})

    now = datetime.utcnow().isoformat()
    table.put_item(Item={
        'pk': 'NEWSLETTER',
        'sk': email,
        'email': email,
        'source': source,
        'created_at': now,
        'updated_at': now,
        'status': 'subscribed'
    })

    log('INFO', 'Newsletter subscription', email=email, source=source)
    return json_response(200, headers, {'ok': True})

def update_visit_count(sk, now):
    resp = table.update_item(
        Key={'pk': 'VISIT', 'sk': sk},
        UpdateExpression='ADD #count :inc SET #updated_at = :now',
        ExpressionAttributeNames={'#count': 'count', '#updated_at': 'updated_at'},
        ExpressionAttributeValues={':inc': 1, ':now': now.isoformat()},
        ReturnValues='UPDATED_NEW'
    )
    return resp.get('Attributes', {}).get('count', 0)

def get_visit_count(sk):
    item = table.get_item(Key={'pk': 'VISIT', 'sk': sk}).get('Item', {})
    return item.get('count', 0)

def record_visit(body, headers, synthetic=False):
    now = datetime.now(timezone.utc)
    real_flag = bool(body.get('real', False))

    all_count = update_visit_count('ALL', now)
    real_count = None
    if real_flag and not synthetic:
        real_count = update_visit_count('REAL', now)

    return json_response(200, headers, {
        'ok': True,
        'all': all_count,
        'real': real_count if real_count is not None else get_visit_count('REAL'),
        'synthetic': synthetic
    })

def get_visits(headers):
    all_item = table.get_item(Key={'pk': 'VISIT', 'sk': 'ALL'}).get('Item', {})
    real_item = table.get_item(Key={'pk': 'VISIT', 'sk': 'REAL'}).get('Item', {})

    return json_response(200, headers, {
        'all': all_item.get('count', 0),
        'real': real_item.get('count', 0),
        'updated_at': all_item.get('updated_at', '')
    })

def get_entries(headers):
    """Get all entries grouped by category"""
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={':pk': 'ENTRY'}
    )
    
    entries_by_category = {}
    for item in resp.get('Items', []):
        category = item.get('category', 'Other')
        if category not in entries_by_category:
            entries_by_category[category] = []
        entries_by_category[category].append({
            'id': item['id'],
            'name': item['name'],
            'neighborhood': item.get('neighborhood', ''),
            'category': category
        })
    
    # Sort entries within each category by name
    for category in entries_by_category:
        entries_by_category[category].sort(key=lambda x: x['name'])
    
    return json_response(200, headers, {'entries': entries_by_category}, cache_seconds=300)

def get_submissions(headers):
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={':pk': 'SUBMISSION'},
        ScanIndexForward=False,
        Limit=50
    )
    
    submissions = []
    for item in resp.get('Items', []):
        submissions.append({
            'timestamp': item['sk'],
            'left_name': item.get('left_name', ''),
            'right_name': item.get('right_name', ''),
            'category': item.get('category', ''),
            'email': item.get('email', ''),
            'reason': item.get('reason', ''),
            'status': item.get('status', 'pending'),
            'reviewed_by': item.get('reviewed_by', ''),
            'reviewed_at': item.get('reviewed_at', ''),
            'rejection_reason': item.get('rejection_reason', '')
        })
    
    return json_response(200, headers, {'submissions': submissions})

def update_submission(timestamp, body, headers):
    """Update submission status (approve/reject)"""
    status = body.get('status')
    rejection_reason = body.get('rejection_reason', '')
    
    if status not in ['pending', 'approved', 'rejected']:
        return json_response(400, headers, {'error': 'Invalid status'})
    
    update_expr = 'SET #status = :status, reviewed_at = :now'
    expr_values = {':status': status, ':now': datetime.utcnow().isoformat()}
    expr_names = {'#status': 'status'}
    
    if rejection_reason:
        update_expr += ', rejection_reason = :reason'
        expr_values[':reason'] = rejection_reason
    
    table.update_item(
        Key={'pk': 'SUBMISSION', 'sk': timestamp},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names
    )
    
    return json_response(200, headers, {'ok': True})

def update_matchup(matchup_id, body, headers):
    if not matchup_id:
        return json_response(400, headers, {'error': 'matchup_id required'})
    
    update_expr = []
    expr_values = {}
    expr_names = {}
    
    if 'ends_at' in body:
        update_expr.append('#ends_at = :ends_at')
        expr_values[':ends_at'] = body['ends_at']
        expr_names['#ends_at'] = 'ends_at'

    if 'starts_at' in body:
        update_expr.append('#starts_at = :starts_at')
        expr_values[':starts_at'] = body['starts_at']
        expr_names['#starts_at'] = 'starts_at'

    if 'cadence' in body:
        update_expr.append('#cadence = :cadence')
        expr_values[':cadence'] = body['cadence']
        expr_names['#cadence'] = 'cadence'
    
    if 'message' in body:
        update_expr.append('#message = :message')
        expr_values[':message'] = body['message']
        expr_names['#message'] = 'message'
    
    if 'active' in body:
        update_expr.append('#active = :active')
        expr_values[':active'] = bool(body['active'])
        expr_names['#active'] = 'active'
    
    if not update_expr:
        return json_response(400, headers, {'error': 'No fields to update'})
    
    try:
        table.update_item(
            Key={'pk': 'MATCHUP', 'sk': matchup_id},
            UpdateExpression='SET ' + ', '.join(update_expr),
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names
        )
        return json_response(200, headers, {'ok': True})
    except Exception as e:
        return json_response(500, headers, {'error': str(e)})

def delete_matchup(matchup_id, headers):
    if not matchup_id:
        return json_response(400, headers, {'error': 'matchup_id required'})

    try:
        # Remove matchup definition
        table.delete_item(Key={'pk': 'MATCHUP', 'sk': matchup_id})

        # Remove vote counter row
        table.delete_item(Key={'pk': f"VOTES#{matchup_id}", 'sk': 'TOTAL'})

        return json_response(200, headers, {'ok': True, 'deleted': matchup_id})
    except Exception as e:
        return json_response(500, headers, {'error': str(e)})


def reset_votes(matchup_id, headers):
    if not matchup_id:
        return json_response(400, headers, {'error': 'matchup_id required'})
    
    try:
        table.put_item(Item={
            'pk': f"VOTES#{matchup_id}",
            'sk': 'TOTAL',
            'left': 0,
            'right': 0
        })
        return json_response(200, headers, {'ok': True})
    except Exception as e:
        return json_response(500, headers, {'error': str(e)})

def clone_matchup(matchup_id, headers):
    """Clone an existing matchup"""
    matchup = table.get_item(Key={'pk': 'MATCHUP', 'sk': matchup_id}).get('Item')
    if not matchup:
        return json_response(404, headers, {'error': 'Matchup not found'})
    
    new_id = f"{matchup_id}-clone-{int(datetime.utcnow().timestamp())}"
    
    table.put_item(Item={
        'pk': 'MATCHUP',
        'sk': new_id,
        'id': new_id,
        'title': f"{matchup['title']} (Copy)",
        'left_entry_id': matchup['left_entry_id'],
        'right_entry_id': matchup['right_entry_id'],
        'category': matchup['category'],
        'active': False,
        'cadence': matchup.get('cadence', ''),
        'starts_at': '',
        'ends_at': '',
        'message': matchup.get('message', '')
    })
    
    table.put_item(Item={
        'pk': f"VOTES#{new_id}",
        'sk': 'TOTAL',
        'left': 0,
        'right': 0
    })
    
    return json_response(200, headers, {'ok': True, 'matchup_id': new_id})

def bulk_activate(body, headers):
    """Activate multiple matchups"""
    matchup_ids = body.get('matchup_ids', [])
    if not matchup_ids:
        return json_response(400, headers, {'error': 'matchup_ids required'})
    
    for matchup_id in matchup_ids:
        table.update_item(
            Key={'pk': 'MATCHUP', 'sk': matchup_id},
            UpdateExpression='SET active = :active',
            ExpressionAttributeValues={':active': True}
        )
    
    return json_response(200, headers, {'ok': True, 'count': len(matchup_ids)})

def bulk_deactivate(body, headers):
    """Deactivate multiple matchups"""
    matchup_ids = body.get('matchup_ids', [])
    if not matchup_ids:
        return json_response(400, headers, {'error': 'matchup_ids required'})
    
    for matchup_id in matchup_ids:
        table.update_item(
            Key={'pk': 'MATCHUP', 'sk': matchup_id},
            UpdateExpression='SET active = :active',
            ExpressionAttributeValues={':active': False}
        )
    
    return json_response(200, headers, {'ok': True, 'count': len(matchup_ids)})

def archive_ended_matchups(headers):
    """Auto-archive matchups that have ended"""
    resp = table.query(
        KeyConditionExpression='pk = :pk',
        FilterExpression='active = :active',
        ExpressionAttributeValues={':pk': 'MATCHUP', ':active': True}
    )
    
    now = datetime.now(timezone.utc)
    archived = 0
    
    for matchup in resp.get('Items', []):
        if matchup['sk'] == 'ACTIVE':
            continue
        
        ends_at = parse_iso8601(matchup.get('ends_at', ''))
        if ends_at and now > ends_at:
            table.update_item(
                Key={'pk': 'MATCHUP', 'sk': matchup['id']},
                UpdateExpression='SET active = :inactive',
                ExpressionAttributeValues={':inactive': False}
            )
            archived += 1
    
    log('INFO', 'Auto-archived ended matchups', count=archived)
    return json_response(200, headers, {'ok': True, 'archived': archived})

def get_comments(matchup_id, headers):
    """Get all comments for a matchup"""
    comments_table = dynamodb.Table('scrumble-comments')
    
    resp = comments_table.query(
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={':pk': f'COMMENT#{matchup_id}'},
        ScanIndexForward=False,
        Limit=100
    )
    
    comments = []
    for item in resp.get('Items', []):
        comments.append({
            'author_name': item.get('author_name', 'Anonymous'),
            'comment_text': item.get('comment_text', ''),
            'timestamp': item.get('sk', '').replace('TIMESTAMP#', ''),
            'created_at': item.get('created_at', ''),
            'upvotes': int(item.get('upvotes', 0)),
            'downvotes': int(item.get('downvotes', 0))
        })
    
    # Sort by score (upvotes - downvotes)
    comments.sort(key=lambda c: c['upvotes'] - c['downvotes'], reverse=True)
    
    return json_response(200, headers, {'comments': comments}, cache_seconds=30)

def post_comment(body, headers):
    """Post a new comment"""
    matchup_id = body.get('matchup_id')
    author_name = body.get('author_name', '').strip()
    comment_text = body.get('comment_text', '').strip()
    fingerprint = body.get('fingerprint', 'anon')
    
    if not author_name or not comment_text:
        return json_response(400, headers, {'error': 'Name and comment required'})
    
    if len(author_name) > 50:
        return json_response(400, headers, {'error': 'Name too long'})
    
    if len(comment_text) > 500:
        return json_response(400, headers, {'error': 'Comment too long'})
    
    comments_table = dynamodb.Table('scrumble-comments')
    timestamp = str(int(time.time() * 1000))
    
    comments_table.put_item(Item={
        'pk': f'COMMENT#{matchup_id}',
        'sk': f'TIMESTAMP#{timestamp}',
        'author_name': author_name,
        'comment_text': comment_text,
        'fingerprint': fingerprint,
        'created_at': datetime.utcnow().isoformat(),
        'upvotes': 0,
        'downvotes': 0
    })
    
    log('INFO', 'Comment posted', matchup_id=matchup_id, author=author_name)
    return json_response(200, headers, {'ok': True})


def vote_comment(body, headers):
    """Vote on a comment (upvote or downvote)"""
    matchup_id = body.get('matchup_id')
    timestamp = body.get('timestamp')
    vote_type = body.get('vote_type')  # 'up' or 'down'
    fingerprint = body.get('fingerprint', 'anon')
    
    if not matchup_id or not timestamp or vote_type not in ['up', 'down']:
        return json_response(400, headers, {'error': 'Invalid vote'})
    
    comments_table = dynamodb.Table('scrumble-comments')
    
    # Check if already voted
    vote_key = f'VOTE#{matchup_id}#{timestamp}#{fingerprint}'
    existing = comments_table.get_item(
        Key={'pk': 'COMMENT_VOTE', 'sk': vote_key}
    ).get('Item')
    
    if existing:
        return json_response(400, headers, {'error': 'Already voted'})
    
    # Record vote
    comments_table.put_item(Item={
        'pk': 'COMMENT_VOTE',
        'sk': vote_key,
        'vote_type': vote_type,
        'created_at': datetime.utcnow().isoformat()
    })
    
    # Update comment vote count
    field = 'upvotes' if vote_type == 'up' else 'downvotes'
    comments_table.update_item(
        Key={'pk': f'COMMENT#{matchup_id}', 'sk': f'TIMESTAMP#{timestamp}'},
        UpdateExpression=f'ADD {field} :inc',
        ExpressionAttributeValues={':inc': 1}
    )
    
    log('INFO', 'Comment vote', matchup_id=matchup_id, timestamp=timestamp, vote_type=vote_type)
    return json_response(200, headers, {'ok': True})


def delete_comment(matchup_id, timestamp, headers):
    """Delete a comment (admin only)"""
    comments_table = dynamodb.Table('scrumble-comments')
    
    try:
        comments_table.delete_item(
            Key={
                'pk': f'COMMENT#{matchup_id}',
                'sk': f'TIMESTAMP#{timestamp}'
            }
        )
        log('INFO', 'Comment deleted', matchup_id=matchup_id, timestamp=timestamp)
        return json_response(200, headers, {'ok': True})
    except Exception as e:
        log('ERROR', 'Delete comment failed', error=str(e))
        return json_response(500, headers, {'error': str(e)})


def rate_matchup(body, headers):
    """Rate a matchup (good/bad)"""
    matchup_id = body.get('matchup_id')
    rating = body.get('rating')  # 'good' or 'bad'
    fingerprint = body.get('fingerprint', 'anon')
    
    if rating not in ['good', 'bad']:
        return json_response(400, headers, {'error': 'Invalid rating'})
    
    # Check if already rated
    rate_key = {'pk': f'MATCHUP_RATING#{matchup_id}', 'sk': f'VOTE#{fingerprint}'}
    existing = table.get_item(Key=rate_key).get('Item')
    
    if existing:
        return json_response(400, headers, {'error': 'Already rated'})
    
    # Record rating
    table.put_item(Item={
        'pk': f'MATCHUP_RATING#{matchup_id}',
        'sk': f'VOTE#{fingerprint}',
        'rating': rating,
        'created_at': datetime.utcnow().isoformat()
    })
    
    # Update aggregate
    field = 'good_count' if rating == 'good' else 'bad_count'
    table.update_item(
        Key={'pk': f'MATCHUP_RATING#{matchup_id}', 'sk': 'AGGREGATE'},
        UpdateExpression=f'ADD {field} :inc',
        ExpressionAttributeValues={':inc': 1}
    )
    
    log('INFO', 'Matchup rated', matchup_id=matchup_id, rating=rating)
    return json_response(200, headers, {'ok': True})
