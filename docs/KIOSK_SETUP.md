# Kiosk setup — Ap v1

> Placeholder. Filled out on day 6 of the build plan when `/scripts/kiosk-setup-*.sh` are written. The shape below is what we'll need.

## Boot-to-Ap on the target machine

1. Auto-login user `ap`.
2. Systemd / launchd unit starts `server/` Node service.
3. After 2s, launches Chrome with `--kiosk --app=http://localhost:5173`.
4. Watchdog (`/scripts/watchdog.sh`) monitors both Chrome and Node, restarts on crash, reboots host if either stays dead >5 min.
5. Cron: `0 4 * * * /sbin/reboot` for nightly clean state.

## Lockdown checklist

- [ ] Disable screen saver and sleep.
- [ ] Disable Chrome update prompts and translation prompts.
- [ ] Disable notifications.
- [ ] Block all USB ports on the public side (epoxy / blockers).
- [ ] Single user, no sudo on the kiosk account.
- [ ] Firewall: outbound to voice provider endpoints + Google AI Studio / OpenAI; inbound blocked.
- [ ] OS auto-updates: security only, scheduled during the 04:00 reboot.

## What to verify before deploy

- Pull plug, plug back in → kiosk back to attract within 60s.
- Network down for 5 min → attract loop continues, `talkButton` shows offline message, no broken state.
- Daily $-cap exceeded → new conversations get offline-style fallback, attract continues.
- 24h continuous run with no manual intervention.
