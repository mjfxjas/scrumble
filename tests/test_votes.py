"""Offline voting regression tests; Moto intercepts every AWS request."""
import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import pytest
from moto import mock_aws


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_SESSION_TOKEN', 'testing')
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_EC2_METADATA_DISABLED', 'true')
    monkeypatch.setenv('TABLE_NAME', 'scrumble-test')
    with mock_aws():
        boto3.resource('dynamodb').create_table(
            TableName='scrumble-test',
            KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'},
                       {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
            AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'},
                                  {'AttributeName': 'sk', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        spec = importlib.util.spec_from_file_location(
            'scrumble_test_app', Path(__file__).resolve().parents[1] / 'backend/app.py'
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        monkeypatch.setattr(module, 'put_metric', lambda *args, **kwargs: None)
        module.table.put_item(Item={'pk': 'MATCHUP', 'sk': 'test', 'active': True})
        yield module


def vote(app, fingerprint='device', side='left', synthetic=False):
    return app.cast_vote({'matchup_id': 'test', 'side': side,
                          'fingerprint': fingerprint}, {}, synthetic)


def total(app, prefix='VOTES'):
    return app.table.get_item(Key={'pk': f'{prefix}#test', 'sk': 'TOTAL'}).get('Item', {})


def records(app):
    return app.table.query(KeyConditionExpression='pk = :pk',
                           ExpressionAttributeValues={':pk': 'VOTES#test'})['Items']


def test_real_vote_commits_counter_guard_and_history(app):
    assert vote(app)['statusCode'] == 200
    assert total(app)['left'] == 1
    assert sorted(item['sk'].split('#')[0] for item in records(app)) == ['GUARD', 'TOTAL', 'V']


def test_duplicate_is_rejected_even_if_both_history_checks_pass(app, monkeypatch):
    # Force the read interleaving of two requests that both saw no old vote.
    monkeypatch.setattr(app, 'has_recent_vote', lambda *args: False)
    assert vote(app)['statusCode'] == 200
    duplicate = vote(app, side='right')
    assert duplicate['statusCode'] == 409
    assert json.loads(duplicate['body'])['error_code'] == 'VOTE_ALREADY_CAST'
    assert total(app)['left'] == 1
    assert total(app).get('right', 0) == 0
    assert len(records(app)) == 3


def test_transaction_failure_does_not_leave_guard_or_history(app):
    # An invalid counter type fails after the guard action in the transaction.
    app.table.put_item(Item={'pk': 'VOTES#test', 'sk': 'TOTAL', 'left': 'invalid'})
    assert vote(app)['statusCode'] == 500
    assert records(app) == [{'pk': 'VOTES#test', 'sk': 'TOTAL', 'left': 'invalid'}]
    app.table.delete_item(Key={'pk': 'VOTES#test', 'sk': 'TOTAL'})
    assert vote(app)['statusCode'] == 200


@pytest.mark.parametrize('elapsed, expected', [(86399, 409), (86400, 200)])
def test_rolling_24_hour_boundary(app, monkeypatch, elapsed, expected):
    class Clock(datetime):
        current = datetime(2026, 1, 1, tzinfo=timezone.utc)

        @classmethod
        def now(cls, tz=None):
            return cls.current if tz else cls.current.replace(tzinfo=None)

    monkeypatch.setattr(app, 'datetime', Clock)
    assert vote(app)['statusCode'] == 200
    Clock.current += timedelta(seconds=elapsed)
    assert vote(app)['statusCode'] == expected
    assert total(app)['left'] == (2 if expected == 200 else 1)


def test_recent_legacy_vote_remains_blocked(app):
    timestamp = datetime.now(timezone.utc).isoformat()
    app.table.put_item(Item={'pk': 'VOTES#test', 'sk': f'V#device#{timestamp}',
                             'ts': timestamp, 'side': 'left'})
    assert vote(app)['statusCode'] == 409
    assert total(app) == {}


def test_distinct_fingerprints_can_vote_on_opposite_sides(app):
    assert vote(app, fingerprint='first')['statusCode'] == 200
    assert vote(app, fingerprint='second', side='right')['statusCode'] == 200
    assert total(app)['left'] == total(app)['right'] == 1


def test_synthetic_votes_are_repeatable_and_do_not_block_real_votes(app):
    assert vote(app, synthetic=True)['statusCode'] == 200
    assert vote(app, synthetic=True)['statusCode'] == 200
    assert total(app, 'VOTES_SYNTH')['left'] == 2
    assert records(app) == []
    assert vote(app)['statusCode'] == 200
    assert total(app)['left'] == 1
