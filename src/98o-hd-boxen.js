  // ============================== HybridDash: PIT BOXES (BOXENPLAETZE) ==============================
  //
  // REQUESTED: "designate pit stop locations on the track for different cars. Each car will be
  // assigned a spot on the side of the track, as far as they can park to the left or right of the
  // track piece so they are out of the way of the driving cars. In the track editor, create
  // eligible areas where cars can stop as pit stops. Have an option where you can also set how
  // many cars in the race and automatically generate pit stop areas on the track. Have a manual
  // option too. The automatically generated pit areas should also be able to be edited. Once the
  // pit areas have been generated in the track editor, the pit area is assigned before the race."
  //
  // DATA - on the track pieces, like the sectors (tiles[k].sg):
  //   tiles[k].pb   'r' or 'l': a pit spot on piece k, the car parks at that edge;
  // Saved tracks keep whole piece objects, the editor's own store gets `box` (60-track.js).
  //
  //   'b' = both sides (two spots on one straight, right first).
  // ORDER - spots are numbered P1, P2, ... in driving order from start/finish.
  //
  // ASSIGNMENT - before the race (grid screen): car -> spot index (hdBox.zuteilung, by device id,
  // remembered per track). Default: grid order, P1 for the first car, ... Fewer spots than cars:
  // the rest share from the start (P1 again) - the spots are still personal, two cars on one spot
  // just never pit at the same time (the second waits a lap).
  //
  // IN THE RACE - an NPC pits on its own spot (90-ghosts.js asks hdBoxFuer): it enters on the piece
  // before its spot, parks with the safety-car parking sequence (mirrored for a left spot) and
  // leaves the same way. Other NPCs pass on the far side. Your own car is driven by you: its
  // spot is shown on the grid screen and on the map, and named when you call a pit stop.

  const hdBox = { wahl: null, zuteilung: {} };
  const HD_BOX_STORE = 'hybriddash-boxen-v1';
  try { hdBox.zuteilung = JSON.parse(localStorage.getItem(HD_BOX_STORE) || '{}') || {}; } catch (e) { hdBox.zuteilung = {}; }
  function hdBoxMerken() { try { localStorage.setItem(HD_BOX_STORE, JSON.stringify(hdBox.zuteilung)); } catch (e) { /* full */ } }

  function hdBoxStart(tiles) {
    try { return Math.max(0, ortStartIndex(tiles)); } catch (e) { return 0; }
  }
  function hdBoxAn(tiles) { return hdBoxPlaetze(tiles).length > 0; }

  // ---- AUTOMATIC: n spots, spread around the lap ---------------------------------------------
  // Eligible: everything but start/finish and the two pieces before it (the starting grid). Best
  // are straights (park right), then the gentle curves, then tight ones. On a curve the racing
  // line hugs the inside, so the spot is on the OUTSIDE edge (a left curve parks right). One spot
  // per piece; with more cars than pieces, straights take a second spot on the other side.
  function hdBoxEignung(t) {
    const T = TILE_TYPE;
    if (!t) return null;
    switch (t.type) {
      case T.STRAIGHT: case T.PIT: return { gut: 3, seite: 'r' };
      case T.WEIT_LEFT: return { gut: 2, seite: 'r' };
      case T.WEIT_RIGHT: return { gut: 2, seite: 'l' };
      case T.CURVE_LEFT: case T.KLEIN_LEFT: return { gut: 1, seite: 'r' };
      case T.CURVE_RIGHT: case T.KLEIN_RIGHT: return { gut: 1, seite: 'l' };
      default: return null;          // start/finish, hairpins, narrow pieces: no parking
    }
  }
  function hdBoxAutomatisch(anzahl, tiles) {
    tiles = tiles || currentTrackTiles;
    const n = tiles.length;
    anzahl = Math.max(1, Math.min(20, Math.round(Number(anzahl) || 1)));
    tiles.forEach((x) => { delete x.pb; });
    const s = hdBoxStart(tiles);
    const gesperrt = new Set([s, (s + n - 1) % n, (s + n - 2) % n]);
    const kandidaten = [];
    for (let k = 0; k < n; k++) {
      if (gesperrt.has(k)) continue;
      const e = hdBoxEignung(tiles[k]);
      if (e) kandidaten.push({ k, gut: e.gut, seite: e.seite });
    }
    if (!kandidaten.length) return 0;
    // Spread: walk the lap in equal steps and take the best eligible piece near each step.
    const gewaehlt = [];
    const frei = new Set(kandidaten.map((c) => c.k));
    const ziel = Math.min(anzahl, kandidaten.length);
    for (let i = 0; i < ziel; i++) {
      const wunsch = (s + 1 + Math.round((i + 0.5) * n / ziel)) % n;
      let best = null, bestWert = -Infinity;
      for (const c of kandidaten) {
        if (!frei.has(c.k)) continue;
        const d = Math.min(((c.k - wunsch) % n + n) % n, ((wunsch - c.k) % n + n) % n);
        const wert = c.gut * 2 - d;
        if (wert > bestWert) { bestWert = wert; best = c; }
      }
      if (!best) break;
      frei.delete(best.k);
      gewaehlt.push(best);
    }
    gewaehlt.forEach((c) => { tiles[c.k].pb = c.seite; });
    // More cars than eligible pieces: a second spot on the other side of the straights.
    let fehlt = anzahl - gewaehlt.length;
    const zweite = [];
    if (fehlt > 0) {
      for (const c of gewaehlt) {
        if (fehlt <= 0) break;
        if (c.gut === 3) { zweite.push(c.k); fehlt--; }
      }
    }
    // A piece holds one value - a second spot is recorded as 'b' (both sides).
    zweite.forEach((k) => { tiles[k].pb = 'b'; });
    return hdBoxPlaetze(tiles).length;
  }
  // Spots as places: a piece with 'b' gives two places (right first, then left).
  function hdBoxPlaetze(tiles) {
    tiles = tiles || currentTrackTiles || [];
    const n = tiles.length;
    if (!n) return [];
    const s = hdBoxStart(tiles);
    const out = [];
    for (let d = 0; d < n; d++) {
      const k = (s + d) % n;
      const pb = tiles[k] && tiles[k].pb;
      if (pb === 'r' || pb === 'b') out.push({ k, seite: 'r', nr: out.length + 1 });
      if (pb === 'l' || pb === 'b') out.push({ k, seite: 'l', nr: out.length + 1 });
    }
    return out;
  }

  // ---- THE TRACK EDITOR -------------------------------------------------------------------------
  // Called by 60-track.js - also while the app is still loading, before this file ran (hdBox is
  // not initialised then): answer "no", never throw.
  function hdBoxWahlAktiv() { try { return !!hdBox.wahl; } catch (e) { return false; } }
  function hdBoxWahlSel() { try { return hdBox.wahl ? hdBox.wahl.sel : null; } catch (e) { return null; } }
  function hdBoxGeaendert() {
    if (typeof refreshTrackPreview === 'function') refreshTrackPreview();
    hdBoxLeisteZeigen();
  }
  function hdBoxStreckeOk() {
    if (currentTrackTiles.length < 4) { showHudToast(t('Erst die Strecke bauen')); return false; }
    return true;
  }
  function hdBoxDialog() {
    if (hdBox.wahl || !hdBoxStreckeOk()) return;
    const zahl = hdBoxPlaetze().length;
    const autos = garage.filter((c) => c.device && c.role !== 'safetycar' && c.role !== 'reinig').length;
    const vorschlag = String(Math.max(2, autos || 4));
    konsoleFrage(t('Boxenplätze'),
      (zahl ? t('Jetzt: {n} Boxenplätze.').replace('{n}', zahl) + ' ' : '')
      + t('Automatisch: so viele Plätze wie Autos im Rennen, verteilt über die Runde, am Rand von Geraden und Kurven. Manuell: Teile antippen – erst rechts, nochmal links, nochmal beide Seiten, nochmal entfernt. Automatisch gesetzte Plätze lassen sich danach manuell ändern.'),
      [
        [t('Automatisch festlegen'), () => {
          const n = parseInt(String(typeof kFrageWert !== 'undefined' ? kFrageWert : vorschlag).replace(/\D/g, ''), 10) || Number(vorschlag);
          trackMerken();
          const ist = hdBoxAutomatisch(n);
          hdBoxGeaendert();
          showHudToast(ist < n ? t('{n} Boxenplätze – mehr passen nicht auf diese Strecke').replace('{n}', ist)
                               : t('{n} Boxenplätze').replace('{n}', ist));
        }],
        [t('Manuell festlegen'), () => hdBoxWahlStart()],
        [t('Aus'), () => { trackMerken(); currentTrackTiles.forEach((x) => { delete x.pb; }); hdBoxGeaendert(); showHudToast(t('Keine Boxenplätze')); }],
        [t('Abbrechen'), null],
      ], true, null, { label: t('Autos im Rennen'), wert: vorschlag });
  }
  function hdBoxWahlStart() {
    if (hdBox.wahl || !hdBoxStreckeOk()) return false;
    const vorher = currentTrackTiles.map((x) => x.pb || null);
    hdBox.wahl = { sel: (hdBoxStart(currentTrackTiles) + 1) % currentTrackTiles.length, vorher };
    document.body.classList.add('track-sek', 'track-box');
    hdBoxLeisteBauen();
    $('track-box-leiste').hidden = false;
    hdBoxGeaendert();
    return true;
  }
  function hdBoxWahlEnde() {
    hdBox.wahl = null;
    document.body.classList.remove('track-sek', 'track-box');
    const l = $('track-box-leiste'); if (l) l.hidden = true;
  }
  function hdBoxWahlFertig() {
    if (!hdBox.wahl) return false;
    const neu = currentTrackTiles.map((x) => x.pb || null);
    currentTrackTiles.forEach((x, i) => { if (hdBox.wahl.vorher[i]) x.pb = hdBox.wahl.vorher[i]; else delete x.pb; });
    trackMerken();
    currentTrackTiles.forEach((x, i) => { if (neu[i]) x.pb = neu[i]; else delete x.pb; });
    hdBoxWahlEnde();
    hdBoxGeaendert();
    const z = hdBoxPlaetze().length;
    showHudToast(z ? t('{n} Boxenplätze').replace('{n}', z) : t('Keine Boxenplätze'));
    return true;
  }
  function hdBoxWahlAbbrechen() {
    if (!hdBox.wahl) return false;
    currentTrackTiles.forEach((x, i) => { if (hdBox.wahl.vorher[i]) x.pb = hdBox.wahl.vorher[i]; else delete x.pb; });
    hdBoxWahlEnde();
    hdBoxGeaendert();
    return true;
  }
  // none -> right -> left -> both -> none. Start/finish holds no spot (the grid stands there).
  function hdBoxUmschalten(k) {
    const x = currentTrackTiles[k];
    if (!hdBox.wahl || !x) return false;
    if (x.type === TILE_TYPE.START) { showHudToast(t('Auf Start/Ziel steht die Startaufstellung')); return false; }
    const folge = [undefined, 'r', 'l', 'b'];
    const neu = folge[(folge.indexOf(x.pb) + 1) % folge.length];
    if (neu) x.pb = neu; else delete x.pb;
    hdBoxGeaendert();
    return true;
  }
  function hdBoxWahlKlick(k) { if (!hdBox.wahl) return false; hdBox.wahl.sel = k; return hdBoxUmschalten(k); }
  function hdBoxWahlPad(button) {
    if (!hdBox.wahl) return false;
    const n = currentTrackTiles.length;
    switch (button) {
      case 'left': case 'up': case 'prev': hdBox.wahl.sel = (hdBox.wahl.sel + n - 1) % n; hdBoxGeaendert(); return true;
      case 'right': case 'down': case 'next': hdBox.wahl.sel = (hdBox.wahl.sel + 1) % n; hdBoxGeaendert(); return true;
      case 'confirm': hdBoxUmschalten(hdBox.wahl.sel); return true;
      case 'rotate': hdBoxWahlFertig(); return true;
      case 'undo': hdBoxWahlAbbrechen(); return true;
      default: return true;
    }
  }
  function hdBoxWahlTaste(e) {
    if (!hdBox.wahl) return false;
    const k = (e.key || '').toLowerCase();
    e.preventDefault(); e.stopImmediatePropagation();
    if (['arrowleft', 'arrowup', 'q', ','].includes(k)) hdBoxWahlPad('left');
    else if (['arrowright', 'arrowdown', 'e', '.'].includes(k)) hdBoxWahlPad('right');
    else if ((k === 'enter' || k === ' ') && !e.repeat) hdBoxWahlPad('confirm');
    else if (k === 'f' && !e.repeat) hdBoxWahlFertig();
    else if ((k === 'escape' || k === 'backspace') && !e.repeat) hdBoxWahlAbbrechen();
    return true;
  }
  function hdBoxLeisteBauen() {
    if ($('track-box-leiste')) return;
    const vorbild = $('track-sek-leiste');
    const l = document.createElement('div');
    l.className = 'tp-bar tp-sek-leiste'; l.id = 'track-box-leiste'; l.hidden = true;
    l.innerHTML = '<span class="tp-sek-text"><b>' + t('Boxenplätze festlegen') + '</b><small>'
      + t('Teile antippen oder mit ✕ wählen: rechts, nochmal links, nochmal beide Seiten, nochmal entfernt.') + '</small></span>'
      + '<b class="tp-sek-zahl" id="track-box-zahl" data-i18n-skip></b>'
      + '<button type="button" class="tp-opt-knopf primary" id="track-box-fertig">' + t('Fertig') + '</button>'
      + '<button type="button" class="tp-opt-knopf" id="track-box-abbrechen">' + t('Abbrechen') + '</button>';
    if (vorbild && vorbild.parentNode) vorbild.parentNode.insertBefore(l, vorbild.nextSibling);
    else document.body.appendChild(l);
    $('track-box-fertig').onclick = () => hdBoxWahlFertig();
    $('track-box-abbrechen').onclick = () => hdBoxWahlAbbrechen();
  }
  function hdBoxLeisteZeigen() {
    const z = $('track-box-zahl');
    if (z) z.textContent = t('{n} Boxenplätze').replace('{n}', hdBoxPlaetze().length);
  }

  // ---- DRAWING (renderTrackPreview, 60-track.js): a small "P1" box beside the piece ------------
  function hdBoxSvg(g) {
    const plaetze = hdBoxPlaetze(g.tiles);
    if (!plaetze.length || !g.kachelTab || !g.kachelTab.start) return '';
    let out = '';
    for (const p of plaetze) {
      const st = g.kachelTab.start[p.k], zahl = g.kachelTab.zahl ? g.kachelTab.zahl[p.k] : 1;
      const i = Math.min(g.pts.length - 1, st + Math.floor((zahl || 1) / 2));
      const pt = g.pts[i], n = g.nrm[i];
      if (!pt || !n) continue;
      // The map normal points LEFT of the direction of travel (left kerb blue, right kerb red).
      const v = (p.seite === 'r' ? -1 : 1) * g.half * 1.6;
      const x = pt.x + n.x * v + g.ox, y = pt.y + n.y * v + g.oy;
      const w = g.half * 1.15, h = g.half * 0.8;
      const farbe = g.farbeFuer ? g.farbeFuer(p.nr - 1) : '#39ff88';
      out += `<g data-box="${p.nr}"><rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h * 0.22).toFixed(1)}" `
        + `fill="#0d1015" stroke="${farbe}" stroke-width="${Math.max(1, g.half * 0.08).toFixed(1)}"/>`
        + `<text x="${x.toFixed(1)}" y="${(y + h * 0.3).toFixed(1)}" text-anchor="middle" font-size="${(h * 0.78).toFixed(1)}" font-weight="800" `
        + `font-family="sans-serif" fill="${farbe}">P${p.nr}</text></g>`;
    }
    return out;
  }

  (function hdBoxKnopf() {
    // The editor button next to "Sectors".
    const sek = $('track-sektoren');
    if (!sek || $('track-boxen')) return;
    const b = document.createElement('button');
    b.className = 'tp-btn'; b.id = 'track-boxen';
    b.title = t('Boxenplätze der Strecke festlegen'); b.setAttribute('aria-label', t('Boxenplätze festlegen'));
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
      + '<rect x="4" y="5" width="16" height="14" rx="3"/><path class="tp-akzent" d="M10 15V9h3a2 2 0 0 1 0 4h-3" stroke="#39ff88"/></svg>'
      + '<span class="tp-cap">' + t('Boxen') + '</span><span class="wip-tag">WIP</span>';
    b.onclick = () => hdBoxDialog();
    sek.parentNode.insertBefore(b, sek.nextSibling);
  })();

  // ---- ASSIGNMENT: which spot a car uses ------------------------------------------------------
  // A spot chosen on the grid screen (hdBox.zuteilung[device id] = spot number) wins; otherwise
  // grid order: the first car P1, the second P2, ... and round again when there are more cars.
  function hdBoxGridAutos() {
    try { return raceGridCars(); } catch (e) { return garage.filter((c) => c.device && c.role !== 'safetycar' && c.role !== 'reinig'); }
  }
  function hdBoxFuer(car, plaetze) {
    plaetze = plaetze || hdBoxPlaetze();
    if (!plaetze.length || !car || !car.device) return null;
    const wahl = Number(hdBox.zuteilung[String(car.device.id)]);
    if (wahl >= 1 && wahl <= plaetze.length) return plaetze[wahl - 1];
    const i = hdBoxGridAutos().indexOf(car);
    return plaetze[(i >= 0 ? i : 0) % plaetze.length];
  }
  // For the race code: the piece this car pits on, or -1 (no pit spots on this track).
  function hdBoxKachel(car) { const p = hdBoxFuer(car); return p ? p.k : -1; }
  // Colour of a spot on the map: the colour of the (first) car that uses it.
  function hdBoxFarbeFuer(idx) {
    const plaetze = hdBoxPlaetze();
    for (const c of hdBoxGridAutos()) {
      const p = hdBoxFuer(c, plaetze);
      if (p && p.nr === idx + 1) return carColor(c).hex;
    }
    return '#5d6675';
  }
  function hdBoxSeiteText(seite) { return seite === 'l' ? t('links') : t('rechts'); }
  // Grid screen: the spot picker in each car's card (raceGridZeilen, 70-race.js).
  function hdBoxGridZelle(car) {
    const plaetze = hdBoxPlaetze();
    if (!plaetze.length || !car || !car.device) return '';
    const ist = hdBoxFuer(car, plaetze);
    const id = String(car.device.id).replace(/"/g, '');
    return '<label class="grid-box" title="' + t('Boxenplatz dieses Autos') + '"><span>' + t('Box') + '</span>'
      + '<select data-hd-box="' + id + '" aria-label="' + t('Boxenplatz') + '">'
      + plaetze.map((p) => '<option value="' + p.nr + '"' + (ist && ist.nr === p.nr ? ' selected' : '') + ' title="'
        + t('Teil') + ' ' + (p.k + 1) + '">P' + p.nr + ' · ' + hdBoxSeiteText(p.seite) + '</option>').join('')
      + '</select></label>';
  }
  document.addEventListener('change', (e) => {
    const sel = e.target && e.target.closest && e.target.closest('select[data-hd-box]');
    if (!sel) return;
    hdBox.zuteilung[sel.getAttribute('data-hd-box')] = Number(sel.value);
    hdBoxMerken();
    try { raceGridZeilen($('grid-liste')); gridBildMalen(); } catch (err) { /* grid closed */ }
    hdGridInfoMalen();
  });

  // ---- IN THE RACE ---------------------------------------------------------------------------------
  // An NPC on the piece before its spot starts its stop (called from ghostTick, 90-ghosts.js). The
  // stop itself is OmegaSim's NPC pit machine (pitTick) with the spot's piece and side (p.hd).
  function hdBoxNpcPitStarten(car, now, reifenNot) {
    const p = hdBoxFuer(car);
    if (!p || !car.ghost) return false;
    car.ghost.pit = { phase: 'anfahrt', at: now, laenge: Math.max(1, ghostCfg.pitSek) * 1000, platz: -1,
                      hd: { k: p.k, seite: p.seite, nr: p.nr }, grund: reifenNot ? 'reifen' : 'plan' };
    log(garageLabel(car) + ': pits in its own Pit Box P' + p.nr + ' (piece ' + (p.k + 1) + ', ' + (p.seite === 'l' ? 'left' : 'right') + ' edge)'
        + (reifenNot ? ' – ' + reifenName(reifenPassend()) + ' tyres.' : '.'), 'info');
    showHudToast(garageLabel(car).toUpperCase() + ' · BOX P' + p.nr);
    return true;
  }
  // How many pieces before its Pit Box an NPC switches on the pit limiter and its flashing
  // lights: two, on a track long enough for it (one on a very short one).
  function hdBoxVorlauf() { const n = currentTrackTiles ? currentTrackTiles.length : 0; return n >= 8 ? 2 : 1; }
  // Clear to rejoin: no racing car coming up from behind within 1.5 pieces, and none alongside.
  function hdBoxStreckeFrei(car) {
    const n = currentTrackTiles ? currentTrackTiles.length : 0;
    const ich = ghostOrt(car);
    if (!n || ich === null) return true;
    for (const c of ghostFieldRacing()) {
      if (c === car || !c.ghost || c.parked) continue;
      if (c.ghost.pit && c.ghost.pit.phase !== 'ausfahrt') continue;   // standing in its own box
      const o = ghostOrt(c);
      if (o === null) continue;
      const hinter = ((ich - o) % n + n) % n;        // how far behind me
      if (hinter < 1.5 || hinter > n - 0.3) return false;
    }
    return true;
  }
  // Your own car: you drive it, so its spot is guidance - named when you call the stop.
  function hdBoxSpielerHinweis(car) {
    const p = car && hdBoxFuer(car);
    if (!p) return;
    showHudToast(t('Deine Box') + ': P' + p.nr + ' · ' + t('Teil') + ' ' + (p.k + 1) + ' · ' + hdBoxSeiteText(p.seite));
  }

  // ---- AUTOMATIC PIT STOP FOR YOUR CAR ---------------------------------------------------------
  // REQUESTED: "a mappable button for the human player to have 'Automatic Pitstop' - like deploying
  // the yellow flag, they have to hold the button to confirm. Once activated the car goes into
  // autonomous mode and makes its way to the designated Pit Box, then the pit mini game (if
  // enabled) plays like normal. The pull away is the same as the NPCs: the pit limiter stays on;
  // for human players they can set how long the limiter stays on after a pit stop, default 2 s."
  // Button: LB (Xbox) / L1 (PlayStation) held 1 s (bindings.autobox); holding again before the car
  // has parked cancels. Phases, run from the player's autopilot (autopilot() in 50-drive.js):
  //   anfahrt    to the Pit Box at the pit limiter (pitState 'limited', lane bytes, centre line)
  //   einparken  the safety-car parking sequence (mirrored for a left box), straight onto the bytes
  //   stand      held still; OmegaSim's pit service starts (refuel, tyres, mini game as usual)
  //   ausfahrt   when the service is done: along the box's edge at the limiter for the set time
  // then the car is yours again.
  const HD_AUTOBOX_HALTEN_MS = 1000;
  const hdAuto = { stopp: null, sekunden: 2, gedrueckt: 0, ausgeloest: false, hinweis: false };
  try {
    const roh = localStorage.getItem('hybriddash-autobox-sek');   // null = never set (Number(null) would be 0)
    const v = roh === null ? NaN : Number(roh);
    if (v >= 0 && v <= 10) hdAuto.sekunden = v;
  } catch (e) { /* private */ }
  function hdAutoBoxAktiv(car) { try { return !!(hdAuto.stopp && (!car || hdAuto.stopp.car === car)); } catch (e) { return false; } }
  // Self-guidance on (track bytes) while driving to the box and pulling away; off while parking and
  // standing, where the parking script steers the wheels directly (like the grid placement).
  function hdAutoBoxSpur(car) {
    try { const s = hdAuto.stopp; return !!(s && (!car || s.car === car) && (s.phase === 'anfahrt' || s.phase === 'ausfahrt')); } catch (e) { return false; }
  }
  function hdAutoBoxOhneSpur(car) {
    try { const s = hdAuto.stopp; return !!(s && (!car || s.car === car) && (s.phase === 'einparken' || s.phase === 'stand')); } catch (e) { return false; }
  }
  function hdAutoBoxAmOrt() { try { return !!(hdAuto.stopp && hdAuto.stopp.phase === 'stand'); } catch (e) { return false; } }
  // Does a binding sit on the same input as the automatic pit stop? (tyre select then waits for release)
  function hdAutoBoxTeilt(b) {
    try { const a = bindings.autobox; return !!(a && b && a.type !== 'none' && a.type === b.type && a.index === b.index); } catch (e) { return false; }
  }
  function hdAutoBoxStarten() {
    const car = playerCar;
    if (!car) { showHudToast(t('Kein Auto verbunden')); return false; }
    if (trackMode !== 'on') { showHudToast(t('Automatischer Boxenstopp nur auf der Bahn')); return false; }
    if (flagState !== 'green' || raceFormationLap) { showHudToast(t('Automatischer Boxenstopp erst bei Grün')); return false; }
    if (pitState !== 'off') { showHudToast(t('Boxenstopp läuft schon')); return false; }
    const p = hdBoxFuer(car);
    if (!p) { showHudToast(t('Keine Pit Box auf dieser Strecke – im Streckeneditor festlegen')); return false; }
    if (typeof ghostOrt === 'function' && ghostOrt(car) === null) { showHudToast(t('Auto noch nicht geortet – eine Runde fahren')); return false; }
    hdAuto.stopp = { car, p, phase: 'anfahrt', at: rennZeitJetzt(), service: false };
    setPitState('limited');
    showHudToast(t('AUTOMATISCHER BOXENSTOPP') + ' · P' + p.nr + ' · ' + hdBoxSeiteText(p.seite));
    log('Automatic pit stop: driving to Pit Box P' + p.nr + ' (piece ' + (p.k + 1) + ', ' + (p.seite === 'l' ? 'left' : 'right') + ').', 'info');
    return true;
  }
  function hdAutoBoxEnde(text) {
    hdAuto.stopp = null;
    try { autopilotZuruecksetzen(1); } catch (e) { /* not ready */ }
    if (text) showHudToast(text);
  }
  function hdAutoBoxAbbrechen() {
    if (!hdAuto.stopp) return;
    const vorParken = hdAuto.stopp.phase === 'anfahrt';
    hdAutoBoxEnde(t('Automatischer Boxenstopp abgebrochen'));
    if (vorParken && pitState === 'limited') setPitState('off');
  }
  // Hold detection: LB / L1 (or whatever is mapped) held for 1 s starts - or, before parking, cancels.
  setInterval(() => {
    let an = false;
    try {
      const b = bindings.autobox;
      if (b && b.type !== 'none' && navigator.getGamepads) {
        for (const pad of navigator.getGamepads()) if (pad && readBindingValue(pad, b) > BUTTON_CAPTURE_THRESHOLD) { an = true; break; }
      }
    } catch (e) { /* no pad */ }
    const imCockpit = (() => { try { return document.body.classList.contains('race-fs') || document.querySelector('.tabpage.active') === $('tab-race'); } catch (e) { return false; } })();
    if (!an || !imCockpit) { hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false; return; }
    const now = performance.now();
    if (!hdAuto.gedrueckt) { hdAuto.gedrueckt = now; return; }
    if (hdAuto.ausgeloest || now - hdAuto.gedrueckt < HD_AUTOBOX_HALTEN_MS) return;
    hdAuto.ausgeloest = true;
    if (hdAuto.stopp) { if (hdAuto.stopp.phase === 'anfahrt') hdAutoBoxAbbrechen(); }
    else hdAutoBoxStarten();
  }, 40);
  // The autopilot for the stop (called from autopilot() in 50-drive.js). null = not active.
  function hdAutoBoxPilot(car, st, motor, regler, fahrerBremse) {
    // Called every physics step - also while the app is still loading, before this file ran.
    let s;
    try { s = hdAuto.stopp; } catch (e) { return null; }
    if (!s || car !== s.car) return null;
    if (car !== playerCar || trackMode !== 'on') { hdAutoBoxEnde(null); return null; }
    const now = rennZeitJetzt();
    const tempo = (ziel) => {
      const v = Math.abs(st.speedKmh) / motor.config.topSpeedKmh;
      const dt = Math.max(0.01, Math.min(0.25, (now - (regler.at || now)) / 1000));
      regler.at = now;
      return ghostSpeedControl(regler, ziel, v, dt);
    };
    const limiter = () => formationPace() * (typeof autopilotKurvenFaktor === 'function' ? autopilotKurvenFaktor(car) : 1);
    if (s.phase === 'anfahrt') {
      const ort = ghostOrt(car);
      if (ort !== null && Math.floor(ort) === s.p.k) {
        s.phase = 'einparken'; s.at = now;
        s.skript = s.p.seite === 'l' ? manoeverGespiegelt(MANOEVER.scEin) : MANOEVER.scEin;
      } else {
        const g = tempo(limiter());
        return { grund: 'autobox', throttle: g.throttle, brake: g.brake, steer: 0, lenkt: !abseitsJetztFuer(1) };
      }
    }
    if (s.phase === 'einparken') {
      const ms = now - s.at;
      if (ms < manoeverDauer(s.skript)) {
        const w = manoeverWert(s.skript, ms);
        return { grund: 'autobox', throttle: 0, brake: 0, steer: 0, lenkt: false, radLenk: w[1], radGas: w[2] };
      }
      s.phase = 'stand'; s.at = now;
      log('Automatic pit stop: parked in Pit Box P' + s.p.nr + '.', 'info');
    }
    if (s.phase === 'stand') {
      if (pitState === 'servicing') s.service = true;
      const fertig = s.service && pitReady;
      const abgebrochen = s.service && pitState === 'off';
      if (fertig || abgebrochen) { s.phase = 'ausfahrt'; s.at = now; }
      else if (!s.service && now - s.at > 6000) { hdAutoBoxEnde(t('Boxenstopp startete nicht – du fährst wieder selbst')); return null; }
      else {
        st.speedKmh = 0;
        return { grund: 'autobox', throttle: 0, brake: 1, steer: 0, lenkt: false };
      }
    }
    if (s.phase === 'ausfahrt') {
      if (now - s.at >= hdAuto.sekunden * 1000) { hdAutoBoxEnde(t('Du fährst wieder selbst')); return null; }
      const g = tempo(limiter());
      return { grund: 'autobox', throttle: g.throttle, brake: g.brake, steer: s.p.seite === 'l' ? -0.9 : 0.9, lenkt: !abseitsJetztFuer(1) };
    }
    return null;
  }
  (function hdAutoBoxRegler() {
    const r = $('hd-autobox-sek'), w = $('hd-autobox-sek-wert');
    if (!r) return;
    r.value = String(hdAuto.sekunden);
    const zeigen = () => { if (w) w.textContent = hdAuto.sekunden.toFixed(1) + ' s'; };
    zeigen();
    r.addEventListener('input', () => {
      hdAuto.sekunden = Math.max(0, Math.min(10, Number(r.value) || 0));
      try { localStorage.setItem('hybriddash-autobox-sek', String(hdAuto.sekunden)); } catch (e) { /* private */ }
      zeigen();
    });
  })();

  // ---- RACE INFORMATION on the grid screen ------------------------------------------------------
  function hdGridInfoMalen() {
    const gs = $('race-gridscreen');
    if (!gs) return;
    let box = $('hd-grid-info');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hd-grid-info'; box.className = 'hd-grid-info'; box.setAttribute('data-i18n-skip', '');
      const bild = $('grid-bild');
      if (bild && bild.nextSibling) gs.insertBefore(box, bild.nextSibling); else gs.appendChild(box);
    }
    const zeilen = [];
    const z = (l, w) => zeilen.push('<span class="l">' + l + '</span><b>' + w + '</b>');
    try {
      const m = RACE_MODES[raceMode];
      z(t('Renntyp'), t(m.label));
      z(t('Dauer'), raceLimit > 0 ? raceLimit + ' ' + t(m.unit) : '∞');
      z(t('Wetter'), t({ dry: 'Trocken', rain: 'Regen', wechsel: 'Wechselhaft' }[raceWxStart] || 'Trocken'));
      z(t('Start'), raceFlying ? t('Fliegend') : t('Stehend'));
      z(t('Pflichtstopps'), String(racePitRequired || 0));
      z(t('Autos'), String(hdBoxGridAutos().length));
    } catch (e) { /* race settings not ready */ }
    try {
      const bahn = ($('setting-ontrack') || {}).checked;
      if (bahn && currentTrackTiles && currentTrackTiles.length > 1) {
        z(t('Strecke'), currentTrackTiles.length + ' ' + t('Teile') + (typeof trackLaengeText === 'function' ? ' · ' + trackLaengeText(currentTrackTiles) : ''));
        let sek = 1;
        try { const p = autoSektorPlanFuer(currentTrackTiles, trackIstGeschlossen(), false); sek = p ? p.n : 1; } catch (e) { sek = 1; }
        z(t('Sektoren'), sek > 1 ? String(sek) : t('aus'));
        const plaetze = hdBoxPlaetze();
        z(t('Boxenplätze'), plaetze.length ? String(plaetze.length) : t('keine – Box an Start/Ziel'));
      } else {
        z(t('Strecke'), t('frei'));
      }
    } catch (e) { /* no track */ }
    try { z(t('Zufallsevents'), $('race-zev') && $('race-zev').checked ? t('an') : t('aus')); } catch (e) { /* older build */ }
    try { z(t('Automatisches Safety Car'), hd.autoSc ? t('an') : t('aus')); } catch (e) { /* not loaded */ }
    box.innerHTML = '<div class="hd-gi-titel">' + t('Rennen') + '</div><div class="hd-gi-raster">' + zeilen.join('') + '</div>';
  }

  // Self-test of the automatic pit stop: a stand-in player car walked through the four phases.
  function hdAutoBoxSelbsttest(ok) {
    const merk = { tiles: currentTrackTiles, pc: playerCar, tm: trackMode, fl: flagState, ps: pitState, pr: pitReady,
                   ort: ghostOrt, form: raceFormationLap, garage: garage.slice(), zut: Object.assign({}, hdBox.zuteilung), sek: hdAuto.sekunden };
    try {
      ok('automatic pit stop: on LB / L1 by default, sharing the button with tyre select',
         bindings.autobox && bindings.autobox.index === 4 && hdAutoBoxTeilt(bindings.tyreSelect), JSON.stringify(bindings.autobox));
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;
      hdBoxAutomatisch(2);
      currentTrackTiles.forEach((x) => { if (x.pb) x.pb = 'l'; });           // left boxes: mirrored parking
      const car = { role: 'player', alias: 'Ich', device: { id: 'hd-ab' }, colorId: 'gelb' };
      garage.length = 0; garage.push(car); hdBox.zuteilung = {};
      playerCar = car; trackMode = 'on'; flagState = 'green'; raceFormationLap = false; pitState = 'off'; pitReady = false;
      let ort = 0.2;
      ghostOrt = (c) => (c === car ? ort : null);
      const st = { speedKmh: 30 }, motor = { config: { topSpeedKmh: 100 } }, regler = {};
      const box = hdBoxFuer(car);
      const gestartet = hdAutoBoxStarten();
      ok('hold 1 s: starts, pit limiter on', gestartet && hdAuto.stopp.phase === 'anfahrt' && pitState === 'limited', 'phase ' + (hdAuto.stopp && hdAuto.stopp.phase) + ', pit ' + pitState);
      const a1 = hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('on the way: drives itself at the pit limiter', a1 && a1.grund === 'autobox' && a1.throttle >= 0 && a1.steer === 0, JSON.stringify(a1));
      // Reported: "it just puts the limiter on, and the car drives straight". Without the track bytes the car
      // reads steer 0 as a straight wheel; the stop must switch the self-guidance on even with the assist off.
      ok('on the way: self-guidance on (follows the track, not a straight wheel), even with driving assist off',
         driverAssistAktiv(car) && hdAutoBoxSpur(car) && !hdAutoBoxOhneSpur(car), 'assist ' + driverAssistAktiv(car));
      ort = box.k + 0.1;
      hdAutoBoxPilot(car, st, motor, regler, 0);
      const sk = MANOEVER.scEin, w0 = manoeverWert(sk, 300);          // a moment with steering in it
      const phaseEin = hdAuto.stopp.phase;
      hdAuto.stopp.at -= 300;
      const a2 = hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('at its Pit Box: parks with the sequence, mirrored for a left box', phaseEin === 'einparken' && a2 && w0[1] !== 0
         && Math.abs(a2.radLenk + w0[1]) < 1e-9, 'radLenk ' + (a2 && a2.radLenk) + ' vs recorded ' + w0[1]);
      ok('parking: self-guidance off, the sequence steers the wheels directly', hdAutoBoxOhneSpur(car) && !hdAutoBoxSpur(car), 'phase ' + hdAuto.stopp.phase);
      hdAuto.stopp.at -= manoeverDauer(sk) + 50;
      const a3 = hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('parked: held still so the pit service can start', hdAuto.stopp.phase === 'stand' && a3 && a3.brake === 1 && hdAutoBoxAmOrt(), JSON.stringify(a3));
      pitState = 'servicing'; hdAutoBoxPilot(car, st, motor, regler, 0);
      pitReady = true;
      const a4 = hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('service done: pulls away along its (left) edge at the limiter', hdAuto.stopp && hdAuto.stopp.phase === 'ausfahrt' && a4 && a4.steer < 0, JSON.stringify(a4));
      ok('pulling away: self-guidance on again', hdAutoBoxSpur(car) && driverAssistAktiv(car), 'assist ' + driverAssistAktiv(car));
      hdAuto.sekunden = 2;
      hdAuto.stopp.at -= 2100;
      const a5 = hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('after the set time (2 s): the car is yours again', a5 === null && !hdAuto.stopp, 'still ' + (hdAuto.stopp && hdAuto.stopp.phase));
      // Cancel before parking.
      pitState = 'off'; pitReady = false; ort = 0.2;
      hdAutoBoxStarten(); hdAutoBoxAbbrechen();
      ok('hold again before parking: cancelled', !hdAuto.stopp && pitState === 'off', 'pit ' + pitState);
    } catch (e) {
      ok('automatic pit stop self-test ran', false, String(e && e.stack || e));
    } finally {
      hdAuto.stopp = null; hdAuto.sekunden = merk.sek;
      currentTrackTiles = merk.tiles; playerCar = merk.pc; trackMode = merk.tm; flagState = merk.fl; raceFormationLap = merk.form;
      pitReady = merk.pr; ghostOrt = merk.ort;
      if (pitState !== merk.ps) { try { setPitState(merk.ps); } catch (e) { pitState = merk.ps; } }
      garage.length = 0; merk.garage.forEach((c) => garage.push(c));
      hdBox.zuteilung = merk.zut;
    }
  }

  // ---- SELF-TEST (window.HYBRIDDASH_BOX.selbsttest()) - stand-in track and cars, state put back ----
  function hdBoxSelbsttest() {
    const out = [], ok = (n, b, m) => out.push({ name: n, ok: !!b, mass: m });
    const merk = { tiles: currentTrackTiles, garage: garage.slice(), zut: Object.assign({}, hdBox.zuteilung), wahl: hdBox.wahl };
    try {
      // 1. Automatic: n spots, none on start/finish or the two pieces before it (the grid).
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;
      const n = currentTrackTiles.length, s0 = hdBoxStart(currentTrackTiles);
      const z = hdBoxAutomatisch(6);
      const pl = hdBoxPlaetze();
      const verboten = [s0, (s0 + n - 1) % n, (s0 + n - 2) % n];
      ok('automatic: 6 spots for 6 cars, off the grid', z === 6 && pl.every((p) => !verboten.includes(p.k)),
         pl.map((p) => 'P' + p.nr + '@' + p.k + p.seite).join(' '));
      ok('spots numbered in driving order from start/finish', pl.every((p, i) => p.nr === i + 1)
         && pl.every((p, i) => i === 0 || ((p.k - s0 + n) % n) >= ((pl[i - 1].k - s0 + n) % n)), pl.map((p) => p.k).join(','));
      // 2. Curves: the spot is on the outside edge.
      currentTrackTiles = codeToTrack('SG2L3G2L3').tiles;
      hdBoxAutomatisch(10);
      const kurven = hdBoxPlaetze().filter((p) => [TILE_TYPE.CURVE_LEFT, TILE_TYPE.KLEIN_LEFT, TILE_TYPE.WEIT_LEFT].includes(currentTrackTiles[p.k].type));
      ok('left curve: spot on the right (outside) edge', kurven.length > 0 && kurven.every((p) => p.seite === 'r'), kurven.map((p) => p.k + p.seite).join(' ') || 'no curve spot');
      // 3. More cars than pieces: straights take both sides.
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;
      const viel = hdBoxAutomatisch(20);
      ok('more cars than pieces: both sides of straights, then stop', viel > n - 3 && hdBoxPlaetze().some((p, i, a) => a.some((q) => q !== p && q.k === p.k)),
         viel + ' spots on ' + n + ' pieces');
      // 4. Manual: right -> left -> both -> none; start/finish refused.
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;
      hdBox.wahl = { sel: 1, vorher: currentTrackTiles.map(() => null) };
      const k = (hdBoxStart(currentTrackTiles) + 1) % n;
      const folge = [];
      for (let i = 0; i < 4; i++) { hdBoxUmschalten(k); folge.push(currentTrackTiles[k].pb || '-'); }
      const startAbgelehnt = !hdBoxUmschalten(hdBoxStart(currentTrackTiles));
      hdBox.wahl = null;
      ok('manual: right, left, both, removed; not on start/finish', folge.join('') === 'rlb-' && startAbgelehnt, folge.join(' '));
      // 5. Assignment: grid order by default, a choice wins, more cars than spots wrap round.
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;
      hdBoxAutomatisch(2);
      const mk = (id) => ({ role: 'ghost', alias: id, device: { id, name: id }, colorId: 'rot' });
      garage.length = 0; ['b1', 'b2', 'b3'].forEach((id) => garage.push(mk(id)));
      hdBox.zuteilung = {};
      const def = garage.map((c) => hdBoxFuer(c).nr).join('');
      hdBox.zuteilung = { b1: 2 };
      const wahl = hdBoxFuer(garage[0]).nr;
      ok('assignment: grid order, wrap round, choice wins', def === '121' && wahl === 2, 'default ' + def + ', b1 chose P' + wahl);
      // 6. Left spot: the parking sequence is the right one mirrored.
      const m = typeof manoeverGespiegelt === 'function' ? manoeverGespiegelt([[0, 0.5, 0.2], [40, -1, 0.1]]) : null;
      ok('left spot: parking steering mirrored, timing and throttle kept', m && m[0][1] === -0.5 && m[1][1] === 1 && m[1][0] === 40 && m[1][2] === 0.1, JSON.stringify(m));
      // 7. Saved with the editor track.
      const d = typeof editorStreckeDaten === 'function' ? editorStreckeDaten() : null;
      ok('pit spots saved with the editor track', d && Array.isArray(d.box) && d.box.length === hdBoxPlaetze().length, d ? JSON.stringify(d.box) : 'no editor data');
    } catch (e) {
      ok('self-test ran', false, String(e && e.stack || e));
    } finally {
      currentTrackTiles = merk.tiles;
      garage.length = 0; merk.garage.forEach((c) => garage.push(c));
      hdBox.zuteilung = merk.zut; hdBox.wahl = merk.wahl;
    }
    hdAutoBoxSelbsttest(ok);
    return out;
  }

  // Tests/screenshots only.
  window.HYBRIDDASH_BOX = Object.freeze({
    selbsttest: hdBoxSelbsttest,
    autoBox: { starten: () => hdAutoBoxStarten(), abbrechen: () => hdAutoBoxAbbrechen(), lage: () => (hdAuto.stopp ? { phase: hdAuto.stopp.phase, nr: hdAuto.stopp.p.nr } : null), sekunden: () => hdAuto.sekunden },
    strecke: (code) => { currentTrackTiles = codeToTrack(code).tiles; if (typeof refreshTrackPreview === 'function') refreshTrackPreview(); return currentTrackTiles.length; },
    auto: (n) => { const z = hdBoxAutomatisch(n); hdBoxGeaendert(); return z; },
    plaetze: () => hdBoxPlaetze().map((p) => ({ nr: p.nr, k: p.k, seite: p.seite, typ: currentTrackTiles[p.k].type })),
    wahl: { start: () => hdBoxWahlStart(), klick: (k) => hdBoxWahlKlick(k), fertig: () => hdBoxWahlFertig(), abbrechen: () => hdBoxWahlAbbrechen() },
    _pitCfg: (o) => { Object.assign(ghostCfg, o || {}); return { an: ghostCfg.pitAn, frei: ghostCfg.pitFrei, min: ghostCfg.pitRundenMin, max: ghostCfg.pitRundenMax, sek: ghostCfg.pitSek }; },
    _pitLage: () => garage.filter((c) => c.ghost).map((c) => ({ name: c.alias, tile: c.ghost.tileIndex, quer: +(c.ghost.querSoll || 0).toFixed(2),
      pit: c.ghost.pit ? { phase: c.ghost.pit.phase, hd: c.ghost.pit.hd || null, platz: c.ghost.pit.platz } : null, spot: (hdBoxFuer(c) || {}).nr || null,
      blink: !!c.ghost.pitBlink, ziel: +(c.ghost.lastTarget || 0).toFixed(2), frei: hdBoxStreckeFrei(c) })),
    fuer: (id) => { const c = garage.find((x) => x.device && String(x.device.id) === String(id)); const p = c && hdBoxFuer(c); return p ? { nr: p.nr, k: p.k, seite: p.seite } : null; },
  });
