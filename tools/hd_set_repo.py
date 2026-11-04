#!/usr/bin/env python3
"""Point every HybridDash link (APK download, update feed, 'Code on GitHub') at your fork.

    python3 tools/hd_set_repo.py OWNER/REPO
Then rebuild:  python3 tools/build.py
"""
import os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) != 2 or '/' not in sys.argv[1]:
    sys.exit(__doc__)
owner, repo = sys.argv[1].split('/', 1)
FILES = ['src/00-index.head.html', 'src/97b-app.js', 'README.md',
         'android-app/android/app/src/main/java/de/lroeseler/omegasim/OmegaUpdatePlugin.java']
for rel in FILES:
    p = os.path.join(R, rel)
    s = open(p, encoding='utf-8').read()
    n = s.replace('YOUR-GITHUB-USER.github.io/hybriddash', f'{owner.lower()}.github.io/{repo}') \
         .replace('YOUR-GITHUB-USER/hybriddash', f'{owner}/{repo}')
    if n != s:
        open(p, 'w', encoding='utf-8', newline='').write(n); print('updated', rel)
