#!/usr/bin/env python3
import json
import boto3
import sys

def seed_expanded(table_name):
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    with open("docs/seed-expanded.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Seeding {len(data['entries'])} entries...")
    for entry in data["entries"]:
        table.put_item(Item={"pk": "ENTRY", "sk": entry["id"], **entry})
        print(f"  ✓ {entry['name']}")

    print(f"\nSeeding {len(data['matchups'])} matchups...")
    for matchup in data["matchups"]:
        table.put_item(Item={"pk": "MATCHUP", "sk": matchup["id"], **matchup})
        table.put_item(Item={"pk": f"VOTES#{matchup['id']}", "sk": "TOTAL", "left": 0, "right": 0})
        print(f"  ✓ {matchup['title']}")

    print(f"\n✅ Seeded {len(data['entries'])} entries and {len(data['matchups'])} matchups")

if __name__ == "__main__":
    table_name = sys.argv[1] if len(sys.argv) > 1 else "scrumble-data"
    seed_expanded(table_name)
