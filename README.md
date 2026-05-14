# Ap

A vertical-screen AI penguin mascot for **cggalleries.com** — the penguin VR exhibition at Carrer Sant Romà 12, Lloret de Mar. Ap stands at the entrance, runs an attract-loop in four languages, and talks to passersby for up to 90 seconds with one goal: get them inside, onto a VR headset.

This is the v1 MVP. Architecture, rules, and stack live in [CLAUDE.md](CLAUDE.md). The 7-day build plan lives in [docs/PLAN.md](docs/PLAN.md).

## Quick orientation

- `/kiosk` — the screen (React + Vite + Rive).
- `/server` — local Node service on the kiosk mini-PC.
- `/config` — everything Nick edits without rebuilding: persona, prices, FAQs, sales scenarios.
- `/audio/attract` — pre-baked idle clips (the attract loop never calls a paid API).
- `/docs` — plan, hardware spec, kiosk setup, GDPR.

## Languages

ES, EN, RU, CA — all four enabled day one.
