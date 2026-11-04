# HybridDash 2.0

[⬇ Download the Android app (APK)](https://github.com/mokamit/hybriddash/releases/latest/download/HybridDash.apk) · Play in the browser: [mokamit.github.io/hybriddash](https://mokamit.github.io/hybriddash/)

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
| **Two-laptop mode** | Garage → *Two laptops…* | Split the Bluetooth connections across two laptops on the same Wi-Fi. Laptop A (host) runs the race as usual; laptop B (helper) connects the remaining cars over its own Bluetooth and relays their packets over a direct WebRTC link. Helper cars appear in the host's Garage, standings and NPC grid like every other car. If the link drops, the helper stops its cars. |

All HybridDash code lives in `src/98i-hybriddash.js`; the original files only carry small hooks,
so upstream OmegaSim improvements can still be merged.

## Two-laptop mode (more cars)

1. Open HybridDash in Chrome or Edge on **both** laptops (same Wi-Fi). On the helper you can open `…/hybriddash/?helper` to jump straight in.
2. **Laptop A (host):** Garage → *Two laptops…* → *This laptop is the HOST* → *Create pairing code* → *Copy*.
3. Get the code to laptop B (any note, chat or e-mail) and paste it there under *This laptop is a HELPER* → *Create answer* → *Copy*.
4. Paste the answer on laptop A → *Connect*. Both show **LINKED**.
5. On laptop B press *Connect a car to this laptop* once per car. Each one appears in laptop A's Garage within a second.

Connect the cars you want on laptop A as usual. Each laptop's Bluetooth adapter holds roughly
7–9 cars, so two laptops carry about twice that. Keep the helper tab open and in front during a race.
The link is LAN only: no server, nothing leaves your network.

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
