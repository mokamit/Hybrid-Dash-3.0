  // =========================================================================
  // HybridDash 2.0 additions
  // =========================================================================
  // Everything HybridDash adds on top of OmegaSim lives in this one file, so upstream
  // OmegaSim changes can still be merged with few conflicts. The original code only gets
  // tiny, guarded hooks (`typeof hdX === 'function'`).
  //
  //   1. AUTO SAFETY CAR   Any racing car that is off track, or has not advanced a single
  //                        track tile, for HD_AUTO_SC_MS (3 s) raises the yellow flag, which
  //                        deploys the safety car (setFlag -> safetyCarRaus).
  //   2. NPC DRIVER NAMES  The first time a car becomes an NPC and has no name yet, it gets a
  //                        random, unique driver name. The name is stored with the car
  //                        profile (carRemember), so it stays the same when the car reconnects.
  //   3. VOICE CALLOUT     The race announcer reads the new driver out together with the car
  //                        they are assigned to ("Mara Kovac takes the red Porsche 911").
  //   4. DRIVER AVATARS    A generated helmet avatar (car colour + initials) per driver,
  //                        shown in the garage. Tap it to restyle.

  const HD_STORE = 'hybriddash.v1';
  const HD_AUTO_SC_MS = 3000;
  const HD_AUTO_SC_COOLDOWN_MS = 8000;

  function hdLaden() {
    try { return Object.assign({ autoSc: true, autoScMs: HD_AUTO_SC_MS, npcNamen: true, npcAnsage: true, avatare: {} },
      JSON.parse(localStorage.getItem(HD_STORE) || '{}')); }
    catch (e) { return { autoSc: true, autoScMs: HD_AUTO_SC_MS, npcNamen: true, npcAnsage: true, avatare: {} }; }
  }
  const hd = hdLaden();
  function hdSpeichern() {
    try { localStorage.setItem(HD_STORE, JSON.stringify(hd)); } catch (e) { /* private mode */ }
  }

  // ---- 1. AUTO SAFETY CAR -----------------------------------------------------------------
  //
  // Checked on its own slow clock (200 ms): we wait for seconds, not milliseconds, and the
  // drive loop must never pay for this.
  //
  // WHO COUNTS: every car that races - player 1-3 and NPCs (and the challenger). Not the
  // safety car or the cleaning car, not a car in the pit lane, not an NPC that is pitting,
  // finishing or deliberately stopped.
  //
  // v2.1 FIX, REPORTED: "the safety car would deploy all the time at the start of the race."
  // A car STANDING STILL reports byte 12 = 0x00, exactly like a car off the track, and of
  // course its tile counter does not move. Every car still on the grid (a human who has not
  // pulled away yet, an NPC with a start delay) therefore looked "off track" and "stuck".
  // Now a car is only watched once it is ARMED: it has driven HD_SC_SCHARF_KACHELN tiles
  // since the last green (start or restart). Plus a grace period after every green.
  //
  // WHAT COUNTS (armed cars only):
  //   off track  byte 12 reads 0x00 for the whole window, or an NPC was parked by the ghost
  //              logic because it left the track.
  //   stagnant   the tile counter has not moved for the whole window.
  //
  // v2.1: THE HOST CONFIRMS. A detection opens a prompt ("Deploy safety car?") instead of
  // raising yellow directly; the Confirmation Button (A / Cross by default, Enter on the
  // keyboard) deploys, Dismiss (Esc) ignores that incident. The prompt closes by itself if the
  // car gets going again. "Ask before deploying" can be switched off in race settings.
  //
  // Only on the track (trackMode 'on'): in printout mode byte 12 is almost always 0x00.
  const HD_SC_SCHARF_KACHELN = 2;
  const HD_SC_GNADE_MS = 6000;
  const hdSc = { offSeit: new Map(), gruenSeit: 0, letzterStatus: '', sperreBis: 0, letzterFlag: 'green',
                 zaehler: new Map(), frage: null, ignoriert: new Map() };

  function hdAutoScAn() { return !!hd.autoSc; }
  function hdAutoScFenster() { return Math.max(1000, Math.min(15000, Number(hd.autoScMs) || HD_AUTO_SC_MS)); }

  function hdRenntAuto(car) {
    if (!car || !car.device) return false;
    if (car.role === 'player') return pitState === 'off';
    const z = zusatzPlatzVonRolle(car.role);
    if (z) return !(z.box && z.box.lage && z.box.lage !== 'aus');
    if (car.role === 'ghost' || car.role === 'challenger') {
      const g = car.ghost;
      if (!g || !g.running) return false;
      if (g.pit || g.nachZiel || g.auslauf) return false;
      if (g.aufstellZiel !== undefined && g.aufstellZiel !== null) return false;
      return true;
    }
    return false;
  }

  // Tiles driven since the last green, counted from changes of the tile counter (byte 11).
  function hdKachelnSeitGruen(car) {
    let z = hdSc.zaehler.get(car);
    if (!z) { z = { letzter: car.tileCount, gefahren: 0 }; hdSc.zaehler.set(car, z); }
    if (car.tileCount !== null && car.tileCount !== undefined && car.tileCount !== z.letzter) {
      if (z.letzter !== null && z.letzter !== undefined) z.gefahren++;
      z.letzter = car.tileCount;
    }
    return z.gefahren;
  }
  function hdScharf(car) { return hdKachelnSeitGruen(car) >= HD_SC_SCHARF_KACHELN; }

  function hdAutoScGrund(car, now) {
    const fenster = hdAutoScFenster();
    // Off track: byte 12 = 0x00 without a break.
    if (car.tileCode === TILE_OFFTRACK || car.parked === 'Bahn verlassen') {
      if (!hdSc.offSeit.has(car)) hdSc.offSeit.set(car, now);
      if (now - hdSc.offSeit.get(car) >= fenster) return 'off';
    } else {
      hdSc.offSeit.delete(car);
    }
    // Stagnant: no tile change for the window (and never before the green).
    const seit = Math.max(car.tileAt || 0, hdSc.gruenSeit);
    if (seit && now - seit >= fenster) return 'stuck';
    return null;
  }

  function hdAutoScRuecksetzen(now) {
    hdSc.gruenSeit = now; hdSc.offSeit.clear(); hdSc.zaehler.clear(); hdSc.ignoriert.clear();
    hdScFrageZu();
  }

  function hdAutoScTick() {
    let now;
    try { now = rennZeitJetzt(); } catch (e) { return; }
    // Every green (start or restart) starts over: grace period, nobody armed yet.
    if (flagState === 'green' && hdSc.letzterFlag !== 'green') {
      hdAutoScRuecksetzen(now);
      hdSc.sperreBis = now + HD_SC_GNADE_MS;
    }
    hdSc.letzterFlag = flagState;
    if (raceState !== 'racing') { hdSc.gruenSeit = 0; hdSc.offSeit.clear(); hdSc.zaehler.clear(); hdScFrageZu(); return; }
    if (!hdSc.gruenSeit) { hdAutoScRuecksetzen(now); hdSc.sperreBis = now + HD_SC_GNADE_MS; }
    // Keep counting tiles even while we do not trigger (grace period, yellow) - arming needs it.
    garage.forEach((c) => { if (c.device) hdKachelnSeitGruen(c); });
    if (!hdAutoScAn() || flagState !== 'green' || trackMode !== 'on' || raceFormationLap
        || rennPauseAktiv() || gelbDeaktiviert()) { hdScFrageZu(); return; }
    // An open prompt closes by itself when its car is going again.
    if (hdSc.frage) {
      const c = hdSc.frage.car;
      if (!garage.includes(c) || !hdRenntAuto(c) || !hdAutoScGrund(c, now)) hdScFrageZu();
      return;
    }
    if (now < hdSc.sperreBis) return;
    for (const car of garage) {
      if (!hdRenntAuto(car) || !hdScharf(car)) { hdSc.offSeit.delete(car); continue; }
      // Dismissed incident: ignore this car until it has driven again.
      const ign = hdSc.ignoriert.get(car);
      if (ign !== undefined) {
        if (hdKachelnSeitGruen(car) >= ign + HD_SC_SCHARF_KACHELN) hdSc.ignoriert.delete(car);
        else continue;
      }
      const grund = hdAutoScGrund(car, now);
      if (!grund) continue;
      if (hd.scFragen === false) hdAutoScAusloesen(car, grund, now);
      else hdScFrageAuf(car, grund);
      return;
    }
  }

  function hdGrundText(grund) {
    const sek = (hdAutoScFenster() / 1000).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
    return grund === 'off' ? t('HD: neben der Strecke').replace('{s}', sek) : t('HD: steht').replace('{s}', sek);
  }

  function hdAutoScAusloesen(car, grund, now) {
    hdSc.sperreBis = now + HD_AUTO_SC_COOLDOWN_MS;
    hdSc.offSeit.clear();
    const name = garageLabel(car);
    hdSc.letzterStatus = name + ' – ' + hdGrundText(grund);
    log('HybridDash: safety car – ' + name + ' (' + grund + ').', 'err');
    setFlag('yellow');
    if (flagState !== 'yellow') return;           // yellow disabled or refused
    showHudToast(t('SAFETY CAR') + ' · ' + name);
    hdSprechen(hdSatz('sc', { name, grund }), 30);
    hdEinstellungenMalen();
  }

  // ---- the confirmation prompt ------------------------------------------------------------
  function hdScFrageOffen() { return !!hdSc.frage; }
  function hdScFrageAuf(car, grund) {
    hdSc.frage = { car, grund, at: performance.now() };
    const box = $('hd-sc-frage');
    if (box) {
      $('hd-sc-frage-wer').textContent = garageLabel(car) + ' · ' + hdGrundText(grund);
      const b = typeof bindings === 'object' && bindings && bindings.confirm;
      $('hd-sc-frage-taste').textContent = (b && b.type !== 'none' ? bindingDescription(b) + ' / ' : '') + 'Enter';
      box.hidden = false;
    }
    hdSprechen(hdSatz('frage', { name: garageLabel(car), grund }), 25);
  }
  function hdScFrageZu() {
    if (!hdSc.frage) return;
    hdSc.frage = null;
    const box = $('hd-sc-frage');
    if (box) box.hidden = true;
  }
  function hdScBestaetigen() {
    const f = hdSc.frage;
    if (!f) return;
    hdScFrageZu();
    hdAutoScAusloesen(f.car, f.grund, rennZeitJetzt());
  }
  function hdScIgnorieren() {
    const f = hdSc.frage;
    if (!f) return;
    hdScFrageZu();
    hdSc.ignoriert.set(f.car, hdKachelnSeitGruen(f.car));
    hdSc.offSeit.delete(f.car);
    log('HybridDash: safety car dismissed for ' + garageLabel(f.car) + '.', 'info');
  }
  // Confirmation Button on any connected controller (rising edge), and Enter / Esc.
  let hdPadVorher = false;
  setInterval(() => {
    let jetzt = false;
    try {
      const b = typeof bindings === 'object' && bindings && bindings.confirm;
      if (b && b.type !== 'none' && navigator.getGamepads) {
        for (const pad of navigator.getGamepads()) {
          if (pad && readBindingValue(pad, b) > BUTTON_CAPTURE_THRESHOLD) { jetzt = true; break; }
        }
      }
    } catch (e) { /* no gamepad API */ }
    if (jetzt && !hdPadVorher && hdSc.frage) hdScBestaetigen();
    hdPadVorher = jetzt;
  }, 40);
  document.addEventListener('keydown', (e) => {
    if (!hdSc.frage) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); hdScBestaetigen(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hdScIgnorieren(); }
  }, true);
  (function () {
    const j = $('hd-sc-frage-ja'), n = $('hd-sc-frage-nein');
    if (j) j.addEventListener('click', hdScBestaetigen);
    if (n) n.addEventListener('click', hdScIgnorieren);
  })();

  setInterval(hdAutoScTick, 200);

  // ---- 1b. THE FIELD UNDER THE SAFETY CAR (v2.1) -------------------------------------------
  //
  // REPORTED: "Make sure they do not crash with each other and maintain a reasonable gap. No
  // overtakes during the safety car."
  //
  // What OmegaSim already did under yellow: one speed for everybody, no overtaking manoeuvres
  // (ghostSpice off), a gap factor that slows a car when the car ahead is within 1.5 tiles, and
  // a hard cap behind the safety car itself. Why cars still touched: the gap factor runs FIRST,
  // and afterwards the corner profile and the minimum speed (0.37, below which the car cannot
  // read the track) are applied - the floor lifted a follower back up to the speed of a leader
  // that was braking for a hairpin. So the follower closed in exactly where it should not.
  //
  // hdGelbFolge() is the LAST word on the target speed under yellow, after the floor: within
  // hdFolge.voll tiles of the car ahead, never faster than that car's own target; closer than
  // hdFolge.eng tiles, hdFolge.boden of it, so the gap opens again. Going a little under the
  // read threshold for a moment is allowed - the off-track detector gets grace for it (gnadeBis),
  // and the car ahead pulls away, so it never lasts long. Used for NPCs (ghostTick) and for your
  // car's autopilot under yellow (50-drive.js).
  const hdFolge = { voll: 2.2, eng: 0.8, boden: 0.82, min: 0.26 };
  function hdFuehrTempo(o, now) {
    if (!o) return null;
    if (o.ghost && o.ghost.running && o.ghost.lastTarget > 0) return o.ghost.lastTarget;
    if (o.hdZiel > 0 && now - (o.hdZielAt || 0) < 400) return o.hdZiel;
    if (o === playerCar && physEngine && physEngine.config && physEngine.config.topSpeedKmh)
      return Math.abs(physEngine.state.speedKmh) / physEngine.config.topSpeedKmh;
    return null;
  }
  function hdGelbFolge(car, target, now) {
    if (hd.gelbFolge === false || flagState === 'green' || !car) return target;
    if (car.ghost && (car.ghost.pit || car.ghost.randHalt)) return target;
    const v = gelbVordermann(car);
    if (!v || v.gap >= hdFolge.voll) return target;
    const lt = hdFuehrTempo(v.car, now);
    if (!(lt > 0)) return target;
    const x = Math.max(0, Math.min(1, (v.gap - hdFolge.eng) / (hdFolge.voll - hdFolge.eng)));
    const deckel = Math.max(hdFolge.min, lt * (hdFolge.boden + (1 - hdFolge.boden) * x));
    if (deckel >= target) return target;
    // Slower than the read threshold for a moment: not an off-track excursion.
    if (car.ghost && deckel < GHOST_READ_MIN) car.ghost.gnadeBis = Math.max(car.ghost.gnadeBis || 0, now + 700);
    return deckel;
  }

  // ---- 2. NPC DRIVER NAMES ----------------------------------------------------------------
  //
  // Invented first/last name pairs. The lists deliberately avoid the surnames of famous
  // racing drivers, so a random pair does not accidentally name a real person.
  // Every combination is at most 18 characters (the name field's maxlength).
  const HD_VORNAMEN = [
    'Mara', 'Jonas', 'Aiko', 'Luca', 'Noor', 'Mateo', 'Freya', 'Kofi', 'Ines', 'Ravi',
    'Sofia', 'Emil', 'Yara', 'Tariq', 'Lena', 'Diego', 'Hana', 'Felix', 'Zuri', 'Oskar',
    'Priya', 'Nico', 'Elif', 'Bruno', 'Maya', 'Kenji', 'Alba', 'Theo', 'Nadia', 'Rafael',
    'Ivy', 'Malik', 'Clara', 'Sven', 'Amara', 'Leo', 'Rosa', 'Dario', 'Kaia', 'Milan',
  ];
  const HD_NACHNAMEN = [
    'Kovac', 'Lindqvist', 'Moreau', 'Okafor', 'Tanaka', 'Brandt', 'Castell', 'Novak',
    'Reyes', 'Halvorsen', 'Duval', 'Mensah', 'Petrov', 'Sandoval', 'Whitlock', 'Ferreira',
    'Kaplan', 'Ishikawa', 'Varga', 'Delacroix', 'Osei', 'Marchetti', 'Nyberg', 'Quinn',
    'Rahimi', 'Solberg', 'Thorne', 'Adeyemi', 'Calloway', 'Bianchi', 'Strand', 'Morales',
    'Hartmann', 'Zielinski', 'Achebe', 'Lund', 'Navarro', 'Castro', 'Fontaine', 'Mbeki',
  ];

  function hdZufallsName(belegt) {
    for (let i = 0; i < 200; i++) {
      const n = HD_VORNAMEN[Math.floor(Math.random() * HD_VORNAMEN.length)] + ' '
              + HD_NACHNAMEN[Math.floor(Math.random() * HD_NACHNAMEN.length)];
      if (n.length <= 18 && !belegt.has(n.toLowerCase())) return n;
    }
    return 'Driver ' + Math.floor(100 + Math.random() * 900);
  }
  function hdBelegteNamen(ausser) {
    const s = new Set();
    garage.forEach(c => { if (c !== ausser && c.alias) s.add(c.alias.toLowerCase()); });
    try { Object.values(carStore()).forEach(e => { if (e && e.alias) s.add(String(e.alias).toLowerCase()); }); }
    catch (e) { /* no store */ }
    return s;
  }

  const HD_FARBEN = {
    en: { weiss: 'white', schwarz: 'black', rot: 'red', blau: 'blue', gruen: 'green', gelb: 'yellow', lila: 'purple', orange: 'orange' },
    de: { weiss: 'weißen', schwarz: 'schwarzen', rot: 'roten', blau: 'blauen', gruen: 'grünen', gelb: 'gelben', lila: 'lila', orange: 'orangen' },
    es: { weiss: 'blanco', schwarz: 'negro', rot: 'rojo', blau: 'azul', gruen: 'verde', gelb: 'amarillo', lila: 'morado', orange: 'naranja' },
  };
  function hdFarbName(id) { return (HD_FARBEN[lang] || HD_FARBEN.en)[id] || ''; }
  // What the announcer calls the car: colour + model if a model is set, else colour + tag.
  function hdAutoBeschreibung(car) {
    const farbe = carColor(car);
    const farbName = farbe && farbe.auto !== false ? hdFarbName(farbe.id) : '';
    const modell = carModellWert(car.modellId) ? carModellName(car.modellId) : '';
    if (modell) return (farbName ? farbName + ' ' : '') + modell;
    return (farbName ? farbName + ' ' : '') + (lang === 'de' ? 'Auto ' : lang === 'es' ? 'coche ' : 'car ') + (car.tag || '');
  }

  // Hook, called at the end of setCarRole() in 90-ghosts.js.
  function hdRolleGesetzt(car, role) {
    if (role !== 'ghost' || !hd.npcNamen || !car || car.alias) return;
    car.alias = hdZufallsName(hdBelegteNamen(car));
    carRemember(car);
    log('HybridDash: new NPC driver ' + car.alias + ' in ' + hdAutoBeschreibung(car) + '.', 'info');
    showHudToast(t('Neuer Fahrer') + ': ' + car.alias);
    // While a car is being connected and "Announce all drivers" is on, the connect
    // announcement (hdAutoVerbunden) names it - no second sentence here.
    const imVerbinden = hd.alleAnsagen && garVerbindetGerade.has(String(car.device.id));
    if (hd.npcAnsage && !imVerbinden) hdSprechen(hdSatz('fahrer', { name: car.alias, auto: hdAutoBeschreibung(car) }), 10);
    if (typeof renderGarage === 'function') renderGarage();
    if (typeof renderRaceGrid === 'function') renderRaceGrid();
  }

  // v2.1 "Announce all drivers": every car that connects is announced with driver, car and
  // colour. Hook, called at the end of garageGeraetAufnehmen() in 90-ghosts.js.
  function hdAutoVerbunden(car) {
    if (!hd.alleAnsagen || !car) return;
    hdSprechen(hdSatz('verbunden', { name: garageLabel(car), tag: car.tag, auto: hdAutoBeschreibung(car),
                                     farbe: hdFarbName(carColor(car).id), modell: carModellWert(car.modellId) ? carModellName(car.modellId) : '' }), 10);
  }

  // Give a car a fresh random name (the dice button in the garage).
  function hdNeuerName(car) {
    car.alias = hdZufallsName(hdBelegteNamen(car));
    carRemember(car);
    if (hd.npcAnsage && car.role === 'ghost') hdSprechen(hdSatz('fahrer', { name: car.alias, auto: hdAutoBeschreibung(car) }), 10);
    renderGarage();
    if (typeof renderRaceGrid === 'function') renderRaceGrid();
  }

  // ---- 3. VOICE ---------------------------------------------------------------------------
  // Through the app's announcement queue (80a-ansagen.js), so it never talks over a lap time
  // or the race intro, and obeys the sound switch and the pause.
  function hdSatz(art, x) {
    if (lang === 'de') {
      if (art === 'fahrer') return 'Neu im Feld: ' + x.name + ', im ' + x.auto + '.';
      if (art === 'verbunden') return x.name === x.tag
        ? 'Auto ' + x.tag + ' verbunden' + (x.farbe || x.modell ? ': ' + [x.farbe && x.farbe.replace(/en$/, ''), x.modell].filter(Boolean).join(' ') : '') + '.'
        : x.name + ' ist verbunden, im ' + x.auto + '.';
      if (art === 'frage') return 'Safety Car? ' + x.name + (x.grund === 'off' ? ' ist neben der Strecke.' : ' steht.');
      return 'Safety Car! ' + x.name + (x.grund === 'off' ? ' ist von der Strecke abgekommen.' : ' steht auf der Strecke.');
    }
    if (lang === 'es') {
      if (art === 'fahrer') return 'Nuevo piloto: ' + x.name + ', en el ' + x.auto + '.';
      if (art === 'verbunden') return x.name === x.tag
        ? 'Coche ' + x.tag + ' conectado' + (x.farbe || x.modell ? ': ' + [x.modell, x.farbe].filter(Boolean).join(' ') : '') + '.'
        : x.name + ' está conectado, en el ' + x.auto + '.';
      if (art === 'frage') return '¿Coche de seguridad? ' + x.name + (x.grund === 'off' ? ' está fuera de pista.' : ' está detenido.');
      return '¡Coche de seguridad! ' + x.name + (x.grund === 'off' ? ' se ha salido de la pista.' : ' está detenido en la pista.');
    }
    if (art === 'fahrer') return 'New driver: ' + x.name + ', driving the ' + x.auto + '.';
    if (art === 'verbunden') return x.name === x.tag
      ? 'Car ' + x.tag + ' connected' + (x.farbe || x.modell ? ': ' + [x.farbe, x.modell].filter(Boolean).join(' ') : '') + '.'
      : x.name + ' is connected, driving the ' + x.auto + '.';
    if (art === 'frage') return 'Safety car? ' + x.name + (x.grund === 'off' ? ' is off track.' : ' has stopped.');
    return 'Safety car deployed! ' + x.name + (x.grund === 'off' ? ' has gone off track.' : ' has stopped on track.');
  }
  function hdSprechen(text, prioritaet) {
    if (!text || typeof rennAnsagen === 'undefined') return;
    const spr = lang;
    rennAnsagen.einreihen('hybriddash', prioritaet || 10, async (gueltig) => {
      if (!gueltig()) return;
      await ansagenTextSpielen(text, spr === 'es' ? 'en' : spr);
    }, () => soundEnabled && lang === spr, 20000);
  }

  // ---- 4. DRIVER AVATARS ------------------------------------------------------------------
  // A small inline SVG helmet: shell in the car colour, a visor, an accent stripe and the
  // initials. Deterministic from name + style number, so it looks the same everywhere.
  const HD_AKZENTE = ['#ffd23f', '#00d6ff', '#ff2a60', '#7cff6b', '#ffffff', '#ff8a00', '#b18cff', '#14161c'];
  function hdHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hdInitialen(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  function hdAvatarSvg(name, farbeHex, stil, px) {
    const h = hdHash(String(name) + '#' + (stil || 0));
    const akzent = HD_AKZENTE[h % HD_AKZENTE.length];
    const muster = (h >>> 3) % 3;
    const schale = farbeHex || '#3b7fe2';
    const ini = hdInitialen(name).replace(/[&<>"]/g, '');
    const streifen = muster === 0
      ? `<path d="M32 6v26" stroke="${akzent}" stroke-width="6"/>`
      : muster === 1
        ? `<path d="M10 30 Q32 14 54 30" stroke="${akzent}" stroke-width="5" fill="none"/>`
        : `<circle cx="20" cy="20" r="5" fill="${akzent}"/><circle cx="44" cy="20" r="5" fill="${akzent}"/>`;
    return `<svg class="hd-avatar" width="${px}" height="${px}" viewBox="0 0 64 64" aria-hidden="true">`
      + `<circle cx="32" cy="32" r="31" fill="#0d1015"/>`
      + `<path d="M8 40 C8 18 20 6 34 6 C50 6 58 20 58 36 L58 46 Q58 52 52 52 L14 52 Q8 52 8 46 Z" fill="${schale}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`
      + streifen
      + `<path d="M22 34 H56 V44 Q56 46 54 46 H26 Q22 46 22 42 Z" fill="#14161c" opacity=".88"/>`
      + `<text x="39" y="43.5" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="800" fill="${akzent}" text-anchor="middle">${ini}</text>`
      + `</svg>`;
  }
  function hdAvatarStil(car) { return (hd.avatare && hd.avatare[String(car.device.id)]) || 0; }
  // Hook used by the garage card (90-ghosts.js).
  function hdAvatarHtml(car, px) {
    if (!car || !car.device) return '';
    const name = car.alias || car.tag || garageLabel(car);
    return `<button type="button" class="hd-avatar-knopf" data-hd-avatar="${String(car.device.id).replace(/"/g, '')}" `
      + `title="${t('Avatar ändern')}">${hdAvatarSvg(name, carColor(car).hex, hdAvatarStil(car), px || 34)}</button>`;
  }
  // One delegated listener: garage cards are re-rendered often.
  document.addEventListener('click', (e) => {
    const k = e.target && e.target.closest && e.target.closest('[data-hd-avatar]');
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const id = k.getAttribute('data-hd-avatar');
    hd.avatare = hd.avatare || {};
    hd.avatare[id] = (hd.avatare[id] || 0) + 1;
    hdSpeichern();
    if (typeof renderGarage === 'function') renderGarage();
  }, true);

  // ---- SETTINGS (Race settings > HybridDash) ----------------------------------------------
  function hdEinstellungenMalen() {
    const a = $('hd-auto-sc'); if (a) a.checked = !!hd.autoSc;
    const s = $('hd-auto-sc-sek'); if (s) s.value = String(hdAutoScFenster() / 1000);
    const sw = $('hd-auto-sc-sek-wert'); if (sw) sw.textContent = (hdAutoScFenster() / 1000).toFixed(1) + ' s';
    const fr = $('hd-sc-fragen'); if (fr) fr.checked = hd.scFragen !== false;
    const n = $('hd-npc-namen'); if (n) n.checked = !!hd.npcNamen;
    const v = $('hd-npc-ansage'); if (v) v.checked = !!hd.npcAnsage;
    const al = $('hd-alle-ansagen'); if (al) al.checked = !!hd.alleAnsagen;
    const st = $('hd-auto-sc-status'); if (st) st.textContent = hdSc.letzterStatus ? t('Zuletzt') + ': ' + hdSc.letzterStatus : '';
  }
  (function hdEinstellungenAnbinden() {
    const an = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', () => { fn(el); hdSpeichern(); hdEinstellungenMalen(); }); };
    an('hd-auto-sc', el => { hd.autoSc = el.checked; });
    an('hd-sc-fragen', el => { hd.scFragen = el.checked; });
    an('hd-npc-namen', el => { hd.npcNamen = el.checked; });
    an('hd-npc-ansage', el => { hd.npcAnsage = el.checked; });
    an('hd-alle-ansagen', el => { hd.alleAnsagen = el.checked; });
    const s = $('hd-auto-sc-sek');
    if (s) s.addEventListener('input', () => { hd.autoScMs = Math.round(Number(s.value) * 1000); hdSpeichern(); hdEinstellungenMalen(); });
    hdEinstellungenMalen();
  })();

  // Strings this file adds live in I18N_EN / I18N_ES (10-ble-explorer.js, 'HybridDash 2.0' block).

  // ---- SELF-TEST (window.HYBRIDDASH.selbsttest()) ----------------------------------------
  // Works on stand-in cars, like the app's own self-tests, and puts every touched state back.
  function hdSelbsttest() {
    const out = [];
    const merk = { raceState, flagState, trackMode, raceFormationLap, pitState,
                   garage: garage.slice(), hd: JSON.stringify(hd), sc: Object.assign({}, hdSc),
                   store: JSON.stringify(carStore()) };
    const fake = (id, role, extra) => Object.assign({ role, alias: '', device: { id, name: id },
      colorId: 'rot', tag: 'Alpha', tileCode: 0x02, tileAt: 0, parked: null }, extra || {});
    const prüfen = (name, ok, mass) => out.push({ name, ok: !!ok, mass });
    const zurueck = () => {
      if (flagState !== 'green') gelbBeenden();
      raceState = merk.raceState; flagState = merk.flagState; trackMode = merk.trackMode;
      raceFormationLap = merk.raceFormationLap; pitState = merk.pitState;
      garage.length = 0; merk.garage.forEach(c => garage.push(c));
      Object.assign(hd, JSON.parse(merk.hd)); Object.assign(hdSc, merk.sc); hdSc.offSeit = new Map(); hdSc.zaehler = new Map(); hdSc.ignoriert = new Map(); hdScFrageZu();
      carStoreSchreiben(JSON.parse(merk.store));
    };
    try {
      const now = rennZeitJetzt();
      garage.length = 0; hd.autoSc = true; hd.autoScMs = 3000;
      raceState = 'racing'; flagState = 'green'; trackMode = 'on'; raceFormationLap = false; pitState = 'off';
      hdSc.letzterFlag = 'green'; hdSc.sperreBis = 0; hdSc.offSeit = new Map();

      // Helpers: a fresh green, and "drive n tiles" (the tile counter changes, seen by a tick).
      const gruen = () => { hdAutoScRuecksetzen(now - 20000); hdSc.sperreBis = 0; hdSc.letzterFlag = 'green'; };
      const fahren = (c, n) => { for (let i = 0; i < n; i++) { c.tileCount = ((c.tileCount || 0) + 1) & 0xff; c.tileAt = now; hdAutoScTick(); } };
      const reset = () => { hdScFrageZu(); if (flagState !== 'green') gelbBeenden(); hdSc.letzterFlag = 'green'; hdSc.sperreBis = 0; };
      hd.scFragen = true;

      // A: REPORTED BUG - a car standing on the grid (byte 12 = 0x00 at standstill, counter
      // not moving) for 20 s after green never triggers, because it never drove.
      const a = fake('hd-a', 'player', { tileCount: 5, tileCode: TILE_OFFTRACK, tileAt: now - 20000 });
      garage.push(a); gruen();
      hdSc.offSeit.set(a, now - 20000);
      for (let i = 0; i < 3; i++) hdAutoScTick();
      prüfen('standing on the grid after green: no safety car, no prompt', flagState === 'green' && !hdScFrageOffen(),
             'flag ' + flagState + ', prompt ' + hdScFrageOffen());

      // B: grace period right after green, even for a car that already drove.
      a.tileCode = 0x02; hdAutoScRuecksetzen(now); hdSc.sperreBis = now + HD_SC_GNADE_MS; hdSc.letzterFlag = 'green';
      fahren(a, 3); a.tileAt = now - 5000; hdAutoScTick();
      prüfen('grace period after green: nothing', !hdScFrageOffen() && flagState === 'green', 'prompt ' + hdScFrageOffen());
      reset();

      // C: a moving car does not trigger.
      gruen(); fahren(a, 3); a.tileAt = now - 500; hdAutoScTick();
      prüfen('moving car: no prompt', !hdScFrageOffen(), 'prompt ' + hdScFrageOffen());

      // D: drove, then stuck > 3 s -> PROMPT, the flag stays green until confirmed.
      a.tileAt = now - 2500; hdAutoScTick();
      const bei25 = hdScFrageOffen();
      a.tileAt = now - 3500; hdAutoScTick();
      prüfen('stuck > 3 s after driving: asks the host, flag still green', !bei25 && hdScFrageOffen() && flagState === 'green',
             'at 2.5 s ' + bei25 + ', at 3.5 s ' + hdScFrageOffen() + ', flag ' + flagState);

      // E: the Confirmation Button deploys.
      hdScBestaetigen();
      prüfen('confirm deploys the safety car', flagState === 'yellow' && !hdScFrageOffen(), 'flag ' + flagState);
      reset();

      // F: dismiss -> ignored until the car drives again; then it can ask again.
      gruen(); fahren(a, 3); a.tileAt = now - 4000; hdAutoScTick();
      const gefragt = hdScFrageOffen();
      hdScIgnorieren(); hdAutoScTick(); hdAutoScTick();
      const still = !hdScFrageOffen() && flagState === 'green';
      fahren(a, 3); a.tileAt = now - 4000; hdAutoScTick();
      prüfen('dismiss ignores the incident until the car drives again', gefragt && still && hdScFrageOffen(),
             'asked ' + gefragt + ', quiet after dismiss ' + still + ', asks again ' + hdScFrageOffen());
      reset();

      // G2: the prompt closes by itself when the car gets going.
      gruen(); fahren(a, 3); a.tileAt = now - 4000; hdAutoScTick();
      const auf = hdScFrageOffen(); fahren(a, 1);
      prüfen('prompt closes by itself when the car moves again', auf && !hdScFrageOffen() && flagState === 'green', 'open ' + auf);
      reset();

      // H: off track (0x00) > 3 s after driving -> prompt.
      gruen(); fahren(a, 3); a.tileCode = TILE_OFFTRACK; hdSc.offSeit.set(a, now - 3100); hdAutoScTick();
      prüfen('off track > 3 s after driving: asks the host', hdScFrageOffen(), 'prompt ' + hdScFrageOffen());
      reset(); a.tileCode = 0x02;

      // I: "Ask before" off -> straight to yellow.
      hd.scFragen = false; gruen(); fahren(a, 3); a.tileAt = now - 4000; hdAutoScTick();
      prüfen('ask-before off: deploys straight away', flagState === 'yellow' && !hdScFrageOffen(), 'flag ' + flagState);
      reset(); hd.scFragen = true;

      // J: switched off, pit lane, the safety car itself -> nothing.
      hd.autoSc = false; gruen(); fahren(a, 3); a.tileAt = now - 5000; hdAutoScTick();
      const aus = !hdScFrageOffen(); hd.autoSc = true;
      pitState = 'servicing'; gruen(); fahren(a, 3); a.tileAt = now - 5000; hdAutoScTick();
      const pit = !hdScFrageOffen(); pitState = 'off';
      a.role = 'safetycar'; gruen(); fahren(a, 3); a.tileAt = now - 5000; hdAutoScTick();
      const sc = !hdScFrageOffen(); a.role = 'player';
      prüfen('setting off, pit lane and the safety car itself are ignored', aus && pit && sc, 'off ' + aus + ', pit ' + pit + ', sc ' + sc);
      reset();

      // K: while the prompt is open, A/Cross does not also call a pit stop / yellow flag.
      gruen(); fahren(a, 3); a.tileAt = now - 4000; hdAutoScTick();
      const merkPrev = prevYellowFlag;
      flagTasteTick(true);
      prüfen('prompt open: the button does nothing else', flagState === 'green' && pitState === 'off', 'flag ' + flagState + ', pit ' + pitState);
      flagTasteTick(false); prevYellowFlag = merkPrev;
      prüfen('Confirmation Button is in the mapping, default A / Cross', DEFAULT_BINDINGS.confirm && DEFAULT_BINDINGS.confirm.index === 0
             && BIND_ACTION_LABELS.confirm === 'Bestätigungstaste' && t('Bestätigungstaste') === (lang === 'de' ? 'Bestätigungstaste' : lang === 'en' ? 'Confirmation Button' : t('Bestätigungstaste')),
             JSON.stringify(DEFAULT_BINDINGS.confirm));
      reset();

      // G: NPC driver name on first NPC assignment, unique, kept when set again, announced.
      hd.npcNamen = true; hd.npcAnsage = true;
      const merkSound = soundEnabled; soundEnabled = true;
      const jobsVorher = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length;
      const b = fake('hd-b', 'ghost'), c = fake('hd-c', 'ghost');
      garage.push(b, c);
      hdRolleGesetzt(b, 'ghost'); hdRolleGesetzt(c, 'ghost');
      const nameB = b.alias;
      hdRolleGesetzt(b, 'ghost');
      const jobs = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length - jobsVorher;
      rennAnsagen.jobs = rennAnsagen.jobs.filter(j => j.art !== 'hybriddash');
      soundEnabled = merkSound;
      prüfen('NPC gets a random driver name', /^\S+ \S+$/.test(nameB) && nameB.length <= 18, nameB);
      prüfen('names are unique and stay', b.alias === nameB && c.alias && c.alias !== b.alias, b.alias + ' / ' + c.alias);
      prüfen('new drivers are announced', jobs === 2, jobs + ' announcements queued');
      const satz = lang === 'en' ? hdSatz('fahrer', { name: b.alias, auto: hdAutoBeschreibung(b) }) : '';
      prüfen('announcement names the car', !satz || satz === 'New driver: ' + b.alias + ', driving the red car ' + b.tag + '.', satz);

      // G3: "Announce all drivers": a connecting car is announced with driver, car and colour.
      hd.alleAnsagen = true; soundEnabled = true;
      const vorAlle = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length;
      const d = fake('hd-d', 'player', { alias: 'Mara Kovac', colorId: 'blau', tag: 'Gamma', modellId: 'porsche911' });
      hdAutoVerbunden(d);
      const alle = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length - vorAlle;
      rennAnsagen.jobs = rennAnsagen.jobs.filter(j => j.art !== 'hybriddash');
      const satzAlle = hdSatz('verbunden', { name: 'Mara Kovac', tag: 'Gamma', auto: 'blue Porsche 911', farbe: 'blue', modell: 'Porsche 911' });
      const satzTag = hdSatz('verbunden', { name: 'Gamma', tag: 'Gamma', auto: 'blue car Gamma', farbe: 'blue', modell: '' });
      soundEnabled = merkSound; hd.alleAnsagen = false;
      prüfen('announce all drivers: connecting car is announced', alle === 1 && (lang !== 'en' ||
             (satzAlle === 'Mara Kovac is connected, driving the blue Porsche 911.' && satzTag === 'Car Gamma connected: blue.')),
             satzAlle + ' | ' + satzTag);

      // H: avatar.
      const svg = hdAvatarSvg('Mara Kovac', '#e23b3b', 0, 30);
      prüfen('avatar renders with initials', /<svg[\s\S]*>MK<\/text>/.test(svg), svg.length + ' chars');
    } catch (e) {
      prüfen('self-test ran', false, String(e && e.stack || e));
    } finally { zurueck(); }
    return out;
  }

  // Diagnostics / tests.
  window.HYBRIDDASH = Object.freeze({
    status: () => ({ autoSc: hd.autoSc, fensterMs: hdAutoScFenster(), letzter: hdSc.letzterStatus,
                     gruenSeit: hdSc.gruenSeit, sperreBis: hdSc.sperreBis }),
    zufallsName: () => hdZufallsName(hdBelegteNamen(null)),
    avatarSvg: hdAvatarSvg,
    tick: hdAutoScTick,
    selbsttest: hdSelbsttest,
    // Race simulation hooks for the yellow-flag measurement (tests only).
    sim: { start: () => simStart(), stop: () => simStop('test'), gelb: () => setFlag('yellow'), gruen: () => gelbBeenden(),
           folge: (an) => { hd.gelbFolge = !!an; }, kacheln: () => (currentTrackTiles || []).length, param: (o) => Object.assign(hdFolge, o || {}) },
  });
