#!/usr/bin/env python3
"""HybridDash 2.0: one-shot rebrand of the OmegaSim sources (idempotent).

Run:  python3 tools/hd_rebrand.py
Then: python3 tools/hd_set_repo.py OWNER/REPO   (points update/APK/code links at your fork)
"""
import os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PH = 'YOUR-GITHUB-USER/hybriddash'          # replaced by hd_set_repo.py
PH_PAGES = 'https://YOUR-GITHUB-USER.github.io/hybriddash/'

def edit(rel, pairs, count_check=True):
    p = os.path.join(R, rel)
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        if a not in s:
            if b in s: continue           # already applied
            sys.exit(f'{rel}: pattern not found: {a[:70]!r}')
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='').write(s)

edit('src/00-index.head.html', [
    ('<title>OmegaSim</title>', '<title>HybridDash 2.0</title>'),
    ('<div class="home-titel" aria-label="OMEGA SIM" data-i18n-skip>',
     '<div class="home-titel" aria-label="HYBRIDDASH 2.0" data-i18n-skip>'),
    ('<span class="home-omega" data-t="&Omega;" aria-hidden="true">&Omega;</span>',
     '<span class="home-omega hd-omega" data-t="2.0" aria-hidden="true">2.0</span>'),
    ('<span class="home-titel-text k-glitch-blau" data-text="OMEGA">OMEGA</span><span\n        class="home-titel-text k-glitch-rot" data-text="SIM">SIM</span>',
     '<span class="home-titel-text k-glitch-blau" data-text="HYBRID">HYBRID</span><span\n        class="home-titel-text k-glitch-rot" data-text="DASH">DASH</span>'),
    ('href="https://github.com/LukasRoeseler/btsr/releases/latest/download/OmegaSim.apk"',
     f'href="https://github.com/{PH}/releases/latest/download/HybridDash.apk"'),
    ('href="https://github.com/LukasRoeseler/btsr/releases/latest"',
     f'href="https://github.com/{PH}/releases/latest"'),
    ('<span data-i18n-skip>OmegaSim &middot; MIT</span>\n        <a class="foot-code" href="https://github.com/Luuke42/omegasim"',
     f'<span data-i18n-skip>HybridDash 2.0 &middot; MIT &middot; based on <a href="https://github.com/Luuke42/omegasim" target="_blank" rel="noopener noreferrer">OmegaSim</a> by Luuke</span>\n        <a class="foot-code" href="https://github.com/{PH}"'),
    ('<h1 data-i18n-skip>OMEGA SIM</h1>', '<h1 data-i18n-skip>HYBRIDDASH 2.0</h1>'),
])
edit('src/97b-app.js', [
    ("if (/(^|\\.)luuke42\\.github\\.io$/i.test(location.hostname)) {\n      const info = $('app-apk-link');\n      a.href = 'https://github.com/Luuke42/omegasim/releases/latest/download/OmegaSim.apk';\n      if (info) info.href = 'https://github.com/Luuke42/omegasim/releases/latest';",
     f"{{\n      const info = $('app-apk-link');\n      a.href = 'https://github.com/{PH}/releases/latest/download/HybridDash.apk';\n      if (info) info.href = 'https://github.com/{PH}/releases/latest';"),
])
edit('src/60c-streckenbild.js', [("'OMEGA SIM', BILD_W - 60", "'HYBRIDDASH 2.0', BILD_W - 60")])
# English is the default language (the translation table already exists in the app).
edit('src/10-ble-explorer.js', [
    ("const saved = localStorage.getItem('omegasim-lang');\n    if (saved && saved !== lang) setLang(saved);",
     "const saved = localStorage.getItem('omegasim-lang') || 'en'; // HybridDash: English by default\n    if (saved && saved !== lang) setLang(saved);"),
])
edit('manifest.webmanifest', [
    ('"name": "OmegaSim"', '"name": "HybridDash 2.0"'),
    ('"short_name": "OmegaSim"', '"short_name": "HybridDash"'),
    ('"description": "Cockpit, Physik und Rennleitung für Carrera-Hybrid-Autos, im Browser."',
     '"description": "Cockpit, physics and race control for Carrera Hybrid cars, in the browser."'),
    ('"lang": "de"', '"lang": "en"'),
])
edit('sw.js', [("'omegasim-' + VERSION", "'hybriddash-' + VERSION"),
               ("name.startsWith('omegasim-') && name !== CACHE", "(name.startsWith('hybriddash-') || name.startsWith('omegasim-')) && name !== CACHE")])
edit('android-app/capacitor.config.json', [
    ('"appId": "de.lroeseler.omegasim"', '"appId": "com.hybriddash.app"'),
    ('"appName": "OmegaSim"', '"appName": "HybridDash"'),
    ('"scanning": "Suche Autos ..."', '"scanning": "Searching for cars ..."'),
    ('"cancel": "Abbrechen"', '"cancel": "Cancel"'),
    ('"availableDevices": "Gefundene Autos"', '"availableDevices": "Cars found"'),
    ('"noDeviceFound": "Kein Auto gefunden"', '"noDeviceFound": "No car found"'),
])
A = 'android-app/android/app/'
J = A + 'src/main/java/de/lroeseler/omegasim/'
# Java package (namespace) stays de.lroeseler.omegasim; only the installable id changes,
# so HybridDash installs next to OmegaSim instead of over it.
edit(A + 'build.gradle', [('applicationId "de.lroeseler.omegasim"', 'applicationId "com.hybriddash.app"')])
edit(A + 'src/main/res/values/strings.xml', [
    ('<string name="app_name">OmegaSim</string>', '<string name="app_name">HybridDash</string>'),
    ('<string name="title_activity_main">OmegaSim</string>', '<string name="title_activity_main">HybridDash 2.0</string>'),
    ('<string name="package_name">de.lroeseler.omegasim</string>', '<string name="package_name">com.hybriddash.app</string>'),
    ('<string name="custom_url_scheme">de.lroeseler.omegasim</string>', '<string name="custom_url_scheme">com.hybriddash.app</string>'),
])
edit(J + 'OmegaUpdatePlugin.java', [('QUELLE = "https://lukasroeseler.github.io/btsr/"', f'QUELLE = "{PH_PAGES}"')])
edit(J + 'OmegaSicherungPlugin.java', [
    ('NAME = "OmegaSim-Sicherung.json"', 'NAME = "HybridDash-Backup.json"'),
    ('ORDNER = "OmegaSim"', 'ORDNER = "HybridDash"'),
])
edit(J + 'OmegaHostService.java', [('.setContentTitle("OmegaSim-Host läuft")', '.setContentTitle("HybridDash host running")')])
print('rebrand ok')
