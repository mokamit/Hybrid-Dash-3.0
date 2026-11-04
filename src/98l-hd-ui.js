  // =========================================================================
  // HybridDash 2.1: top-bar mute, controller presets (PlayStation / Xbox)
  // =========================================================================

  // ---- MUTE (top bar, right) --------------------------------------------------------------
  // REQUESTED: "Option in the main tab, on the right side to mute the sound."
  // One tap silences EVERYTHING - engine, announcements, effects - without touching the saved
  // "Engine sound" setting: the audio context is suspended, announcements are stopped and
  // blocked (soundEnabled false). Unmute restores soundEnabled from that setting.
  const HD_UI_STORE = 'hybriddash.ui.v1';
  const hdUi = (() => { try { return Object.assign({ stumm: false, padStil: 'auto' }, JSON.parse(localStorage.getItem(HD_UI_STORE) || '{}')); } catch (e) { return { stumm: false, padStil: 'auto' }; } })();
  function hdUiSpeichern() { try { localStorage.setItem(HD_UI_STORE, JSON.stringify(hdUi)); } catch (e) { /* private */ } }

  function hdStummAnwenden() {
    if (!hdUiBereit()) return;
    if (hdUi.stumm) {
      soundEnabled = false;
      try { if (typeof ansagenReset === 'function') ansagenReset(); } catch (e) { /* not ready */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* none */ }
      try { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend(); } catch (e) { /* none */ }
    } else {
      const el = $('sound-enable');
      soundEnabled = el ? !!el.checked : true;
      try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* none */ }
    }
    document.body.classList.toggle('hd-stumm', !!hdUi.stumm);
    const b = $('hd-stumm-knopf');
    if (b) { b.innerHTML = hdStummIcon(); b.setAttribute('aria-pressed', hdUi.stumm ? 'true' : 'false'); b.title = hdUi.stumm ? 'Sound off – tap to unmute' : 'Mute all sound'; }
  }
  function hdStummIcon() {
    const welle = hdUi.stumm
      ? '<path d="M16 9 L22 15 M22 9 L16 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M16 8.5 C18 10.5 18 13.5 16 15.5 M18.8 6 C22.2 9.5 22.2 14.5 18.8 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 9 H7 L12 4.5 V19.5 L7 15 H3 Z" fill="currentColor"/>' + welle + '</svg>';
  }
  function hdStummUmschalten() { hdUi.stumm = !hdUi.stumm; hdUiSpeichern(); hdStummAnwenden(); if (!hdUi.stumm && typeof showHudToast === 'function') showHudToast('Sound on'); }
  // The first tap anywhere unlocks (resumes) the audio context in 80-sound.js - and the guard
  // below keeps a muted app muted through that and anything else that resumes it.
  setInterval(() => { if (hdUi.stumm) { soundEnabled = false; try { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend(); } catch (e) { /* none */ } } }, 500);
  // Hook, called from the top-bar renderer (51-konsole.js) after the car count.
  function hdStummKnopf(st) {
    if (!hdUiBereit()) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'hd-stumm-knopf'; b.className = 'hd-top-knopf hd-stumm-knopf';
    b.setAttribute('data-i18n-skip', '');
    b.addEventListener('click', (e) => { e.stopPropagation(); hdStummUmschalten(); });
    st.appendChild(b);
    hdStummAnwenden();
  }
  // M on the keyboard toggles it too (not while typing).
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey
        && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) hdStummUmschalten();
  });
  hdStummAnwenden();

  // ---- CONTROLLER PRESETS: PlayStation / Xbox ---------------------------------------------
  // REQUESTED: "Have preset controller layouts for PS and Xbox controller layouts."
  // In the browser's Standard Gamepad mapping both controllers use the SAME button numbers
  // (0 = Cross/A, 1 = Circle/B, ...), so the factory mapping fits both. What differs is what
  // you see: the names of the buttons. A preset sets the style - every button name in the
  // bindings table, the controller picture and the safety-car prompt uses your controller's
  // own names (Cross or A, R2 or RT) - and offers to reset the mapping to the factory layout.
  // "Auto" picks the style from the connected controller.
  const HD_PAD_NAMEN = {
    ps:   ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create / Share', 'Options', 'L3', 'R3',
           'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'PS button', 'Touchpad'],
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS (press)', 'RS (press)',
           'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Xbox button', 'Share'],
  };
  const HD_PAD_ACHSEN = { 0: 'Left stick', 1: 'Left stick (vertical)', 2: 'Right stick', 3: 'Right stick (vertical)' };
  function hdPadErkannt() {
    try {
      for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) {
        if (!p || !p.id) continue;
        if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(p.id)) return 'ps';
        if (/045e|xbox|xinput/i.test(p.id)) return 'xbox';
      }
    } catch (e) { /* no API */ }
    return null;
  }
  // Hooks below can be called while the app is still loading, before this file has run (the
  // bindings table renders early). Then hdUi is not initialised yet: answer 'not yet' instead of
  // throwing - an exception here would abort the whole app's start-up.
  function hdUiBereit() { try { return !!hdUi; } catch (e) { return false; } }
  function hdPadStil() { if (!hdUiBereit()) return null; return hdUi.padStil === 'ps' || hdUi.padStil === 'xbox' ? hdUi.padStil : hdPadErkannt(); }
  // Hook used by bindingDescription() (90-ghosts.js). Returns null to keep the original label.
  function hdPadLabel(b) {
    const stil = hdPadStil();
    if (!stil || !b || b.type === 'none' || b.index < 0) return null;
    let name = b.type === 'axis' ? HD_PAD_ACHSEN[b.index] : HD_PAD_NAMEN[stil][b.index];
    if (!name) return null;
    if (b.type === 'axis' && b.invert) name += ' (inverted)';
    if (b.label && /halten|hold/i.test(b.label)) name += ', hold 1 s';
    return name;
  }

  // The controller picture: face-button symbols and the key captions follow the style.
  const HD_PAD_KEYS = {
    ps:   { 'L2 · LT': 'L2', 'L1 · LB': 'L1', 'Select · Share': 'Create / Share', 'Options · Start': 'Options',
            'L3 · Stick drücken': 'L3 · press stick', 'R3 · Stick drücken': 'R3 · press stick', 'R2 · RT': 'R2', 'R1 · RB': 'R1',
            'PS-Taste': 'PS button', 'Touchpad': 'Touchpad' },
    xbox: { 'L2 · LT': 'LT', 'L1 · LB': 'LB', 'Select · Share': 'View', 'Options · Start': 'Menu',
            'L3 · Stick drücken': 'LS · press stick', 'R3 · Stick drücken': 'RS · press stick', 'R2 · RT': 'RT', 'R1 · RB': 'RB',
            'PS-Taste': 'Xbox button', 'Touchpad': 'Share' },
  };
  const HD_PAD_SYM = { ps: { tri: '△', circ: '◯', cross: '✕', sq: '□' }, xbox: { tri: 'Y', circ: 'B', cross: 'A', sq: 'X' } };
  function hdPadBildAnwenden() {
    if (!hdUiBereit()) return;
    const stil = hdPadStil() || 'ps';
    document.body.classList.toggle('hd-pad-xbox', stil === 'xbox');
    document.querySelectorAll('.pad-svg .pad-key').forEach((el) => {
      if (!el.dataset.hdOrig) el.dataset.hdOrig = (i18nOrig.get(el.firstChild) || el.textContent).replace(/\s+/g, ' ').trim();
      const neu = HD_PAD_KEYS[stil][el.dataset.hdOrig];
      if (neu) { el.setAttribute('data-i18n-skip', ''); el.textContent = neu; }
    });
    for (const k of ['tri', 'circ', 'cross', 'sq']) {
      const act = $('pad-a-' + k);
      const sym = act && act.previousElementSibling;
      if (sym && sym.classList.contains('pad-sym')) { sym.setAttribute('data-i18n-skip', ''); sym.textContent = HD_PAD_SYM[stil][k]; }
    }
    // Xbox letters on the drawn face buttons (the PS symbols are hidden by CSS).
    const gruppe = document.querySelector('.pad-svg polygon.pad-mark') && document.querySelector('.pad-svg polygon.pad-mark').parentNode;
    if (gruppe && !gruppe.querySelector('.hd-xbox-buchstabe')) {
      const NS = 'http://www.w3.org/2000/svg';
      [['Y', 0, -30, '#e8c72a'], ['X', -30, 0, '#3b7fe2'], ['B', 30, 0, '#e23b3b'], ['A', 0, 30, '#35b45a']].forEach(([z, x, y, f]) => {
        const tx = document.createElementNS(NS, 'text');
        tx.setAttribute('x', x); tx.setAttribute('y', y + 6); tx.setAttribute('text-anchor', 'middle');
        tx.setAttribute('class', 'hd-xbox-buchstabe'); tx.setAttribute('fill', f); tx.textContent = z;
        gruppe.appendChild(tx);
      });
    }
    const wahl = document.querySelectorAll('[data-hd-padstil]');
    wahl.forEach((b) => b.classList.toggle('sel', b.dataset.hdPadstil === hdUi.padStil));
    const erk = $('hd-padstil-erkannt');
    if (erk) { const e = hdPadErkannt(); erk.textContent = hdUi.padStil === 'auto' ? (e ? 'Detected: ' + (e === 'ps' ? 'PlayStation' : 'Xbox') : 'No controller detected – showing PlayStation names') : ''; }
  }
  function hdPadStilSetzen(stil) {
    hdUi.padStil = stil; hdUiSpeichern();
    if (typeof renderBindTable === 'function') renderBindTable();
    hdPadBildAnwenden();
    if (stil === 'ps' || stil === 'xbox') {
      const name = stil === 'ps' ? 'PlayStation' : 'Xbox';
      if (window.confirm('Use the ' + name + ' preset?\n\nThis resets the button mapping to the factory layout (you can still change single buttons afterwards). Press "Apply" below the table to keep it.')) {
        const r = $('bind-reset'); if (r) r.click();
      }
    }
  }
  (function hdPadAnbinden() {
    document.querySelectorAll('[data-hd-padstil]').forEach((b) => b.addEventListener('click', () => hdPadStilSetzen(b.dataset.hdPadstil)));
    window.addEventListener('gamepadconnected', () => { if (hdUi.padStil === 'auto') { if (typeof renderBindTable === 'function') renderBindTable(); hdPadBildAnwenden(); } });
    hdPadBildAnwenden();
  })();

  window.HYBRIDDASH_UI = Object.freeze({
    stumm: (an) => { if (an !== undefined) { hdUi.stumm = !!an; hdUiSpeichern(); hdStummAnwenden(); } return hdUi.stumm; },
    padStil: (s) => { if (s) { hdUi.padStil = s; hdUiSpeichern(); if (typeof renderBindTable === 'function') renderBindTable(); hdPadBildAnwenden(); } return hdPadStil(); },
    label: (b) => bindingDescription(b),
  });
