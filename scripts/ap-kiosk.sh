#!/usr/bin/env bash
# Launches Chromium in kiosk mode on the production site.
# Called by ap-kiosk.service — do not run directly.
# (Only for a Linux mini-PC build. The live venue kiosk is an Android panel
#  running the same URL in its WebView; it self-updates after each deploy.)
set -euo pipefail

exec /usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --disable-features=TranslateUI \
  --user-data-dir="${HOME}/.config/ap-kiosk" \
  https://apa-v1.pages.dev/
