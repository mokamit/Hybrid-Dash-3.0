# HybridDash 2.0

[⬇ Download the Android app (APK)](https://github.com/YOUR-GITHUB-USER/hybriddash/releases/latest/download/HybridDash.apk) · Play in the browser: [YOUR-GITHUB-USER.github.io/hybriddash](https://YOUR-GITHUB-USER.github.io/hybriddash/)

An open source controller for Carrera Hybrid Bluetooth cars, with physics from scientific
formulae and engine sound from an enginesim implementation, plus a race director, NPCs,
safety car, championships and multiplayer. The interface is in English by default; German and
Spanish are one tap away on the title screen.

HybridDash 2.0 is a fork of **[OmegaSim](https://github.com/Luuke42/omegasim) by Luuke**
(MIT License). Everything OmegaSim does still works; HybridDash adds its own features on top.

## New in HybridDash 2.0

| Feature | Where | What it does |
|---|---|---|
| **Automatic safety car** | Race settings | If any racing car (players or NPCs) is off the track or has not advanced a track tile for 3 s (adjustable 1–10 s), the yellow flag goes out automatically and the safety car is deployed. Ignores cars in the pit lane, NPCs pitting/finishing, the safety car itself, and the standing grid at a start or restart. Track mode only. |
| **Random NPC driver names** | Garage / Race settings | The first time a car becomes an NPC without a name, it gets a random, unique driver name that is remembered with the car. 🎲 next to the name field rolls a new one. |
| **Driver announcements** | Race settings | The announcer voice reads out each new driver and the car they drive (“New driver: Mara Kovac, driving the red Porsche 911.”) and calls the reason for an automatic safety car. |
| **Driver avatars** | Garage | Each driver gets a generated helmet avatar in the car colour with their initials. Tap it to restyle. |

All HybridDash code lives in `src/98i-hybriddash.js`; the original files only carry small hooks,
so upstream OmegaSim improvements can still be merged.

## Building

```bash
python3 tools/build.py          # joins src/* into index.html (+ sw.js, app-update.json)
python3 -m http.server 8080     # then open http://localhost:8080 in Chrome/Edge
```

Web Bluetooth needs Chrome or Edge (desktop or Android) on `https://` or `localhost`.
In the browser console, `HYBRIDDASH.selbsttest()` runs the HybridDash self-tests; the app's
full self-test is in the developer tab.

### Point the app at your own repository

Update checks, APK links and the “Source on GitHub” link use a placeholder until you run:

```bash
python3 tools/hd_set_repo.py OWNER/REPO && python3 tools/build.py
```

### Android

The APK (Capacitor) lives in `android-app/`. Its application id is `com.hybriddash.app`, so it
installs next to OmegaSim rather than replacing it. Releases are cut by pushing a `v*` tag
(`.github/workflows/release.yml`).

### Windows

Double-click `Start HybridDash.bat` (local server + app window, nothing to install).

## License

MIT, see [LICENSE](LICENSE). Original work © 2026 Luuke (OmegaSim).
