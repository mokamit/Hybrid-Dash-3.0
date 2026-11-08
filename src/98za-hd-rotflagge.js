  // =====================================================================================
  // Hybrid-Dash 3.0: RED FLAG SUGGESTION - half the field out, or a pile-up
  // =====================================================================================
  //
  // BESTELLT: "If more than 50% of the cars are off the track or crashed, have a pop up to deploy the red flag. Or if
  // there is a huge pile up."
  //
  // Watched on its own slow clock while a race runs (green or yellow, not in the formation lap, not while the red flag
  // is already out), with the same rules the automatic safety car uses (98i-hybriddash.js):
  //   who counts   every car that races (players 1-3, NPCs, challenger); not the safety car, not a car in the pit, not
  //                a car that has finished or was retired by race control (hdDnfAuto).
  //   out          off the track (byte 12 = 0x00) or parked by the NPC logic for HD_ROT_AUS_MS, or - once it has
  //                driven since the green (armed) - no tile change for the safety-car window: a crash / stuck car.
  //   suggest when more than half the field is out (and at least two cars), or
  //                a PILE-UP: HD_ROT_MASSE_AUTOS cars went out within HD_ROT_MASSE_MS.
  // The prompt ("Show the red flag?") names the cars. Y / Triangle (the confirm button) or Enter shows the red flag
  // (race control's red flag, hdRlRot: the race is stopped); B / Circle or Esc ignores it until the situation gets
  // worse (more cars out). It closes by itself when enough cars are going again. On by default; Options > Race.
  const HD_ROT_STORE = 'hybriddash.rotflagge.v1';
  const HD_ROT_AUS_MS = 2000, HD_ROT_MASSE_AUTOS = 3, HD_ROT_MASSE_MS = 5000, HD_ROT_GNADE_MS = 6000;
  const hdRot = { aus: new Map(), ausgefallen: [], frage: null, ignoriertBei: 0, gruenSeit: 0, letzterFlag: 'green', bVorher: false, yVorher: false, bGesperrt: false };
  function hdRotAn() { try { return localStorage.getItem(HD_ROT_STORE) !== 'aus'; } catch (e) { return true; } }
  function hdRotFrageOffen() { return !!hdRot.frage; }
  function hdRotSuite() { try { return typeof hdSuiteLaeuft === 'function' && hdSuiteLaeuft(); } catch (e) { return false; } }
  // The cars that race right now (see hdRenntAuto), plus NPCs the ghost logic parked off the track - those are out,
  // not gone.
  function hdRotFeld() {
    const feld = [];
    try {
      for (const c of garage) {
        if (!c || !c.device) continue;
        if (!/^(player\d?|ghost|challenger)$/.test(c.role || '')) continue;
        if (typeof hdDnfAuto === 'function' && hdDnfAuto(c)) continue;
        const g = c.ghost;
        if (g && (g.nachZiel || g.auslauf || g.finish)) continue;
        if (c.parked || (typeof hdRenntAuto === 'function' && hdRenntAuto(c))) feld.push(c);
      }
    } catch (e) { /* not ready */ }
    return feld;
  }
  function hdRotIstAus(car, now) {
    const neben = car.parked || car.tileCode === TILE_OFFTRACK;
    if (neben) {
      if (!hdRot.aus.has(car)) hdRot.aus.set(car, now);
      if (now - hdRot.aus.get(car) >= HD_ROT_AUS_MS) return true;
    } else hdRot.aus.delete(car);
    // Crashed / stuck: an armed car whose tile counter has not moved for the safety-car window.
    try {
      if (typeof hdScharf === 'function' && hdScharf(car)) {
        const seit = Math.max(car.tileAt || 0, hdRot.gruenSeit);
        const fenster = typeof hdAutoScFenster === 'function' ? hdAutoScFenster() : 3000;
        if (seit && now - seit >= fenster) return true;
      }
    } catch (e) { /* not ready */ }
    return false;
  }
  function hdRotTick() {
    if (hdRotSuite() || hdRot.probe) return;
    let now;
    try { now = rennZeitJetzt(); } catch (e) { return; }
    let rennt = false;
    try {
      rennt = raceState === 'racing' && !raceFormationLap && !(typeof rennPauseAktiv === 'function' && rennPauseAktiv())
        && (flagState === 'green' || flagState === 'yellow') && trackMode === 'on';
    } catch (e) { rennt = false; }
    // Every green (start or restart): grace period, clean slate.
    try { if (flagState === 'green' && hdRot.letzterFlag !== 'green') { hdRot.gruenSeit = now; hdRot.aus.clear(); hdRot.ausgefallen = []; } hdRot.letzterFlag = flagState; } catch (e) { /* not ready */ }
    if (!rennt || !hdRotAn()) { hdRotZu(); hdRot.ignoriertBei = 0; if (!rennt) { hdRot.gruenSeit = 0; hdRot.aus.clear(); hdRot.ausgefallen = []; } return; }
    if (!hdRot.gruenSeit) hdRot.gruenSeit = now;
    const feld = hdRotFeld();
    const aus = feld.filter((c) => hdRotIstAus(c, now));
    // Pile-up: when did each car go out (the moment it first counts as out)?
    aus.forEach((c) => { if (!hdRot.ausgefallen.some((x) => x.car === c)) hdRot.ausgefallen.push({ car: c, at: now }); });
    hdRot.ausgefallen = hdRot.ausgefallen.filter((x) => aus.includes(x.car));
    const frisch = hdRot.ausgefallen.filter((x) => now - x.at <= HD_ROT_MASSE_MS).length;
    const haelfte = feld.length >= 2 && aus.length >= 2 && aus.length > feld.length / 2;
    const masse = frisch >= HD_ROT_MASSE_AUTOS;
    const grund = masse ? 'masse' : haelfte ? 'haelfte' : null;
    if (now - hdRot.gruenSeit < HD_ROT_GNADE_MS) return;
    if (hdRot.frage) {
      if (!grund) hdRotZu(); else hdRotMalen(aus, feld, grund);
      return;
    }
    if (!grund) { if (aus.length < hdRot.ignoriertBei) hdRot.ignoriertBei = 0; return; }
    if (hdRot.ignoriertBei && aus.length <= hdRot.ignoriertBei) return;   // ignored: only again if it gets worse
    hdRotAuf(aus, feld, grund);
  }
  function hdRotMalen(aus, feld, grund) {
    const wer = $('hd-rot-frage-wer');
    if (!wer) return;
    const namen = aus.map((c) => garageLabel(c)).join(', ');
    wer.textContent = (grund === 'masse' ? t('Massenunfall') + ' · ' : '') + t('{n} von {m} Autos neben der Strecke oder verunfallt').replace('{n}', aus.length).replace('{m}', feld.length) + (namen ? ': ' + namen : '');
    hdRot.frage.aus = aus.length;
  }
  function hdRotAuf(aus, feld, grund) {
    const box = $('hd-rot-frage');
    if (!box) return;
    if (typeof hdScFrageZu === 'function') hdScFrageZu();   // one question at a time - the bigger one wins
    hdRot.frage = { grund, aus: aus.length };
    hdRotMalen(aus, feld, grund);
    box.hidden = false;
    hdRot.yVorher = true;   // a Y already held (e.g. from the safety-car prompt) must be let go first
    log('HybridDash: red flag suggested - ' + aus.length + ' of ' + feld.length + ' cars out' + (grund === 'masse' ? ' (pile-up)' : '') + '.', 'err');
    try { if (typeof hdSprechen === 'function') hdSprechen(lang === 'de' ? 'Mehrere Autos stehen. Rote Flagge?' : lang === 'es' ? 'Varios coches parados. ¿Bandera roja?' : 'Several cars are stopped. Red flag?', 20); } catch (e) { /* no voice */ }
    try { if (typeof padRumble === 'function') padRumble(0.5, 0.5, 300); } catch (e) { /* no pad */ }
  }
  function hdRotZu() {
    const box = $('hd-rot-frage');
    if (box) box.hidden = true;
    hdRot.frage = null;
  }
  function hdRotZeigen() {
    if (!hdRot.frage) return;
    hdRotZu();
    hdRot.probe = false;
    hdRot.ignoriertBei = 0;
    if (typeof hdRlRot === 'function') hdRlRot();
  }
  function hdRotIgnorieren() {
    if (!hdRot.frage) return;
    hdRot.ignoriertBei = hdRot.frage.aus || 1;
    hdRotZu();
    hdRot.probe = false;
    log('HybridDash: red flag suggestion ignored.', 'info');
  }
  // B must not shift up while it answers this prompt (read by hdScTasteGesperrt in 98i-hybriddash.js).
  function hdRotTasteB() { return !!hdRot.frage || hdRot.bGesperrt; }
  // Controller: the confirm button (Y) shows the red flag, B ignores (rising edges, any connected pad).
  setInterval(() => {
    let y = false, bTaste = false;
    try {
      const bc = typeof bindings === 'object' && bindings && bindings.confirm;
      if (navigator.getGamepads) for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        if (bc && bc.type !== 'none' && readBindingValue(pad, bc) > BUTTON_CAPTURE_THRESHOLD) y = true;
        if (pad.buttons[1] && pad.buttons[1].pressed) bTaste = true;
      }
    } catch (e) { /* no gamepad API */ }
    if (hdRot.frage) {
      if (y && !hdRot.yVorher) hdRotZeigen();
      else if (bTaste && !hdRot.bVorher) { hdRotIgnorieren(); hdRot.bGesperrt = true; }
    }
    if (!bTaste) hdRot.bGesperrt = false;
    hdRot.yVorher = y; hdRot.bVorher = bTaste;
  }, 40);
  setInterval(() => { try { hdRotTick(); } catch (e) { /* never break the race */ } }, 250);
  document.addEventListener('keydown', (e) => {
    if (!hdRot.frage) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); hdRotZeigen(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hdRotIgnorieren(); }
  }, true);
  (function () {
    const ja = $('hd-rot-frage-ja'), nein = $('hd-rot-frage-nein'), sw = $('hd-rot-vorschlag');
    if (ja) ja.addEventListener('click', hdRotZeigen);
    if (nein) nein.addEventListener('click', hdRotIgnorieren);
    if (sw) {
      sw.checked = hdRotAn();
      sw.addEventListener('change', () => { try { localStorage.setItem(HD_ROT_STORE, sw.checked ? 'an' : 'aus'); } catch (e) { /* private */ } if (!sw.checked) hdRotZu(); });
    }
  })();

  // ---- post-race NPC run-off: how long they accelerate after turning out (98o-hd-boxen.js) --------------------------
  // BESTELLT: "Adjust the post race NPC sequence, have an option to adjust how long they will accelerate for. Between 1
  // to 5 seconds."
  const HD_ZIEL_RAUS_STORE = 'hybriddash.zielraus.v1';
  let hdZielRausWert = (() => { try { const v = parseFloat(localStorage.getItem(HD_ZIEL_RAUS_STORE)); return isFinite(v) ? Math.max(1, Math.min(5, v)) : 1.5; } catch (e) { return 1.5; } })();
  function hdZielRausMs() { return Math.round(hdZielRausWert * 1000); }
  (function () {
    const r = $('hd-ziel-raus'), w = $('hd-ziel-raus-val');
    if (!r) return;
    const zeigen = () => { if (w) w.textContent = hdZielRausWert.toFixed(1) + ' s'; };
    r.value = String(hdZielRausWert); zeigen();
    r.addEventListener('input', () => {
      hdZielRausWert = Math.max(1, Math.min(5, parseFloat(r.value) || 1.5));
      try { localStorage.setItem(HD_ZIEL_RAUS_STORE, String(hdZielRausWert)); } catch (e) { /* private */ }
      zeigen();
    });
  })();
  window.HYBRIDDASH_ROTFLAGGE = Object.freeze({ offen: hdRotFrageOffen, _feld: () => hdRotFeld().length, _zielRausMs: hdZielRausMs,
    _test: (n, m, grund) => { hdRot.probe = true; hdRotAuf(Array.from({ length: n }, () => ({ device: { id: 'x' }, alias: 'Test' })), Array(m), grund || 'haelfte'); } });
