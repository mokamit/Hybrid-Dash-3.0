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
  // Has the car reached (or just passed) the box piece k, moving from position `vor` to `jetzt`? Not only
  // "on piece k right now": the tile count can jump two pieces under radio load, and during the 1 s hold the
  // car passes 1-2 pieces - either would otherwise send it round a whole extra lap (v3.0 BESTELLT: "if it's
  // 1-2 track pieces away, they will go straight in the pit"). Positions are piece + phase, wrapping at n.
  function hdBoxErreicht(vor, jetzt, k, n) {
    if (jetzt === null || jetzt === undefined || !(n > 0)) return false;
    if (Math.floor(jetzt) === k) return true;
    if (vor === null || vor === undefined) return false;
    const weg = ((jetzt - vor) % n + n) % n;              // forward distance travelled
    if (!(weg > 0) || weg > n / 2) return false;          // standing, or a jump backwards / a whole lap
    if (Math.floor(vor) === k) return true;               // was on the box piece, now just past it
    const bisBox = ((k - vor) % n + n) % n;               // forward distance from `vor` to the start of piece k
    return bisBox <= weg;
  }
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
    // ortVor: the position the "did we reach the box piece" check starts from - where the button went down
    // (hold detection), so a box passed during the 1 s hold still counts and the car goes straight in.
    const ortJetzt = typeof ghostOrt === 'function' ? ghostOrt(car) : null;
    const ortDruck = hdAuto.ortDruck;
    hdAuto.ortDruck = null;
    hdAuto.stopp = { car, p, phase: 'anfahrt', at: rennZeitJetzt(), service: false,
                     ortVor: ortDruck !== null && ortDruck !== undefined ? ortDruck : ortJetzt };
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
  function hdAutoBoxAbbrechen(text) {
    if (!hdAuto.stopp) return;
    const vorParken = hdAuto.stopp.phase === 'anfahrt';
    hdAutoBoxEnde(text || t('Automatischer Boxenstopp abgebrochen'));
    if (vorParken && pitState === 'limited') setPitState('off');
  }
  // Hold detection: LB / L1 (or whatever is mapped) held for 1 s starts; it must stay held to the box (released = cancel).
  setInterval(() => {
    let an = false;
    try {
      const b = bindings.autobox;
      if (b && b.type !== 'none' && navigator.getGamepads) {
        for (const pad of navigator.getGamepads()) if (pad && readBindingValue(pad, b) > BUTTON_CAPTURE_THRESHOLD) { an = true; break; }
      }
    } catch (e) { /* no pad */ }
    const imCockpit = (() => { try { return document.body.classList.contains('race-fs') || document.querySelector('.tabpage.active') === $('tab-race'); } catch (e) { return false; } })();
    hdAutoBoxTaste(an, imCockpit, performance.now());
  }, 40);
  // One step of the button logic (40 ms): an = button down, imCockpit = cockpit on screen.
  function hdAutoBoxTaste(an, imCockpit, now) {
    // v3.0 BESTELLT: "only if LB is pressed down until it reaches the pit box. If LB is released, the auto pit
    // stop is cancelled and the car goes back to regular speed." Started by the button: on the way to the box
    // the button must stay held; letting go cancels (limiter off). Once parking has begun it no longer matters.
    if (!an && hdAuto.stopp && hdAuto.stopp.perTaste && hdAuto.stopp.phase === 'anfahrt') hdAutoBoxAbbrechen(t('Automatischer Boxenstopp abgebrochen – Taste losgelassen'));
    if (!an || !imCockpit) { hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false; return; }
    if (!hdAuto.gedrueckt) {
      hdAuto.gedrueckt = now;
      // Where the car was when the button went down: during the 1 s hold it covers 1-2 pieces at race speed.
      try { hdAuto.ortDruck = playerCar && typeof ghostOrt === 'function' ? ghostOrt(playerCar) : null; } catch (e) { hdAuto.ortDruck = null; }
      return;
    }
    if (hdAuto.ausgeloest || now - hdAuto.gedrueckt < HD_AUTOBOX_HALTEN_MS) return;
    hdAuto.ausgeloest = true;
    if (!hdAuto.stopp && hdAutoBoxStarten()) hdAuto.stopp.perTaste = true;
  }
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
      const erreicht = ort !== null && hdBoxErreicht(s.ortVor, ort, s.p.k, (currentTrackTiles || []).length);
      if (ort !== null) s.ortVor = ort;
      if (erreicht) {
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

  // ---- STARTING GRID AS A TV BOARD (Hybrid-Dash 3.0) ----
  // BESTELLT: "change the cards to something like this" (a TV "Starting Grid" graphic): a title bar, one band per
  // grid row with a "ROW n" tab and the two positions, the car on the left of the track in the left card and the
  // car on the right in the right card (mirrored: big car number on the outer edge, portrait, first name over the
  // surname), and a footer strip. The rows that raceGridZeilen() built stay the same elements - their arrows, Pit
  // Box picker, click-to-blink and drag handlers keep working; only their content is regrouped.
  function hdNameTeile(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (w.length < 2) return ['', w[0] || ''];
    return [w.slice(0, -1).join(' '), w[w.length - 1]];
  }
  function hdStartgridBoard(host, cars) {
    if (!host || !cars || !cars.length) return;
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    host.classList.add('hd-sg');
    // title bar
    let titel = '', unter = [];
    try {
      const m = RACE_MODES[raceMode];
      titel = t(m.label);
      if (raceLimit > 0) unter.push(raceLimit + ' ' + t(m.unit));
      unter.push(raceFlying ? t('Fliegend') : t('Stehend'));
      unter.push(cars.length + ' ' + t('Autos'));
    } catch (e) { /* settings not ready */ }
    const kopf = document.createElement('div');
    kopf.className = 'hd-sg-kopf'; kopf.setAttribute('data-i18n-skip', '');
    kopf.style.gridRow = '1';
    kopf.innerHTML = '<b>' + esc(t('Startaufstellung')) + '</b><span>' + esc(titel) + '</span>';
    host.insertBefore(kopf, host.firstChild);
    // rows: car i stands in grid row floor(i/2); even index on the right of the track, odd on the left
    const reihen = Math.ceil(cars.length / 2);
    host.querySelectorAll('.grid-row:not(.grid-sc)').forEach((row, i) => {
      const car = cars[i];
      if (!car) return;
      const r = Math.floor(i / 2), rechts = i % 2 === 0;
      row.style.gridRow = String(r + 2);
      row.classList.add('hd-sg-karte', rechts ? 'hd-sg-r' : 'hd-sg-l');
      const f = carColor(car);
      row.style.setProperty('--hd-sg-farbe', f.hex);
      const name = car.alias || car.tag || garageLabel(car);
      const [vor, nach] = hdNameTeile(name);
      const nr = typeof hdNummer === 'function' ? hdNummer(car) : (car.tagChar || i + 1);
      const avatar = typeof hdAvatarSvg === 'function'
        ? (typeof hdAvatarFuerAuto === 'function' ? hdAvatarFuerAuto(car, 64) : hdAvatarSvg(name, f.hex, 0, 64, carModellWert(car.modellId))) : '';
      const ctrl = document.createElement('span');
      ctrl.className = 'hd-sg-ctrl';
      ['.grid-box', '.grid-move'].forEach((sel) => { const el = row.querySelector(sel); if (el) ctrl.appendChild(el); });
      const inhalt = document.createElement('span');
      inhalt.className = 'hd-sg-inhalt'; inhalt.setAttribute('data-i18n-skip', '');
      inhalt.innerHTML = `<span class="hd-sg-nr">${esc(nr)}</span><span class="hd-sg-bild">${avatar}</span>`
        + `<span class="hd-sg-name"><small>${esc(vor)}</small><b>${esc(nach)}</b></span>`;
      inhalt.appendChild(ctrl);
      row.appendChild(inhalt);
    });
    for (let r = 0; r < reihen; r++) {
      const tab = document.createElement('div');
      tab.className = 'hd-sg-reihe'; tab.setAttribute('data-i18n-skip', '');
      tab.style.gridRow = String(r + 2);
      const links = 2 * r + 2 <= cars.length ? 2 * r + 2 : '';
      tab.innerHTML = `<i>${links}</i><b>${esc(t('Reihe {r}').replace('{r}', r + 1))}</b><i>${2 * r + 1}</i>`;
      host.appendChild(tab);
    }
    const sc = host.querySelector('.grid-row.grid-sc');
    if (sc) sc.style.gridRow = String(reihen + 2);
    const fuss = document.createElement('div');
    fuss.className = 'hd-sg-fuss'; fuss.setAttribute('data-i18n-skip', '');
    fuss.style.gridRow = String(reihen + (sc ? 3 : 2));
    let strecke = t('frei');
    try { if (($('setting-ontrack') || {}).checked && currentTrackTiles && currentTrackTiles.length > 1) strecke = currentTrackTiles.length + ' ' + t('Teile') + (typeof trackLaengeText === 'function' ? ' · ' + trackLaengeText(currentTrackTiles) : ''); } catch (e) { /* no track */ }
    fuss.textContent = (t('Strecke') + ': ' + strecke + (unter.length ? ' · ' + unter.join(' · ') : '')).toUpperCase();
    host.appendChild(fuss);
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
      // v3.0: the button must stay held until the car reaches its box; released on the way = cancelled.
      pitState = 'off'; pitReady = false; ort = 0.2; hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false;
      hdAutoBoxTaste(true, true, 1000); hdAutoBoxTaste(true, true, 1500);
      const zuFrueh = !hdAuto.stopp;
      hdAutoBoxTaste(true, true, 2050);
      ok('button: held 1 s starts (not before)', zuFrueh && hdAuto.stopp && hdAuto.stopp.perTaste && pitState === 'limited', 'stopp ' + !!hdAuto.stopp);
      hdAutoBoxTaste(true, true, 2500); hdAutoBoxTaste(true, true, 4000);
      const nochDa = !!hdAuto.stopp;
      hdAutoBoxTaste(false, true, 4040);
      ok('released on the way to the box: cancelled, limiter off (back to normal speed)', nochDa && !hdAuto.stopp && pitState === 'off', 'stopp ' + !!hdAuto.stopp + ', pit ' + pitState);
      hdAutoBoxTaste(true, true, 5000); hdAutoBoxTaste(true, true, 6100);
      ort = box.k + 0.1; hdAutoBoxPilot(car, st, motor, regler, 0);
      const parkt = hdAuto.stopp && hdAuto.stopp.phase === 'einparken';
      hdAutoBoxTaste(false, true, 6200);
      ok('released once parking has begun: the stop carries on', parkt && hdAuto.stopp && hdAuto.stopp.phase === 'einparken', 'phase ' + (hdAuto.stopp && hdAuto.stopp.phase));
      hdAutoBoxEnde(null);
      // v3.0: box 1-2 pieces away - no extra lap. Reached = on the piece, or passed it since the last look.
      const n = currentTrackTiles.length, K = box.k;
      const w = (x) => ((x % n) + n) % n;
      ok('reaching the box: on it, passed during a jump of 2 pieces, just past it - yes; before it or standing - no',
         hdBoxErreicht(w(K - 0.4), K + 0.2, K, n) && hdBoxErreicht(w(K - 0.5), w(K + 1.5), K, n) && hdBoxErreicht(K + 0.3, w(K + 1.2), K, n)
         && !hdBoxErreicht(w(K - 2), w(K - 1), K, n) && !hdBoxErreicht(w(K - 0.5), w(K - 0.5), K, n),
         [hdBoxErreicht(w(K - 0.4), K + 0.2, K, n), hdBoxErreicht(w(K - 0.5), w(K + 1.5), K, n), hdBoxErreicht(K + 0.3, w(K + 1.2), K, n),
          hdBoxErreicht(w(K - 2), w(K - 1), K, n), hdBoxErreicht(w(K - 0.5), w(K - 0.5), K, n)].join(','));
      // Pressed 1 piece before the box; during the 1 s hold the car drove past it: straight in, no extra lap.
      pitState = 'off'; hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false;
      ort = w(K - 1);
      hdAutoBoxTaste(true, true, 9000);
      ort = w(K + 1.3);
      hdAutoBoxTaste(true, true, 10100);
      hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('box passed during the 1 s hold: goes straight in (parks now, no extra lap)', hdAuto.stopp && hdAuto.stopp.phase === 'einparken',
         'phase ' + (hdAuto.stopp && hdAuto.stopp.phase));
      hdAutoBoxEnde(null);
      // Pressed 2 pieces before the box, box still ahead after the hold: drives on and parks on reaching it.
      pitState = 'off'; hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false;
      ort = w(K - 2.5); hdAutoBoxTaste(true, true, 12000);
      ort = w(K - 1.2); hdAutoBoxTaste(true, true, 13100);
      hdAutoBoxPilot(car, st, motor, regler, 0);
      const nochAnfahrt = hdAuto.stopp && hdAuto.stopp.phase === 'anfahrt';
      ort = w(K - 0.3); hdAutoBoxPilot(car, st, motor, regler, 0);
      ort = w(K + 0.4); hdAutoBoxPilot(car, st, motor, regler, 0);
      ok('box 2 pieces ahead: drives on, parks at it the same lap', nochAnfahrt && hdAuto.stopp && hdAuto.stopp.phase === 'einparken',
         'phase ' + (hdAuto.stopp && hdAuto.stopp.phase));
      hdAutoBoxEnde(null);
    } catch (e) {
      ok('automatic pit stop self-test ran', false, String(e && e.stack || e));
    } finally {
      hdAuto.stopp = null; hdAuto.sekunden = merk.sek; hdAuto.gedrueckt = 0; hdAuto.ausgeloest = false; hdAuto.ortDruck = null;
      currentTrackTiles = merk.tiles; playerCar = merk.pc; trackMode = merk.tm; flagState = merk.fl; raceFormationLap = merk.form;
      pitReady = merk.pr; ghostOrt = merk.ort;
      if (pitState !== merk.ps) { try { setPitState(merk.ps); } catch (e) { pitState = merk.ps; } }
      garage.length = 0; merk.garage.forEach((c) => garage.push(c));
      hdBox.zuteilung = merk.zut;
    }
  }

  // ---- AFTER THE FINISH: NPCs DRIVE OFF THE TRACK (Hybrid-Dash 3.0) ----
  // BESTELLT: "when the NPC finishes the race, let them cross the finish line and drive off the track thats 2 track
  // pieces away from the finish line. when they reach the 2 piece track, turn away from the inside of the track and
  // speed up for 1.5s". Replaces the lap back to the grid. Phases (in g.finish, run by ghostFinishTick):
  //   hdWeg   self-guided at formation pace, counting pieces from the finish line (tile counter, like the roll-out)
  //   hdRaus  on the 2nd piece: wheels turned to the outside (no track bytes, so it is a real wheel angle) and
  //           HD_ZIEL_RAUS_GAS for HD_ZIEL_RAUS_MS, then stop (stopGhost: stand still, parking light on).
  const HD_ZIEL_KACHELN = 2, HD_ZIEL_RAUS_MS = 1500, HD_ZIEL_RAUS_GAS = 0.6, HD_ZIEL_RAUS_LENK = 0.8, HD_ZIEL_WEG_MAX_MS = 8000;
  // Turn of a piece in degrees, right positive.
  function hdKachelDreh(t) {
    const T = TILE_TYPE;
    switch (t && t.type) {
      case T.CURVE_RIGHT: return 60; case T.CURVE_LEFT: return -60;
      case T.WEIT_RIGHT: case T.KLEIN_RIGHT: return 30; case T.WEIT_LEFT: case T.KLEIN_LEFT: return -30;
      case T.HAIRPIN: return 180; case T.HAIRPIN_LEFT: return -180;
      default: return 0;
    }
  }
  // The outside of the track at piece k: +1 right, -1 left. On a curve its own outside; on a straight the side
  // away from the inside of the loop (a lap that turns right overall has its inside on the right).
  function hdAussenSeite(k, tiles) {
    tiles = tiles || currentTrackTiles || [];
    const hier = hdKachelDreh(tiles[k]);
    if (hier) return hier > 0 ? -1 : 1;
    const summe = tiles.reduce((a, t) => a + hdKachelDreh(t), 0);
    return summe > 0 ? -1 : 1;
  }
  function hdZielAbfahrtStarten(car) {
    const g = car && car.ghost, tiles = currentTrackTiles || [], n = tiles.length;
    if (!g || n < 3) return false;
    const k = (hdBoxStart(tiles) + HD_ZIEL_KACHELN) % n;
    g.finish = { phase: 'hdWeg', at: rennZeitJetzt(), k, seite: hdAussenSeite(k, tiles),
                 kachelStart: car.tileCount === null || car.tileCount === undefined ? null : car.tileCount };
    g.auslauf = false;
    log(garageLabel(car) + ': finished - drives off the track ' + HD_ZIEL_KACHELN + ' pieces after the line ('
        + (g.finish.seite > 0 ? 'right' : 'left') + ', outside).', 'info');
    return true;
  }
  function hdZielAbfahrtTick(car) {
    const g = car.ghost, f = g && g.finish;
    if (!f) return;
    const now = rennZeitJetzt(), bit = trackModeBit();
    if (f.phase === 'hdWeg') {
      const gefahren = f.kachelStart === null || car.tileCount === null || car.tileCount === undefined
        ? null : ((car.tileCount - f.kachelStart) & 0xff);
      if ((gefahren !== null && gefahren >= HD_ZIEL_KACHELN) || now - f.at >= HD_ZIEL_WEG_MAX_MS) {
        f.phase = 'hdRaus'; f.at = now;
      } else {
        const la = typeof ghostLookahead === 'function' ? ghostLookahead(car) : null;
        writeToCar(car, 0, formationPace(), bit | LIGHT_HEAD, Object.assign({ 10: AUTO_MODE.b10, 15: AUTO_MODE.b15 }, la || {}));
        return;
      }
    }
    if (f.phase === 'hdRaus') {
      if (now - f.at >= HD_ZIEL_RAUS_MS) {
        g.finish = null;
        stopGhost(car);
        log(garageLabel(car) + ': off the track, parked.', 'info');
        return;
      }
      writeToCar(car, f.seite * HD_ZIEL_RAUS_LENK, HD_ZIEL_RAUS_GAS, bit | LIGHT_HEAD);
    }
  }
  function hdZielSelbsttest(ok) {
    const merk = { tiles: currentTrackTiles, rs: raceState, tm: trackMode, write: writeToCar, stop: stopGhost };
    try {
      currentTrackTiles = codeToTrack('SG3R4G3R4').tiles;          // a right-hand loop
      const n = currentTrackTiles.length, s0 = hdBoxStart(currentTrackTiles);
      const outside = hdAussenSeite((s0 + 2) % n);
      ok('finish drive-off: outside of a right-hand loop on a straight is the left', currentTrackTiles[(s0 + 2) % n].type === TILE_TYPE.STRAIGHT ? outside === -1 : true,
         'piece ' + ((s0 + 2) % n) + ' type ' + currentTrackTiles[(s0 + 2) % n].type + ' -> ' + outside);
      const rechts = currentTrackTiles.findIndex((t) => t.type === TILE_TYPE.CURVE_RIGHT);
      ok('finish drive-off: on a right curve the outside is the left', rechts < 0 || hdAussenSeite(rechts) === -1, String(hdAussenSeite(rechts)));
      const gesendet = []; let gestoppt = 0;
      writeToCar = (c, steer, gas, licht, spur) => { gesendet.push({ steer, gas, spur: !!spur }); };
      stopGhost = () => { gestoppt++; };
      trackMode = 'on'; raceState = 'finished';
      const car = { role: 'ghost', alias: 'NPC', device: { id: 'hd-ziel' }, tileCount: 10, ghost: { running: true } };
      ok('finish drive-off: starts after the line', hdZielAbfahrtStarten(car) && car.ghost.finish.phase === 'hdWeg', JSON.stringify(car.ghost.finish));
      hdZielAbfahrtTick(car); car.tileCount = 11; hdZielAbfahrtTick(car);
      const weg = gesendet.slice();
      ok('finish drive-off: first 2 pieces self-guided at formation pace (track bytes, centred)',
         weg.length === 2 && weg.every((x) => x.spur && x.steer === 0 && Math.abs(x.gas - formationPace()) < 1e-9) && car.ghost.finish.phase === 'hdWeg', JSON.stringify(weg));
      car.tileCount = 12; gesendet.length = 0; hdZielAbfahrtTick(car);
      const raus = gesendet[0];
      ok('finish drive-off: on the 2nd piece turns to the outside and speeds up (wheel angle, no track bytes)',
         car.ghost.finish.phase === 'hdRaus' && raus && !raus.spur && Math.sign(raus.steer) === car.ghost.finish.seite && raus.gas > formationPace(), JSON.stringify(raus));
      car.ghost.finish.at -= HD_ZIEL_RAUS_MS + 10; hdZielAbfahrtTick(car);
      ok('finish drive-off: after 1.5 s it stops off the track', !car.ghost.finish && gestoppt === 1, 'stopped ' + gestoppt);
    } catch (e) {
      ok('finish drive-off self-test ran', false, String(e && e.stack || e));
    } finally {
      currentTrackTiles = merk.tiles; raceState = merk.rs; trackMode = merk.tm; writeToCar = merk.write; stopGhost = merk.stop;
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
    hdZielSelbsttest(ok);
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
