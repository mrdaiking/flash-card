#!/usr/bin/env bash
# Deploy to EC2: one code checkout (~/anki-pwa), two pm2 processes (anki-pwa, anki-pwa-wife).
# Push to origin first — the server pulls from there.
set -euo pipefail

HOST=${DEPLOY_HOST:-cuong-dev}

ssh "$HOST" 'set -e
cd ~/anki-pwa
git pull --ff-only
npm install --no-audit --no-fund
pm2 restart anki-pwa anki-pwa-wife
sleep 2
for p in 3000 3001; do
  curl -s -o /dev/null -w "port $p: %{http_code}\n" "localhost:$p/"
done'
