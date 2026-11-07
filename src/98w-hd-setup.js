  // =====================================================================================
  // Hybrid-Dash 3.0: PRE-RACE SETUP - check the car before every session
  // =====================================================================================
  //
  // BESTELLT: "A pre-race set up: before each session, have a screen that allows you to double check the settings of
  // your car, such as tyre selection, steering and other tunable things for the car."
  //
  // The start asks first - at the grid board (raceGridAnzeigen) or, for starts without it, in startRaceCountdown
  // (70-race.js). When the screen is wanted it opens instead, and "Start" continues the very same start. Not shown for a multiplayer start
  // plan, a challenge, without a Player 1 car, while the self-test suite runs, or when switched off ("Show before
  // every session" on the screen itself).
  //
  // The settings are not copies: every control MIRRORS the real one in Options (same options, range and step) and
  // writes back to it with the usual input / change events - so the presets, the per-player logic and the saving all
  // keep working exactly as from Options. Tyres and pit fuel use the race's own state (tyres + applySurface, the pit
  // pre-selection pitVorwahl.refuel).
  const HD_SETUP_STORE = 'hybriddash.setup.v1';
  const HD_SETUP_SPIEGEL = [
    // [group, option control id]
    ['Fahren', 'driver-assist'], ['Fahren', 'setting-gearbox'], ['Fahren', 'hd-gangstufe'], ['Fahren', 'setting-autoshift'],
    ['Lenkung & Bremse', 'phys-steerresp'], ['Lenkung & Bremse', 'setting-steer-calib'], ['Lenkung & Bremse', 'setting-brakebias'], ['Lenkung & Bremse', 'setting-brakepower'],
    ['Auto', 'setting-topspeed-kmh'], ['Auto', 'setting-grip'], ['Auto', 'setting-tyre-pressure'], ['Auto', 'setting-tyre-blankets'],
    // v3.0 BESTELLT: "In the pre-race set up screen, have settings to adjust NPC settings too. Like their difficulty, top
    // speed..." - the main ones from Options > NPCs (all of them stay there).
    ['NPCs', 'ghost-speed'], ['NPCs', 'ghost-max-gerade'], ['NPCs', 'ghost-hardness'], ['NPCs', 'ghost-curve'], ['NPCs', 'ghost-streuung'],
    ['NPCs', 'ghost-w-fehler'], ['NPCs', 'ghost-w-defend'], ['NPCs', 'ghost-pit'],
  ];
  // Difficulty per NPC car = its pace level (GHOST_TEMPO_STUFEN, the same as "NPC pace" in the garage card).
  function hdSetupNpcs() { try { return garage.filter((c) => c && c.device && c.role === 'ghost'); } catch (e) { return []; } }
  function hdSetupStufe(c) { return (c.ghostStufe === undefined || c.ghostStufe === null) ? 1 : c.ghostStufe; }
  function hdSetupStufeSetzen(cars, k) {
    cars.forEach((c) => { c.ghostStufe = k; if (typeof carRolleMerken === 'function') carRolleMerken(c); });
    if (typeof renderGarage === 'function') renderGarage();
  }
  function hdSetupStufenChips(aktiv, attr) {
    return '<span class="hds-chips">' + GHOST_TEMPO_STUFEN.map((st, k) => '<button type="button" ' + attr + ' data-k="' + k + '"' + (k === aktiv ? ' class="an"' : '') + '>'
      + hdSetupEsc(st.max ? 'MAX' : t(st.label)) + '</button>').join('') + '</span>';
  }
  function hdSetupNpcHtml() {
    const npcs = hdSetupNpcs();
    if (!npcs.length) return '<p class="hds-leer">' + hdSetupEsc(t('Keine NPCs in der Garage – gib einem Auto die Rolle NPC.')) + '</p>';
    const alle = npcs.every((c) => hdSetupStufe(c) === hdSetupStufe(npcs[0])) ? hdSetupStufe(npcs[0]) : -1;
    let h = '<div class="hds-z"><span class="hds-l">' + hdSetupEsc(t('Schwierigkeit für alle')) + '</span>' + hdSetupStufenChips(alle, 'data-hds-alle="1"') + '</div>';
    h += '<div class="hds-npcs">' + npcs.map((c) => {
      const f = carColor(c);
      return '<div class="hds-npc" style="--f:' + hdSetupEsc(f.hex) + '"><span class="hds-npc-bild">' + (typeof hdAvatarFuerAuto === 'function' ? hdAvatarFuerAuto(c, 36) : '') + '</span>'
        + '<span class="hds-npc-name">' + hdSetupEsc(c.alias || c.tag || garageLabel(c)) + '</span>'
        + hdSetupStufenChips(hdSetupStufe(c), 'data-hds-npc="' + hdSetupEsc(String(c.device.id)) + '"') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  // hdSetupFreigabe: when the screen was passed (Start pressed). The start then goes on - grid board first
  // (raceGridAnzeigen), then the lights (startRaceCountdown); both hooks let it through for HD_SETUP_FREI_MS, and the
  // race start uses it up, so the next session asks again.
  const HD_SETUP_FREI_MS = 120000;
  let hdSetupFreigabe = 0, hdSetupBox = null, hdSetupWeiter = null, hdSetupPadVorher = {};
  function hdSetupAn() { try { return localStorage.getItem(HD_SETUP_STORE) !== 'aus'; } catch (e) { return true; } }
  function hdSetupEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function hdSetupNoetig(gruenZiel, mpPlan) {
    if (!hdSetupAn() || Date.now() - hdSetupFreigabe < HD_SETUP_FREI_MS) return false;
    try {
      if (hdSuiteLaeuft()) return false;
      if (mpPlan || typeof gruenZiel === 'number') return false;
      if (typeof challengeLaeuft === 'function' && challengeLaeuft()) return false;
      if (raceState !== 'idle' && raceState !== 'finished') return false;
      if (!playerCar && !garage.some((c) => c && c.role === 'player')) return false;
    } catch (e) { return false; }
    return true;
  }
  // Hook from raceGridAnzeigen (the grid board comes after the setup).
  function hdSetupVorGrid(weiter) {
    if (!hdSetupNoetig()) return false;
    hdSetupWeiter = () => raceGridAnzeigen(weiter);
    hdSetupOeffnen();
    return true;
  }
  // Hook from startRaceCountdown (starts that skip the grid board). Uses up the pass.
  function hdSetupVorStart(gruenZiel, mpPlan) {
    if (!hdSetupNoetig(gruenZiel, mpPlan)) { hdSetupFreigabe = 0; return false; }
    hdSetupWeiter = () => startRaceCountdown(gruenZiel, mpPlan);
    hdSetupOeffnen();
    return true;
  }

  // ---- mirrored controls -------------------------------------------------------------------------------------------
  function hdSetupLabel(el) {
    const row = el.closest('.opt-row');
    const l = row && row.querySelector('.opt-label');
    if (!l) return el.id;
    const c = l.cloneNode(true);
    c.querySelectorAll('button, small, .wip-tag, .opt-info-btn, .exp-tag, .opt-info-versteckt').forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function hdSetupWertText(el) {
    const v = document.getElementById(el.id + '-val');
    if (v && v.textContent.trim()) return v.textContent.trim();
    return el.value;
  }
  function hdSetupZeile(id) {
    const el = document.getElementById(id);
    if (!el || !el.closest('.opt-row')) return '';
    const info = el.closest('.opt-row').querySelector('.opt-info-versteckt');
    const lab = '<span class="hds-l"' + (info ? ' title="' + hdSetupEsc(info.textContent.replace(/\s+/g, ' ').trim()) + '"' : '') + '>' + hdSetupEsc(hdSetupLabel(el)) + '</span>';
    if (el.tagName === 'SELECT') {
      return '<label class="hds-z">' + lab + '<select data-hds="' + id + '">'
        + [...el.options].filter((o) => !o.hidden).map((o) => '<option value="' + hdSetupEsc(o.value) + '"' + (o.selected ? ' selected' : '') + (o.disabled ? ' disabled' : '') + '>'
          + hdSetupEsc(o.textContent.trim()) + '</option>').join('') + '</select></label>';
    }
    if (el.type === 'checkbox') {
      return '<label class="hds-z">' + lab + '<span class="tgl"><input type="checkbox" data-hds="' + id + '"' + (el.checked ? ' checked' : '') + '><span></span></span></label>';
    }
    if (el.type === 'range') {
      return '<label class="hds-z hds-regler">' + lab + '<span class="hds-w" data-hds-w="' + id + '">' + hdSetupEsc(hdSetupWertText(el)) + '</span>'
        + '<input type="range" data-hds="' + id + '" min="' + el.min + '" max="' + el.max + '" step="' + (el.step || 'any') + '" value="' + el.value + '"></label>';
    }
    return '';
  }
  function hdSetupSchreiben(ctl) {
    const el = document.getElementById(ctl.dataset.hds);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = ctl.checked; else el.value = ctl.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const w = hdSetupBox && hdSetupBox.querySelector('[data-hds-w="' + el.id + '"]');
    if (w) w.textContent = hdSetupWertText(el);
  }

  // ---- the screen ----------------------------------------------------------------------------------------------------
  function hdSetupHtml() {
    const car = playerCar || garage.find((c) => c && c.role === 'player') || null;
    const name = car ? (car.alias || car.tag || garageLabel(car)) : '';
    const nr = car && typeof hdNummer === 'function' ? hdNummer(car) : '';
    const bild = car && typeof hdAvatarFuerAuto === 'function' ? hdAvatarFuerAuto(car, 72) : '';
    const m = RACE_MODES[raceMode] || { label: raceMode, unit: '' };
    const sitzung = t(m.label) + ' · ' + (raceLimit ? raceLimit + ' ' + t(m.unit || '') : '∞') + ' · '
      + ({ dry: t('Trocken'), rain: t('Regen'), wechsel: t('Wechselhaft') }[raceWxStart] || raceWxStart);
    // Tyres to start on, and the fuel for the pit stop.
    const mischungen = ['weich', 'mittel', 'hart', 'regen'].filter((x) => typeof mischungErlaubt !== 'function' || mischungErlaubt(x) === x);
    const reifen = '<div class="hds-z"><span class="hds-l">' + hdSetupEsc(t('Reifen zum Start')) + '</span><span class="hds-chips">'
      + mischungen.map((x) => '<button type="button" data-hds-reifen="' + x + '"' + (tyres === x ? ' class="an"' : '') + ' style="--m:' + hdSetupEsc(typeof mischungFarbe === 'function' ? mischungFarbe(x) : '#888') + '">'
        + hdSetupEsc(typeof mischungName === 'function' ? mischungName(x) : x) + '</button>').join('') + '</span></div>';
    const tankJetzt = typeof pitVorwahlIst === 'function' ? tankZielNorm(pitVorwahlIst('refuel')) : 0;
    const tank = '<div class="hds-z"><span class="hds-l">' + hdSetupEsc(t('Tanken beim Boxenstopp')) + '</span><span class="hds-chips">'
      + TANK_STUFEN.map((x) => '<button type="button" data-hds-tank="' + x + '"' + (tankJetzt === x ? ' class="an"' : '') + '>' + hdSetupEsc(tankZielWort(x)) + '</button>').join('') + '</span></div>';
    // Driving feel preset.
    let preset = '';
    try {
      const keys = window.__presetKeysFahren ? window.__presetKeysFahren() : [];
      const akt = window.__presetActive ? window.__presetActive() : null;
      if (keys.length) preset = '<label class="hds-z"><span class="hds-l">' + hdSetupEsc(t('Fahrgefühl')) + '</span><select data-hds-preset="1">'
        + (akt && keys.includes(akt) ? '' : '<option value="" selected>' + hdSetupEsc(t('eigene Einstellung')) + '</option>')
        + keys.map((k) => '<option value="' + hdSetupEsc(k) + '"' + (k === akt ? ' selected' : '') + '>' + hdSetupEsc(window.__presetLabel(k)) + '</option>').join('') + '</select></label>';
    } catch (e) { preset = ''; }
    const gruppen = {};
    HD_SETUP_SPIEGEL.forEach(([g, id]) => { const z = hdSetupZeile(id); if (z) (gruppen[g] = gruppen[g] || []).push(z); });
    const gruppe = (titel, inhalt) => '<section class="hds-gruppe"><h3>' + hdSetupEsc(t(titel)) + '</h3>' + inhalt + '</section>';
    return '<div class="hds-karte">'
      + '<div class="hds-kopf"><span class="hds-bild">' + bild + '</span><div><small>' + hdSetupEsc(t('Vor dem Start')) + '</small>'
      + '<b>' + (nr ? '#' + hdSetupEsc(nr) + ' ' : '') + hdSetupEsc(name) + '</b><span>' + hdSetupEsc(sitzung) + '</span></div></div>'
      + '<div class="hds-gitter">'
      + gruppe('Reifen & Tank', reifen + tank)
      + gruppe('Fahren', preset + (gruppen['Fahren'] || []).join(''))
      + gruppe('Lenkung & Bremse', (gruppen['Lenkung & Bremse'] || []).join(''))
      + gruppe('Auto', (gruppen['Auto'] || []).join(''))
      + '<section class="hds-gruppe hds-npc-gruppe"><h3>' + hdSetupEsc(t('NPCs')) + '</h3>' + hdSetupNpcHtml() + '<div class="hds-npc-regler">' + (gruppen['NPCs'] || []).join('') + '</div></section>'
      + '</div>'
      + '<div class="hds-fuss"><label class="hds-immer"><input type="checkbox" data-hds-immer="1"' + (hdSetupAn() ? ' checked' : '') + '> '
      + hdSetupEsc(t('Vor jeder Sitzung zeigen')) + '</label>'
      + '<button type="button" data-hds-akt="zurueck">' + hdSetupEsc(t('Zurückgehen')) + '</button>'
      + '<button type="button" class="primary" data-hds-akt="start">' + hdSetupEsc(t('Start')) + ' &#9654;</button></div></div>';
  }
  function hdSetupMalen() { if (hdSetupBox && !hdSetupBox.hidden) hdSetupBox.innerHTML = hdSetupHtml(); }
  function hdSetupOeffnen() {
    if (!hdSetupBox) {
      hdSetupBox = document.createElement('div');
      hdSetupBox.id = 'hd-setup'; hdSetupBox.className = 'hd-setup';
      hdSetupBox.setAttribute('role', 'dialog'); hdSetupBox.setAttribute('aria-modal', 'true'); hdSetupBox.setAttribute('data-i18n-skip', '');
      document.body.appendChild(hdSetupBox);
      hdSetupBox.addEventListener('click', hdSetupKlick);
      hdSetupBox.addEventListener('input', hdSetupEingabe);
      hdSetupBox.addEventListener('change', hdSetupEingabe);
    }
    hdSetupBox.hidden = false;
    hdSetupPadVorher = { a: true, b: true };   // a held button from the start press must be released first
    hdSetupMalen();
  }
  function hdSetupZu() { if (hdSetupBox) hdSetupBox.hidden = true; hdSetupWeiter = null; }
  function hdSetupStart() {
    const w = hdSetupWeiter;
    if (hdSetupBox) hdSetupBox.hidden = true;
    hdSetupWeiter = null;
    hdSetupFreigabe = Date.now();
    if (w) w();
  }
  function hdSetupKlick(e) {
    if (e.target === hdSetupBox) return;   // no closing by a stray click on the backdrop
    const r = e.target.closest('[data-hds-reifen]');
    if (r) { tyres = r.dataset.hdsReifen; mischungWunsch = null; if (typeof applySurface === 'function') applySurface(); hdSetupMalen(); return; }
    const k = e.target.closest('[data-hds-tank]');
    if (k) { if (typeof pitVorwahl === 'object' && pitVorwahl) pitVorwahl.refuel = Number(k.dataset.hdsTank); hdSetupMalen(); return; }
    const ga = e.target.closest('[data-hds-alle]');
    if (ga) { hdSetupStufeSetzen(hdSetupNpcs(), +ga.dataset.k); hdSetupMalen(); return; }
    const gn = e.target.closest('[data-hds-npc]');
    if (gn) { hdSetupStufeSetzen(hdSetupNpcs().filter((c) => String(c.device.id) === gn.dataset.hdsNpc), +gn.dataset.k); hdSetupMalen(); return; }
    const a = e.target.closest('[data-hds-akt]');
    if (a) { if (a.dataset.hdsAkt === 'start') hdSetupStart(); else hdSetupZu(); }
  }
  function hdSetupEingabe(e) {
    const c = e.target;
    if (c.dataset.hds) { hdSetupSchreiben(c); return; }
    if (c.dataset.hdsPreset !== undefined && e.type === 'change') {
      if (c.value && window.__applyPreset) { window.__applyPreset(c.value); setTimeout(hdSetupMalen, 50); }
      return;
    }
    if (c.dataset.hdsImmer !== undefined) { try { localStorage.setItem(HD_SETUP_STORE, c.checked ? 'an' : 'aus'); } catch (err) { /* private */ } }
  }
  document.addEventListener('keydown', (e) => {
    if (!hdSetupBox || hdSetupBox.hidden) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.key !== 'Escape') return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); hdSetupStart(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hdSetupZu(); }
  }, true);
  // Controller: confirmation button (A / Cross) starts, B / Circle goes back - on a fresh press.
  setInterval(() => {
    if (!hdSetupBox || hdSetupBox.hidden) return;
    let a = false, b = false;
    try {
      for (const pad of (navigator.getGamepads ? navigator.getGamepads() : [])) {
        if (!pad) continue;
        a = a || !!(pad.buttons[0] && pad.buttons[0].pressed);
        b = b || !!(pad.buttons[1] && pad.buttons[1].pressed);
      }
    } catch (e) { return; }
    if (a && !hdSetupPadVorher.a) hdSetupStart();
    else if (b && !hdSetupPadVorher.b) hdSetupZu();
    hdSetupPadVorher = { a, b };
  }, 60);
  if (typeof i18nOnLangChange === 'function') i18nOnLangChange(hdSetupMalen);
  window.HYBRIDDASH_SETUP = Object.freeze({ oeffnen: () => { hdSetupWeiter = null; hdSetupOeffnen(); }, zu: hdSetupZu, an: hdSetupAn });
