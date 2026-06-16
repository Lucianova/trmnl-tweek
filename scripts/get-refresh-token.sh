#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/get-refresh-token.sh <email> <password>
# Prints your Tweek refreshToken. Run once, paste into plugin settings.
# Update if you change your Tweek password.

EMAIL="${1:?Usage: $0 <email> <password>}"
PASSWORD="${2:?Usage: $0 <email> <password>}"

FIREBASE_API_KEY="AIzaSyC7_JO56peYl_eD9QODZlLwZpMclLUoC9s"

RESPONSE=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"returnSecureToken\":true}")

echo "$RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4
