#!/bin/bash
cd /Users/jon/projects/scrumble
sam build
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
