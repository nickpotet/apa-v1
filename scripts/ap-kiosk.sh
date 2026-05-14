#!/usr/bin/env bash
# Launches Chrome in kiosk mode pointing at the Ap server.
# Called by ap-kiosk.service — do not run directly.
set -euo pipefail

# Wait until the server is up (max 30s)
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:8787/api/health > /dev/null && break
  sleep 1
done

exec /usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --disable-features=TranslateUI \
  --user-data-dir=/tmp/ap-kiosk \
  http://127.0.0.1:8787
