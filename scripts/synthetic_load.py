#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request


DEFAULT_HEADER = "X-Scrumble-Synthetic"


def load_api_base(args):
    if args.base:
        return args.base
    env_base = os.environ.get("SCRUMBLE_API_BASE", "").strip()
    if env_base:
        return env_base

    config_path = os.path.join(os.path.dirname(__file__), "..", "app", "config.js")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            content = handle.read()
        match = re.search(
            r"SCRUMBLE_API_BASE\s*=\s*['\"]([^'\"]+)['\"]", content
        )
        if match:
            return match.group(1).strip()
    except FileNotFoundError:
        return ""
    return ""


def normalize_base(value):
    if not value:
        return ""
    value = value.strip()
    return value[:-1] if value.endswith("/") else value


def request_json(method, url, headers, payload=None):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return resp.getcode(), body


def fetch_matchups(base, headers):
    code, body = request_json("GET", f"{base}/matchup", headers)
    if code != 200:
        raise RuntimeError(f"GET /matchup failed with {code}: {body}")
    data = json.loads(body or "{}")
    return data.get("matchups") or []


def pick_matchup(matchups, matchup_id=None):
    if not matchups:
        return None
    if matchup_id:
        for matchup in matchups:
            if matchup.get("matchup", {}).get("id") == matchup_id:
                return matchup
        return None
    return matchups[0]


def send_vote(base, headers, matchup_id, side, fingerprint):
    payload = {"matchup_id": matchup_id, "side": side, "fingerprint": fingerprint}
    code, body = request_json("POST", f"{base}/vote", headers, payload)
    return code, body


def run_load(args):
    base = normalize_base(load_api_base(args))
    if not base:
        raise RuntimeError("Missing API base. Set --base or SCRUMBLE_API_BASE.")

    headers = {
        DEFAULT_HEADER: "1",
        "Content-Type": "application/json",
        "User-Agent": "ScrumbleSyntheticLoad/1.0",
    }

    if args.mode == "vote":
        matchups = fetch_matchups(base, headers)
        matchup = pick_matchup(matchups, args.matchup_id)
        if not matchup:
            raise RuntimeError("Matchup not found for vote mode.")
        matchup_id = matchup.get("matchup", {}).get("id")
        if not matchup_id:
            raise RuntimeError("Matchup id missing from /matchup response.")

    interval = 0 if args.rps <= 0 else 1.0 / args.rps
    total = int(args.duration * args.rps) if args.duration > 0 else 0
    if total <= 0:
        raise RuntimeError("Duration and rps must yield at least one request.")

    successes = 0
    failures = 0
    start = time.time()
    for idx in range(total):
        tick_start = time.time()
        try:
            if args.mode == "matchup":
                code, _ = request_json("GET", f"{base}/matchup", headers)
            else:
                side = "left" if idx % 2 == 0 else "right"
                if args.random_side:
                    side = random.choice(["left", "right"])
                fingerprint = f"{args.fingerprint_prefix}-{int(time.time() * 1000)}-{idx}"
                code, _ = send_vote(base, headers, matchup_id, side, fingerprint)

            if 200 <= code < 300:
                successes += 1
            else:
                failures += 1
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError):
            failures += 1

        elapsed = time.time() - tick_start
        sleep_for = interval - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)

    duration = time.time() - start
    print("Synthetic load complete")
    print(f"  base: {base}")
    print(f"  mode: {args.mode}")
    print(f"  total: {total}")
    print(f"  successes: {successes}")
    print(f"  failures: {failures}")
    print(f"  elapsed: {duration:.2f}s")


def main():
    parser = argparse.ArgumentParser(
        description="Scrumble synthetic load generator (matchup or vote)."
    )
    parser.add_argument("--base", help="API base URL (overrides env/config).")
    parser.add_argument("--mode", choices=["matchup", "vote"], default="matchup")
    parser.add_argument("--duration", type=int, default=10, help="Seconds to run.")
    parser.add_argument("--rps", type=float, default=1, help="Requests per second.")
    parser.add_argument("--matchup-id", help="Matchup id for vote mode.")
    parser.add_argument(
        "--fingerprint-prefix", default="synthetic", help="Fingerprint prefix."
    )
    parser.add_argument(
        "--random-side", action="store_true", help="Randomize vote side."
    )

    args = parser.parse_args()
    run_load(args)


if __name__ == "__main__":
    main()
