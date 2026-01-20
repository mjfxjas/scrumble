#!/usr/bin/env python3
import json
import boto3
import sys


def seed_table(table_name):
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    with open("docs/seed-data.json", "r", encoding="utf-8") as file_handle:
        data = json.load(file_handle)

    for entry in data["entries"]:
        table.put_item(
            Item={
                "pk": "ENTRY",
                "sk": entry["id"],
                **entry,
            }
        )
        print(f"Added entry: {entry['name']}")

    for matchup in data["matchups"]:
        if matchup["active"]:
            table.put_item(
                Item={
                    "pk": "MATCHUP",
                    "sk": "ACTIVE",
                    **matchup,
                }
            )
            print(f"Set active matchup: {matchup['title']}")

            table.put_item(
                Item={
                    "pk": f"VOTES#{matchup['id']}",
                    "sk": "TOTAL",
                    "left": 0,
                    "right": 0,
                }
            )
            print(f"Initialized votes for {matchup['id']}")

        table.put_item(
            Item={
                "pk": "MATCHUP",
                "sk": matchup["id"],
                **matchup,
            }
        )

    print(
        f"Seeded {len(data['entries'])} entries and {len(data['matchups'])} matchups"
    )


if __name__ == "__main__":
    table_name = sys.argv[1] if len(sys.argv) > 1 else "scrumble-data"
    seed_table(table_name)
