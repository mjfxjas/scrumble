import json
import os
import boto3
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])
ADMIN_KEY = os.environ.get('ADMIN_KEY', '').strip()

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj)
    raise TypeError

def json_response(status_code, headers, body):
    return {'statusCode': status_code, 'headers': headers, 'body': json.dumps(body, default=decimal_default)}

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
    path = event.get('rawPath', '/')
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*'
    }
    
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    try:
        if path == '/matchup' and method == 'GET':
            return get_active_matchup(headers)
        elif path == '/history' and method == 'GET':
            return get_history(headers)
        elif path == '/vote' and method == 'POST':
            body = json.loads(event.get('body', '{}'))
            return cast_vote(body, headers)
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
            return create_matchup(body, headers)
        elif path == '/submit' and method == 'POST':
            body = json.loads(event.get('body', '{}'))
            return submit_matchup(body, headers)
        elif path == '/admin/submissions' and method == 'GET':
            allowed, failure = require_admin(event, headers)
            if not allowed:
                return failure
            return get_submissions(headers)
        else:
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Not found'})}
    except Exception as e:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

def get_active_matchup(headers):
    resp = table.get_item(Key={'pk': 'MATCHUP', 'sk': 'ACTIVE'})
    if 'Item' not in resp:
        return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'No active matchup'})}
    
    matchup = resp['Item']
    left_id = matchup['left_entry_id']
    right_id = matchup['right_entry_id']
    
    left = table.get_item(Key={'pk': 'ENTRY', 'sk': left_id})['Item']
    right = table.get_item(Key={'pk': 'ENTRY', 'sk': right_id})['Item']
    
    vote_resp = table.get_item(Key={'pk': f"VOTES#{matchup['id']}", 'sk': 'TOTAL'})
    votes = vote_resp.get('Item', {'left': 0, 'right': 0})
    
    # Boost votes with base + time-based growth
    import time
    base_boost = 150
    hours_since_epoch = int(time.time()) // 3600
    time_boost_left = (hours_since_epoch * 3) % 7  # 0-6 votes per hour
    time_boost_right = (hours_since_epoch * 2) % 5  # 0-4 votes per hour
    
    result = {
        'matchup': {
            'id': matchup['id'],
            'title': matchup['title'],
            'category': matchup['category']
        },
        'left': {
            'id': left['id'],
            'name': left['name'],
            'blurb': left['blurb'],
            'neighborhood': left['neighborhood'],
            'tag': left.get('tag', 'Local'),
            'url': left.get('url', ''),
            'image_url': left.get('image_url', ''),
            'address': left.get('address', '')
        },
        'right': {
            'id': right['id'],
            'name': right['name'],
            'blurb': right['blurb'],
            'neighborhood': right['neighborhood'],
            'tag': right.get('tag', 'Local'),
            'url': right.get('url', ''),
            'image_url': right.get('image_url', ''),
            'address': right.get('address', '')
        },
        'votes': {
            'left': int(votes.get('left', 0)) + base_boost + time_boost_left,
            'right': int(votes.get('right', 0)) + base_boost + time_boost_right
        }
    }
    
    return {'statusCode': 200, 'headers': headers, 'body': json.dumps(result, default=decimal_default)}

def cast_vote(body, headers):
    matchup_id = body.get('matchup_id')
    side = body.get('side')
    fingerprint = body.get('fingerprint', 'anon')
    
    if not matchup_id or side not in ['left', 'right']:
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Invalid vote'})}
    
    vote_key = {'pk': f"VOTES#{matchup_id}", 'sk': 'TOTAL'}
    
    try:
        table.update_item(
            Key=vote_key,
            UpdateExpression='ADD #side :inc',
            ExpressionAttributeNames={'#side': side},
            ExpressionAttributeValues={':inc': 1}
        )
        
        table.put_item(Item={
            'pk': f"VOTES#{matchup_id}",
            'sk': f"V#{fingerprint}#{datetime.utcnow().isoformat()}",
            'side': side,
            'ts': datetime.utcnow().isoformat()
        })
        
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'success': True})}
    except Exception as e:
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

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
            'left': {'name': left['name'], 'neighborhood': left['neighborhood']},
            'right': {'name': right['name'], 'neighborhood': right['neighborhood']},
            'votes': {'left': int(votes.get('left', 0)), 'right': int(votes.get('right', 0))},
            'active': item.get('active', False)
        })
    
    return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'history': history}, default=decimal_default)}

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
    matchup_id = body.get('matchup_id')
    if not matchup_id:
        return json_response(400, headers, {'error': 'matchup_id is required'})

    target = table.get_item(Key={'pk': 'MATCHUP', 'sk': matchup_id}).get('Item')
    if not target:
        return json_response(404, headers, {'error': 'Matchup not found'})

    current = table.get_item(Key={'pk': 'MATCHUP', 'sk': 'ACTIVE'}).get('Item')
    if current and current.get('id') and current.get('id') != matchup_id:
        table.update_item(
            Key={'pk': 'MATCHUP', 'sk': current['id']},
            UpdateExpression='SET active = :inactive',
            ExpressionAttributeValues={':inactive': False}
        )

    target_active = dict(target)
    target_active['active'] = True
    target_active['pk'] = 'MATCHUP'
    target_active['sk'] = 'ACTIVE'
    table.put_item(Item=target_active)

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
        'active': is_active
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

    if is_active:
        return activate_matchup({'matchup_id': matchup_id}, headers)

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
        'created_at': timestamp
    })
    
    return json_response(200, headers, {'ok': True})

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
            'status': item.get('status', 'pending')
        })
    
    return json_response(200, headers, {'submissions': submissions})
