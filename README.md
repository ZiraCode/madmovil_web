<div align="center">

<img src="public/favicon.svg" width="96" alt="MadMovil logo">

# MadMovil

**Madrid public transport in real time: buses, Metro and Cercanías.**<br>
No ads. No tracking. No accounts.

**[www.madmovil.es](https://www.madmovil.es)**

[![Astro](https://img.shields.io/badge/Astro-7-FF5D01?logo=astro&logoColor=white)](#tech-stack)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](#tech-stack)
[![Accounts](https://img.shields.io/badge/accounts-none-0F7B5F)](#what-it-does-not-do)
[![Tracking](https://img.shields.io/badge/tracking-none-0F7B5F)](#what-it-does-not-do)
[![Languages](https://img.shields.io/badge/languages-2-0F7B5F)](#languages)
[![License: MIT](https://img.shields.io/badge/license-MIT-0F7B5F)](LICENSE)
[![100% AI-written code](https://img.shields.io/badge/code-100%25%20AI--written-8A5CF6)](#development)

**English** · [Español](README.es.md)

</div>

---

## Why MadMovil

Getting around Madrid shouldn't take one app per network. MadMovil puts them
all in one place and leaves your data alone:

- 🚊 **All networks** — EMT city buses, interurban and urban buses from the CRTM, Metro Ligero, Metro and Renfe Cercanías.
- ⚡ **Real time** — arrivals with live estimates: EMT's SAE, Renfe's official GTFS-RT for Cercanías (delays, platform, cancellations) and the CRTM's SAE for the rest.
- 🔒 **Private by design** — no accounts: your favorites stay in your browser, and the optional sync copy is end-to-end encrypted so the server only ever sees an opaque blob.
- 🌍 **Open source** — MIT licensed. The [API](https://github.com/ZiraCode/madmovil_server) is open too.

## What it does

- **Stop pages** for every network, with a live arrivals board and today's theoretical departures.
- **Line pages** with the route drawn on a map, timetables by direction and service pattern, and service alerts.
- **Unified search** of lines and stops across all networks, from a single box.
- **Map** of nearby stops with icons by network, based on your location.
- **Favorites without an account**: stored locally, with backup and restore via file, QR code or link, and optional multi-device sync (end-to-end encrypted, protected with Turnstile).
- **Spanish and English**, with per-language sitemaps for search engines.
- Light and dark theme that follows your system, and basic offline support (service worker).

## What it does NOT do

- ❌ No accounts, registration or logins
- ❌ No ads
- ❌ No analytics, tracking or third-party scripts (a strict CSP with per-build hashes blocks anything not explicitly allowed)
- ❌ No readable personal data on the server: the favorites sync blob is encrypted in your browser

## Privacy

Everything happens in your browser. Favorites live in local storage, and the
optional sync copy is encrypted on your device before it ever leaves — the
server stores an opaque blob it cannot decrypt. Vault creation is protected
with Cloudflare Turnstile to stop abuse.

Read the full privacy policy:
[Español](https://www.madmovil.es/privacidad) ·
[English](https://www.madmovil.es/en/privacidad).

## Requirements

Any modern browser. Pages render on the server; the arrivals boards and the
map need JavaScript.

## Languages

The interface follows the URL: **Español** (default,
[www.madmovil.es](https://www.madmovil.es)) · **English**
([www.madmovil.es/en](https://www.madmovil.es/en)).

## Use it

**[www.madmovil.es](https://www.madmovil.es)** is live: free, no account
needed.

## Getting started

You need **Node 22.12+** and, for real data, the
[API](https://github.com/ZiraCode/madmovil_server) running locally
(`npm run dev` there → http://localhost:8787).

```bash
git clone https://github.com/ZiraCode/madmovil_web.git
cd madmovil_web
npm install
npm run dev       # http://localhost:4321
npm run check     # astro check, must pass with 0 errors
npm run build     # production build to dist/
```

| Variable | Purpose |
| --- | --- |
| `PUBLIC_API_BASE_URL` | API base URL. `.env.development` (included) points to `http://localhost:8787` |
| `PUBLIC_TURNSTILE_SITEKEY` | Turnstile sitekey for the favorites vault (public by design; the official dummy always passes in development) |

<details>
<summary>Deploying to Cloudflare</summary>

`npm run deploy` builds and deploys with Wrangler. You need your own
Cloudflare account; `wrangler.jsonc` expects the Workers assets binding and
the rate-limit binding used by the middleware. The CSP script hashes are
verified on every CI build with `scripts/check-csp.mjs`.

</details>

## Tech stack

| | |
|---|---|
| Framework | Astro 7 (server output, SSR) with the Cloudflare adapter |
| Styling | Tailwind CSS 4 |
| Map | Leaflet |
| i18n | Own middleware: Spanish by default, English under `/en` |
| Security | CSP with per-build script hashes, HSTS, rate limiting per IP |
| Data | [MadMovil API](https://github.com/ZiraCode/madmovil_server) |

## Development

MadMovil was built by a small human–AI team:

| Role | Who |
|---|---|
| Project lead | [Ziracode](https://ziracode.github.io) |
| Senior developer | **GLM** (Z.ai) |
| Code review & security audits | **Claude** (Anthropic) |

Ziracode and GLM planned and built the project together, and **100% of the
code was written by GLM**. Claude contributed independent code reviews and
security audits throughout the development.

## License

Released under the [MIT License](LICENSE). The transport data consumed by the
site (EMT, CRTM, Renfe) belongs to its owners, with attribution handled by the
[API](https://github.com/ZiraCode/madmovil_server).

---

<div align="center">
<sub>Made by <a href="https://ziracode.github.io">Ziracode</a></sub>
</div>
