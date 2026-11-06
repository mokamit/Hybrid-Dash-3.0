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
                 zaehler: new Map(), frage: null, ignoriert: new Map(), box: new Map() };

  function hdAutoScAn() { return !!hd.autoSc; }
  function hdAutoScFenster() { return Math.max(1000, Math.min(15000, Number(hd.autoScMs) || HD_AUTO_SC_MS)); }

  // REQUESTED: a car stopped in the pit never triggers the safety car prompt. In the pit =
  // its pit stop is running, it stands on the pit marker tile, or it has not moved since its
  // stop ended (it still stands in the box: the stagnant timer would fire the moment the
  // stop is over). The memory clears on the car's first tile change after the stop.
  function hdInBox(car, boxAktiv) {
    if (boxAktiv) { hdSc.box.set(car, car.tileAt || 0); return true; }
    try { if (pitMarkerCode !== null && car.tileCode === pitMarkerCode) return true; } catch (e) { /* no marker */ }
    if (hdSc.box.has(car)) {
      if ((car.tileAt || 0) === hdSc.box.get(car)) return true;
      hdSc.box.delete(car);
    }
    return false;
  }
  function hdRenntAuto(car) {
    if (!car || !car.device) return false;
    if (typeof hdDnfAuto === 'function' && hdDnfAuto(car)) return false;   // retired by race control
    if (car.role === 'player') return !hdInBox(car, pitState !== 'off');
    const z = zusatzPlatzVonRolle(car.role);
    if (z) return !hdInBox(car, !!(z.box && z.box.lage && z.box.lage !== 'aus'));
    if (car.role === 'ghost' || car.role === 'challenger') {
      const g = car.ghost;
      if (!g || !g.running) return false;
      if (hdInBox(car, !!g.pit)) return false;
      if (g.nachZiel || g.auslauf) return false;
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
    hdSc.gruenSeit = now; hdSc.offSeit.clear(); hdSc.zaehler.clear(); hdSc.ignoriert.clear(); hdSc.box.clear();
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
    hdSprechen(hdSatz('sc', { name: hdSprechName(car, true), grund }), 30);
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
      $('hd-sc-frage-taste').textContent = (b && b.type !== 'none' ? (b.type === 'button' && b.index === 0 ? 'A' : t(bindingDescription(b))) + ' / ' : '') + 'Enter';
      const n = $('hd-sc-frage-nein-taste'); if (n) n.textContent = (b && b.type === 'button' && b.index === 1 ? '' : 'B / ') + 'Esc';
      const v = $('hd-sc-frage-vsc-taste'); if (v) v.textContent = (b && b.type === 'button' && b.index === 2 ? '' : 'X / ') + 'V';
      box.hidden = false;
    }
    hdSprechen(hdSatz('frage', { name: hdSprechName(car, true), grund }), 25);
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
  // REQUESTED: a virtual safety car as the third answer - the whole field slows to the
  // safety-car pace, gaps kept, but no safety car goes out (Race Director's VSC).
  function hdScVsc() {
    const f = hdSc.frage;
    if (!f) return;
    hdScFrageZu();
    const now = rennZeitJetzt();
    hdSc.sperreBis = now + HD_AUTO_SC_COOLDOWN_MS;
    hdSc.offSeit.clear();
    hdSc.letzterStatus = garageLabel(f.car) + ' – ' + hdGrundText(f.grund) + ' (VSC)';
    log('HybridDash: virtual safety car – ' + garageLabel(f.car) + ' (' + f.grund + ').', 'err');
    if (typeof hdRlFlagge === 'function') hdRlFlagge('vsc');
    hdEinstellungenMalen();
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
  // REQUESTED: Ignore on the B button (Xbox; Circle on PlayStation) too. B is upshift by
  // default, so while the prompt is open - and until B is let go after ignoring - the gearbox
  // does not see it (hdScTasteB, read by the pad loop in 90-ghosts.js).
  // Likewise X (Xbox; Square on PlayStation) answers VSC; X is downshift by default.
  let hdPadVorher = false;
  const HD_B = 1, HD_X = 2;   // standard gamepad mapping: B / Circle, X / Square
  const hdTaste = { [HD_B]: { vorher: false, gesperrt: false, tun: () => hdScIgnorieren() },
                    [HD_X]: { vorher: false, gesperrt: false, tun: () => hdScVsc() } };
  function hdScTasteGesperrt(i) { const k = hdTaste[i]; return !!k && (!!hdSc.frage || k.gesperrt); }
  function hdScTasteB() { return hdScTasteGesperrt(HD_B); }
  setInterval(() => {
    let jetzt = false;
    const gedrueckt = {};
    try {
      const b = typeof bindings === 'object' && bindings && bindings.confirm;
      const bestIndex = b && b.type === 'button' ? b.index : -1;
      if (navigator.getGamepads) {
        for (const pad of navigator.getGamepads()) {
          if (!pad) continue;
          if (b && b.type !== 'none' && readBindingValue(pad, b) > BUTTON_CAPTURE_THRESHOLD) jetzt = true;
          for (const i of [HD_B, HD_X]) if (i !== bestIndex && pad.buttons[i] && pad.buttons[i].pressed) gedrueckt[i] = true;
        }
      }
    } catch (e) { /* no gamepad API */ }
    if (jetzt && !hdPadVorher && hdSc.frage) hdScBestaetigen();
    for (const i of [HD_B, HD_X]) {
      const k = hdTaste[i], an = !!gedrueckt[i];
      if (an && !k.vorher && hdSc.frage) { k.tun(); k.gesperrt = true; }
      if (!an) k.gesperrt = false;
      k.vorher = an;
    }
    hdPadVorher = jetzt;
  }, 40);
  document.addEventListener('keydown', (e) => {
    if (!hdSc.frage) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); hdScBestaetigen(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hdScIgnorieren(); }
    else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); e.stopImmediatePropagation(); hdScVsc(); }
  }, true);
  (function () {
    const j = $('hd-sc-frage-ja'), n = $('hd-sc-frage-nein');
    if (j) j.addEventListener('click', hdScBestaetigen);
    if (n) n.addEventListener('click', hdScIgnorieren);
    const v = $('hd-sc-frage-vsc'); if (v) v.addEventListener('click', hdScVsc);
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
  // v2.2: closer queue, 1-2 car lengths of air (was voll 2.2, eng 0.8 tiles); see GELB_ABSTAND_* in 90-ghosts.js.
  const hdFolge = { voll: 0.65, eng: 0.35, boden: 0.82, min: 0.26 };
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
    if (typeof hdDnfAuto === 'function' && hdDnfAuto(v.car)) return target;   // a retired car is not a leader
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
  // What the announcer calls the car: colour + make and model ("yellow BMW M4 GT3"); without
  // a model, colour + "car". The car NUMBER is said separately (hdSatz).
  function hdAutoBeschreibung(car) {
    const farbe = carColor(car);
    const farbName = farbe && farbe.auto !== false ? hdFarbName(farbe.id) : '';
    const modell = carModellWert(car.modellId) ? carModellName(car.modellId) : '';
    if (lang === 'es') return (modell || 'coche') + (farbName ? ' ' + farbName : '');
    return (farbName ? farbName + ' ' : '') + (modell || (lang === 'de' ? 'Auto' : 'car'));
  }
  // Spoken car: "Mo Kamit, car number 7" (mid-sentence: followed by a comma), or "car number 7".
  // klein: the name does not start a clause ("penalty for car number 7").
  function hdSprechName(car, mitten, sprache, klein) {
    const spr = sprache || lang;
    const nr = hdNummer(car);
    const wort = spr === 'de' ? 'Auto Nummer ' : spr === 'es' ? 'coche número ' : 'car number ';
    if (!nr) return garageLabel(car);
    if (!car.alias) return (klein || spr === 'de' ? wort : wort.charAt(0).toUpperCase() + wort.slice(1)) + nr;
    return car.alias + ', ' + wort + nr + (mitten ? ',' : '');
  }
  function hdNummer(car) { return car && car.nummer ? car.nummer : (garage.indexOf(car) + 1 || ''); }

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
    if (hd.npcAnsage && !imVerbinden) hdSprechen(hdSatz('fahrer', { nr: hdNummer(car), name: car.alias, auto: hdAutoBeschreibung(car) }), 10);
    if (typeof renderGarage === 'function') renderGarage();
    if (typeof renderRaceGrid === 'function') renderRaceGrid();
  }

  // v2.1 "Announce all drivers": every car that connects is announced with driver, car and
  // colour. Hook, called at the end of garageGeraetAufnehmen() in 90-ghosts.js.
  function hdAutoVerbunden(car) {
    if (!hd.alleAnsagen || !car) return;
    hdSprechen(hdSatz('verbunden', { nr: hdNummer(car), name: car.alias || '', auto: hdAutoBeschreibung(car) }), 10);
  }

  // Give a car a fresh random name (the dice button in the garage).
  function hdNeuerName(car) {
    car.alias = hdZufallsName(hdBelegteNamen(car));
    carRemember(car);
    if (hd.npcAnsage && car.role === 'ghost') hdSprechen(hdSatz('fahrer', { nr: hdNummer(car), name: car.alias, auto: hdAutoBeschreibung(car) }), 10);
    renderGarage();
    if (typeof renderRaceGrid === 'function') renderRaceGrid();
  }

  // ---- 3. VOICE ---------------------------------------------------------------------------
  // Through the app's announcement queue (80a-ansagen.js), so it never talks over a lap time
  // or the race intro, and obeys the sound switch and the pause.
  function hdSatz(art, x) {
    if (lang === 'de') {
      if (art === 'fahrer') return 'Neu im Feld: ' + x.name + ', Auto Nummer ' + x.nr + ', im ' + x.auto + '.';
      if (art === 'verbunden') return 'Auto Nummer ' + x.nr + ' verbunden: ' + (x.name ? x.name + ', ' : '') + 'im ' + x.auto + '.';
      if (art === 'frage') return 'Safety Car? ' + x.name + (x.grund === 'off' ? ' ist neben der Strecke.' : ' steht.');
      return 'Safety Car! ' + x.name + (x.grund === 'off' ? ' ist von der Strecke abgekommen.' : ' steht auf der Strecke.');
    }
    if (lang === 'es') {
      if (art === 'fahrer') return 'Nuevo piloto: ' + x.name + ', coche número ' + x.nr + ', en el ' + x.auto + '.';
      if (art === 'verbunden') return 'Coche número ' + x.nr + ' conectado: ' + (x.name ? x.name + ', ' : '') + 'el ' + x.auto + '.';
      if (art === 'frage') return '¿Coche de seguridad? ' + x.name + (x.grund === 'off' ? ' está fuera de pista.' : ' está detenido.');
      return '¡Coche de seguridad! ' + x.name + (x.grund === 'off' ? ' se ha salido de la pista.' : ' está detenido en la pista.');
    }
    if (art === 'fahrer') return 'New driver: ' + x.name + ', car number ' + x.nr + ', driving the ' + x.auto + '.';
    if (art === 'verbunden') return 'Car number ' + x.nr + ' connected: ' + (x.name ? x.name + ', ' : '') + 'the ' + x.auto + '.';
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
  // v2.1 REQUESTED: a flat-illustration driver - helmet with the visor up, face and fringe in
  // the opening, race suit with shoulder panels and chest patches - "with random patterns and
  // colours based on the car brand and colour".
  //
  //   suit / helmet base   the car's colour (for the special colours "none" / "multi-coloured"
  //                        the brand's main colour)
  //   accents              the brand's palette (HD_MARKEN_FARBEN), e.g. Porsche red/black/white
  //   random per driver    helmet pattern (6), suit pattern (5), skin tone, hair, which accent
  //                        goes where - from a hash of name + style number, so a driver looks
  //                        the same everywhere and a tap on the avatar rolls a new look.
  const HD_MARKEN_FARBEN = {
    porsche911:  ['#d5001c', '#111111', '#ffffff', '#c9a227'],
    bmw:         ['#0066b1', '#81c4ff', '#e22718', '#16245c'],
    fordmustang: ['#1c3f94', '#ffffff', '#c8102e', '#111111'],
    ferrari:     ['#dc0000', '#ffeb00', '#111111', '#ffffff'],
    audi:        ['#bb0a30', '#c8ccd1', '#111111', '#ffffff'],
    mclaren:     ['#ff8000', '#47c7fc', '#1a1a1a', '#ffffff'],
    mercedes:    ['#00a19c', '#c8ccd1', '#111111', '#ffffff'],
    redbull:     ['#1e2a4a', '#db0a40', '#ffcc00', '#ffffff'],
    vwkaefer:    ['#001e50', '#00b0f0', '#ffffff', '#e8c72a'],
    '':          ['#ff8a00', '#111111', '#ffffff', '#00a3e0'],
  };
  const HD_HAUT = ['#f2c9a5', '#e7b48f', '#d09a6e', '#b07a50', '#8d5a3b', '#6b4329'];
  const HD_HAARE = ['#2b1d14', '#5a3a22', '#8a5a2b', '#c99a4a', '#e2c27a', '#1a1a1a', '#a33a22'];
  function hdHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hdInitialen(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  // Small deterministic random stream from one hash.
  function hdZufall(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
  function hdDunkler(hex, f) {
    const n = parseInt(String(hex).slice(1), 16); if (!(n >= 0)) return hex;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function hdHeller(hex, f) {
    const n = parseInt(String(hex).slice(1), 16); if (!(n >= 0)) return hex;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * f)));
    return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function hdHell(hex) {
    const n = parseInt(String(hex).slice(1), 16); if (!(n >= 0)) return 0.5;
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  let hdAvatarNr = 0;
  // ---- PHOTO PORTRAITS (v3.0) ---------------------------------------------------------------
  // BESTELLT: "Make it exactly like the reference photo" - sheets of 36 studio portraits (driver, helmet with the
  // visor down, arms crossed) that came with the requests ("I've added more reference photos for you to store").
  // They are cut out into img/fahrer/p00-p71.jpg (240 x 240, square from the top of each portrait, so the whole
  // helmet shows - "Make sure they show the full helmet") and chosen by the car colour: each portrait is labelled with its main colour and its accent colours
  // (by eye - the suit and helmet, not the backdrop). A car gets the portraits whose main colour is its own first,
  // then those that carry it as an accent; the driver's name picks one, a tap on the avatar steps to the next.
  const HD_FOTOS = [
    ['weiss', 'rot'], ['blau', 'gelb'], ['gruen', 'schwarz'], ['orange'], ['lila'], ['schwarz', 'gelb'],
    ['blau', 'gruen'], ['gelb', 'weiss'], ['rot', 'gelb'], ['orange', 'blau'], ['gruen', 'orange'], ['weiss', 'rot'],
    ['schwarz', 'blau'], ['gruen', 'lila'], ['weiss', 'rot', 'lila'], ['schwarz', 'orange'], ['gelb', 'blau'], ['schwarz', 'rot'],
    ['rot', 'gelb'], ['schwarz', 'orange'], ['blau', 'weiss'], ['gruen', 'weiss'], ['lila', 'gelb'], ['schwarz', 'weiss'],
    ['schwarz'], ['weiss', 'blau'], ['gruen', 'orange', 'blau'], ['rot', 'weiss'], ['weiss'], ['gruen', 'blau'],
    ['gelb', 'orange'], ['blau', 'weiss'], ['schwarz', 'lila', 'rot'], ['orange', 'schwarz'], ['lila', 'weiss'], ['gruen', 'schwarz'],
    // second sheet (p36-p71)
    ['lila', 'weiss'], ['schwarz', 'gelb'], ['blau', 'orange'], ['gruen'], ['weiss', 'rot'], ['rot', 'gelb'],
    ['orange', 'blau'], ['lila', 'weiss'], ['schwarz', 'lila', 'rot'], ['gruen', 'weiss', 'rot'], ['blau', 'orange'], ['blau', 'gelb'],
    ['gruen', 'gelb'], ['rot', 'weiss'], ['lila', 'weiss'], ['gruen', 'orange', 'blau'], ['schwarz', 'blau'], ['weiss', 'rot', 'lila'],
    ['schwarz'], ['lila', 'gruen'], ['weiss', 'orange', 'blau'], ['schwarz', 'orange'], ['blau', 'weiss'], ['weiss', 'orange'],
    ['rot', 'lila'], ['gruen', 'schwarz'], ['blau', 'weiss'], ['schwarz', 'gelb'], ['lila', 'schwarz', 'blau'], ['lila', 'orange'],
    ['gelb', 'schwarz'], ['gruen', 'orange'], ['weiss', 'blau'], ['rot', 'schwarz'], ['gelb', 'gruen'], ['lila', 'weiss'],
  ];
  // The car colour as one of the palette names (from the hex, so it also works for a colour we do not list).
  function hdFarbKlasse(hex) {
    const n = parseInt(String(hex || '').slice(1), 16);
    if (!(n >= 0)) return null;
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (l > 0.86 && d < 0.12) return 'weiss';
    if (l < 0.18) return 'schwarz';
    if (d < 0.08) return null;                       // grey: "none" / "multi-coloured" - any portrait
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return h < 15 || h >= 335 ? 'rot' : h < 42 ? 'orange' : h < 68 ? 'gelb' : h < 170 ? 'gruen' : h < 250 ? 'blau' : 'lila';
  }
  // The portraits a car colour may use, in order of preference, and where this driver starts in that list.
  function hdFotoPool(name, farbeHex, stil) {
    const k = hdFarbKlasse(farbeHex);
    const alle = HD_FOTOS.map((_, i) => i);
    const haupt = k ? alle.filter((i) => HD_FOTOS[i][0] === k) : alle;
    const neben = k ? alle.filter((i) => HD_FOTOS[i][0] !== k && HD_FOTOS[i].indexOf(k) > 0) : [];
    const pool = haupt.concat(neben);
    const start = pool.length ? (hdHash(String(name)) % Math.max(1, haupt.length) + (stil || 0)) % pool.length : 0;
    return { pool, start };
  }
  // The preferred portrait (no knowledge of the other cars) - and the first one from there that is still free.
  function hdFotoNr(name, farbeHex, stil, belegt) {
    const { pool, start } = hdFotoPool(name, farbeHex, stil);
    const frei = (i) => !belegt || !belegt.has(i);
    for (let j = 0; j < pool.length; j++) { const i = pool[(start + j) % pool.length]; if (frei(i)) return i; }
    // Every portrait of this colour is taken: any free one, starting from the driver's own spot in the full list.
    const s0 = hdHash(String(name)) % HD_FOTOS.length;
    for (let j = 0; j < HD_FOTOS.length; j++) { const i = (s0 + j) % HD_FOTOS.length; if (frei(i)) return i; }
    return pool.length ? pool[start] : s0;       // more cars than portraits: share is unavoidable
  }
  // v3.0 BESTELLT: "make sure that no two drivers use the same avatar". Each garage car is GIVEN a portrait once and
  // keeps it (remembered per car in hd.fotos, saved with the HybridDash settings): a new car takes its preferred
  // portrait, or the next free one of its colour, or any free one. A car keeps its portrait until its colour no
  // longer fits it or another car got it first (garage order); a tap moves only that car to the next free one.
  // So nobody's avatar changes because someone else's did.
  function hdFotoPasst(nr, hex) { const k = hdFarbKlasse(hex); return !k || HD_FOTOS[nr].indexOf(k) >= 0; }
  function hdFotoBelegung() {
    let autos = [];
    try { autos = garage.filter((c) => c && c.device); } catch (e) { return new Map(); }
    hd.fotos = hd.fotos || {};
    const belegt = new Set(), map = new Map();
    let neu = false;
    autos.forEach((c) => {
      const id = String(c.device.id), hex = carColor(c).hex;
      let nr = hd.fotos[id];
      if (!(Number.isInteger(nr) && nr >= 0 && nr < HD_FOTOS.length && !belegt.has(nr) && hdFotoPasst(nr, hex))) {
        nr = hdFotoNr(c.alias || c.tag || garageLabel(c), hex, 0, belegt);
        hd.fotos[id] = nr; neu = true;
      }
      belegt.add(nr); map.set(id, nr);
    });
    if (neu) { try { hdSpeichern(); } catch (e) { /* start-up */ } }
    return map;
  }
  // Tap: the next portrait of this car's colour that no other car has (then any free one).
  function hdFotoWeiter(car) {
    const id = String(car.device.id), hex = carColor(car).hex;
    const belegung = hdFotoBelegung();
    const andere = new Set([...belegung].filter(([cid]) => cid !== id).map(([, nr]) => nr));
    const { pool } = hdFotoPool(car.alias || car.tag || garageLabel(car), hex, 0);
    const jetzt = belegung.get(id);
    const reihe = pool.length ? pool : HD_FOTOS.map((_, i) => i);
    const ab = Math.max(0, reihe.indexOf(jetzt));
    for (let j = 1; j <= reihe.length; j++) { const nr = reihe[(ab + j) % reihe.length]; if (!andere.has(nr) && nr !== jetzt) { hd.fotos[id] = nr; return nr; } }
    for (let j = 1; j <= HD_FOTOS.length; j++) { const nr = ((jetzt || 0) + j) % HD_FOTOS.length; if (!andere.has(nr)) { hd.fotos[id] = nr; return nr; } }
    return jetzt;
  }
  // The avatar of a garage car - unique across the garage.
  function hdAvatarFuerAuto(car, px) {
    const name = car.alias || car.tag || garageLabel(car);
    const nr = hdFotoBelegung().get(String(car.device && car.device.id));
    return hdAvatarSvg(name, carColor(car).hex, hdAvatarStil(car), px, carModellWert(car.modellId), nr);
  }
  function hdAvatarSvg(name, farbeHex, stil, px, marke, festNr) {
    const nr = Number.isInteger(festNr) ? festNr : hdFotoNr(name, farbeHex, stil);
    const id = 'hdfo' + (++hdAvatarNr);
    const datei = 'img/fahrer/p' + String(nr).padStart(2, '0') + '.jpg';
    return `<svg class="hd-avatar hd-avatar-foto" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true" data-foto="${nr}">`
      + `<defs><clipPath id="${id}"><rect x="0.5" y="0.5" width="99" height="99" rx="14"/></clipPath></defs>`
      + `<rect x="0.5" y="0.5" width="99" height="99" rx="14" fill="${farbeHex || '#15171c'}"/>`
      // (attribute name built in two parts: the build's link check reads every literal href=" as a fixed file)
      + '<image ' + 'href' + '="' + datei + `" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
      + `</svg>`;
  }

  // The drawn studio portrait (v3.0 before the photos) - no longer used for the avatars; kept as a fallback.
  // name, car colour (hex), style number, size in px, brand id (car.modellId)
  // v3.0 BESTELLT: "Make the avatars even more realistic ... use the smokey gradient background too that would
  // complement the colour of their cars" (reference: studio portraits of drivers, visor down, arms crossed).
  // Driver chest-up, arms crossed in black gloves, full-face helmet with the tinted visor DOWN, HANS device on the
  // shoulders, race suit with folds, stitching, shoulder piping and patches, a key light from the top left and a
  // rim light in the car colour; behind: a dark studio gradient tinted by the car colour, drifting smoke
  // (feTurbulence, a different seed per driver) and a faint light streak. Deterministic per driver and brand.
  function hdAvatarGezeichnet(name, farbeHex, stil, px, marke) {
    const r = hdZufall(hdHash(String(name) + '#' + (stil || 0) + '#' + (marke || '')));
    const pick = (a) => a[Math.floor(r() * a.length) % a.length];
    const pal = HD_MARKEN_FARBEN[marke] || HD_MARKEN_FARBEN[''];
    const basis = farbeHex && !/^#(7a7a7a|b0b0b0)$/i.test(farbeHex) ? farbeHex : pal[0];
    const akz = pal.filter((c) => c.toLowerCase() !== basis.toLowerCase());
    const a1 = akz[Math.floor(r() * akz.length)];
    const a2 = akz.filter((c) => c !== a1)[Math.floor(r() * (akz.length - 1))] || '#ffffff';
    // Suit: the car colour most of the time, sometimes white or black with the car colour as the accent.
    const anzugWahl = r();
    const anzug = anzugWahl < 0.6 ? basis : anzugWahl < 0.8 ? '#e9ebee' : '#1d2026';
    const akzent = anzug === basis ? a1 : basis;
    const helm = r() < 0.55 ? basis : pick([pal[0], '#f2f3f5', '#1c1f24', a1].filter((c) => c.toLowerCase() !== akzent.toLowerCase()));
    const helmMuster = Math.floor(r() * 5), anzugMuster = Math.floor(r() * 4), visierTon = pick(['#0b0d11', '#120d08', '#0a0f14', '#140a0c']);
    const seed = 1 + (hdHash(String(name) + (stil || 0)) % 97);
    const id = 'hdav' + (++hdAvatarNr) + '-' + (hdHash(String(name)) % 9973);
    const nummer = 1 + (hdHash(String(name)) % 99);
    const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16) || 0; return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const rauch = rgb(hdHeller(basis, 0.35));
    const anzugH = hdHeller(anzug, 0.28), anzugD = hdDunkler(anzug, 0.55), anzugDD = hdDunkler(anzug, 0.38);
    const helmH = hdHeller(helm, 0.45), helmD = hdDunkler(helm, 0.5);
    const hintergrund = hdDunkler(basis, 0.32), hintergrundD = hdDunkler(basis, 0.1);
    const patch = hdHell(anzug) > 0.7 ? '#23262d' : '#eef0f2', patchTinte = hdHell(patch) > 0.6 ? '#14161c' : '#ffffff';
    // ---- shapes (viewBox 100 x 100) ----
    const torso = 'M-3 101 L-1 82 C2 70 13 63 29 60.4 L39 57.4 L61 57.4 L71 60.4 C87 63 98 70 101 82 L103 101 Z';
    const schale = 'M29.4 30.6 C29.4 15 38.8 6.2 50 6.2 C61.2 6.2 70.6 15 70.6 30.6 C70.6 41.6 68.6 48 64.2 52.2 C60.2 55.2 55.4 56.2 50 56.2 C44.6 56.2 39.8 55.2 35.8 52.2 C31.4 48 29.4 41.6 29.4 30.6 Z';
    const visier = 'M30.8 25.4 C33.8 20.8 41.8 18.8 50 18.8 C58.2 18.8 66.2 20.8 69.2 25.4 C70.2 30.4 69.6 35.6 67.8 39 C61.8 41.4 56 42.2 50 42.2 C44 42.2 38.2 41.4 32.2 39 C30.4 35.6 29.8 30.4 30.8 25.4 Z';
    const helmDeko = [
      `<path d="M46.4 0 H53.6 V22 H46.4 Z" fill="${akzent}"/><path d="M44.6 0 H45.6 V22 H44.6 Z M54.4 0 H55.4 V22 H54.4 Z" fill="${a2}"/>`,
      `<path d="M50 9 L70 19 L70 25 L50 15 L30 25 L30 19 Z" fill="${akzent}"/><path d="M50 16.6 L70 26.6 V29 L50 19 L30 29 V26.6 Z" fill="${a2}"/>`,
      `<path d="M28 44 C36 41 42 44 46 56 L38 56 C36 49 33 47 28 48 Z M72 44 C64 41 58 44 54 56 L62 56 C64 49 67 47 72 48 Z" fill="${akzent}"/>`,
      `<path d="M28 13 C40 18 60 18 72 13 V19 C60 23.6 40 23.6 28 19 Z" fill="${akzent}"/><path d="M28 41 H72 V44 H28 Z" fill="${a2}"/>`,
      `<path d="M30 30 C38 26 44 14 50 8 C56 14 62 26 70 30 L70 34 C62 30 56 20 50 14 C44 20 38 30 30 34 Z" fill="${akzent}"/>`,
    ][helmMuster];
    const anzugDeko = [
      // shoulder piping and side stripes
      `<path d="M8 72 C16 64 26 61 38 59.6 L38.8 61.6 C27 63 17.6 66 10 73.6 Z M92 72 C84 64 74 61 62 59.6 L61.2 61.6 C73 63 82.4 66 90 73.6 Z" fill="${akzent}"/><path d="M2 101 L6 78 L9 77 L6 101 Z M98 101 L94 78 L91 77 L94 101 Z" fill="${akzent}"/>`,
      // contrasting yoke
      `<path d="M-2 80 C2 69 14 62.6 30 60.2 L39 57.6 L61 57.6 L70 60.2 C86 62.6 98 69 102 80 L102 74 C96 66 84 61 70 58.6 L60 56.6 L40 56.6 L30 58.6 C16 61 4 66 -2 74 Z" fill="${akzent}"/>`,
      // diagonal sash
      `<path d="M14 66 L24 61.6 L78 101 L62 101 Z" fill="${akzent}" opacity=".9"/>`,
      // centre band
      `<path d="M44.4 58 H55.6 L55 101 H45 Z" fill="${akzent}"/><path d="M43 58 H44.2 L43.8 101 H42.4 Z M55.8 58 H57 L57.6 101 H56.2 Z" fill="${a2}"/>`,
    ][anzugMuster];
    const armHinten = 'M101 89 C88 87.4 54 84 32 81.4 C25.6 80.8 24.4 90.4 30.6 91.8 C52 95.6 86 99.8 101 101.4 Z';
    const armVorn = 'M-1 95.6 C3 90 10 88.8 19 88.2 C37 86.6 59 83 71.6 81.2 C78.6 80.2 80.4 89.4 74.4 91 C58 95 34 99.8 14 101.8 L-1 101.8 Z';
    const handR = 'M70.6 80.2 C74.4 77 81.4 77.2 83.4 81.4 C85.4 85.8 82.8 90.8 78 91.6 C74.6 92.2 72.4 90.4 72.8 88 Z';
    const handL = 'M33.6 80.8 C29.2 78.8 23.6 80.6 23.2 85.2 C22.8 89.4 26.2 92.6 30.6 92 C33.4 91.6 34.8 89.4 33.8 87 Z';
    const g = (x) => `url(#${id}-${x})`;
    return `<svg class="hd-avatar" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true">`
      + `<defs>`
      + `<clipPath id="${id}-k"><rect x="0.5" y="0.5" width="99" height="99" rx="14"/></clipPath>`
      + `<clipPath id="${id}-t"><path d="${torso}"/></clipPath>`
      + `<clipPath id="${id}-s"><path d="${schale}"/></clipPath>`
      + `<radialGradient id="${id}-bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${hintergrund}"/><stop offset=".6" stop-color="${hintergrundD}"/><stop offset="1" stop-color="#030304"/></radialGradient>`
      + `<filter id="${id}-rauch" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".022 .045" numOctaves="4" seed="${seed}"/>`
      + `<feColorMatrix type="matrix" values="0 0 0 0 ${rauch[0].toFixed(3)} 0 0 0 0 ${rauch[1].toFixed(3)} 0 0 0 0 ${rauch[2].toFixed(3)} 0 0 0 1.6 -0.62"/></filter>`
      + `<radialGradient id="${id}-vig" cx=".5" cy=".45" r=".72"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></radialGradient>`
      + `<linearGradient id="${id}-anzug" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="${anzugH}"/><stop offset=".42" stop-color="${anzug}"/><stop offset="1" stop-color="${anzugDD}"/></linearGradient>`
      + `<linearGradient id="${id}-arm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${anzugH}"/><stop offset=".45" stop-color="${anzug}"/><stop offset="1" stop-color="${anzugDD}"/></linearGradient>`
      + `<linearGradient id="${id}-armH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${anzug}"/><stop offset="1" stop-color="${anzugDD}"/></linearGradient>`
      + `<radialGradient id="${id}-helm" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="${helmH}"/><stop offset=".45" stop-color="${helm}"/><stop offset="1" stop-color="${helmD}"/></radialGradient>`
      + `<linearGradient id="${id}-visier" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#3b424f"/><stop offset=".35" stop-color="${visierTon}"/><stop offset=".75" stop-color="#05060a"/><stop offset="1" stop-color="${hdDunkler(basis, 0.45)}"/></linearGradient>`
      + `<linearGradient id="${id}-hand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3e46"/><stop offset=".5" stop-color="#16181d"/><stop offset="1" stop-color="#08090b"/></linearGradient>`
      + `<linearGradient id="${id}-hans" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f48"/><stop offset="1" stop-color="#0d0f13"/></linearGradient>`
      + `<linearGradient id="${id}-abfall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>`
      + `<linearGradient id="${id}-glanz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `</defs>`
      + `<g clip-path="url(#${id}-k)">`
      // studio: car-colour gradient, smoke, a light streak, vignette
      + `<rect width="100" height="100" fill="${g('bg')}"/>`
      + `<path d="M0 74 H100 V75.2 H0 Z M0 79 H100 V79.6 H0 Z" fill="${basis}" opacity=".45"/>`
      + `<rect width="100" height="100" fill="${g('vig')}"/>`
      // suit: body, panels, folds, stitching, patches, number
      + `<path d="${torso}" fill="${g('anzug')}"/>`
      + `<g clip-path="url(#${id}-t)">${anzugDeko}`
      + `<path d="M24 64 C28 70 30 74 30 80 M76 64 C72 70 70 74 70 80 M40 60 C42 66 42 72 41 78 M60 60 C58 66 58 72 59 78" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.1"/>`
      + `<path d="M12 70 C20 64.6 30 62 39 60.6 M88 70 C80 64.6 70 62 61 60.6" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".5" stroke-dasharray="1.2 1"/>`
      + `<path d="M50 57.6 V80" stroke="#000" stroke-opacity=".35" stroke-width=".9"/>`
      + `<rect x="21.6" y="66" width="11" height="4" rx=".6" fill="${patch}"/><path d="M23 68 H31" stroke="${patchTinte}" stroke-width=".9" stroke-dasharray="1.6 .7"/>`
      + `<rect x="23.4" y="71.4" width="7.4" height="2.4" rx=".5" fill="${a2}"/>`
      + `<rect x="66" y="65.4" width="12.6" height="6" rx=".8" fill="${patch}"/>`
      + `<text x="72.3" y="70" font-family="Inter,system-ui,sans-serif" font-size="5" font-weight="900" font-style="italic" text-anchor="middle" fill="${patchTinte}">${nummer}</text>`
      + `<path d="M101 64 C96 70 92 78 90 90" fill="none" stroke="${hdHeller(basis, 0.3)}" stroke-width="2.4" opacity=".55"/>`
      + `</g>`
      // arms crossed, black gloves
      + `<g transform="translate(0 -7) translate(0 90) scale(1 1.22) translate(0 -90)">`
      + `<ellipse cx="2" cy="94" rx="9" ry="9" fill="${anzugD}"/><ellipse cx="98" cy="91" rx="9" ry="9" fill="${anzugDD}"/>`
      + `<path d="${armHinten}" fill="${g('armH')}"/>`
      + `<path d="M34 83.6 C52 86 80 89.4 101 91.4" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".9"/>`
      + `<path d="${handL}" fill="${g('hand')}"/><path d="M25 84 C27 83.2 29.6 83.4 31.4 84.6 M24.6 87 C26.6 86.4 29 86.6 31 87.6" stroke="#fff" stroke-opacity=".22" stroke-width=".6" fill="none"/>`
      + `<path d="M8 99 C30 96.6 56 92.4 76 88.6 L76 92.6 C58 96.6 34 101 12 102.4 Z" fill="#000" opacity=".4"/>`
      + `<path d="${armVorn}" fill="${g('arm')}"/>`
      + `<path d="M62.4 82.6 C65.4 82.1 68.2 81.6 71 81.2 L72.6 90.6 C69.6 91.4 66.8 92.2 63.8 93 Z" fill="${akzent}"/>`
      + `<path d="M4 92.4 C12 89.6 34 88 52 85.4" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>`
      + `<path d="M20 92 C24 94 28 94.6 32 94 M40 90 C43 92 47 92.4 50 91.6" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".9"/>`
      + `<path d="M10 99.4 C30 97.4 54 93.6 70 90.4" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1"/>`
      + `<path d="${handR}" fill="${g('hand')}"/><path d="M74.6 81.6 C77 80.6 80.4 80.8 82.2 82.6 M75 85 C77.4 84.2 80.4 84.4 82.4 85.8" stroke="#fff" stroke-opacity=".25" stroke-width=".6" fill="none"/>`
      + `</g>`
      // light falls off towards the bottom (key light from above)
      + `<rect x="0" y="56" width="100" height="44" fill="${g('abfall')}"/>`
      // helmet: shell, pattern, visor down with reflections, chin vents, gloss, rim light
      + `<path d="${schale}" fill="${g('helm')}"/>`
      + `<g clip-path="url(#${id}-s)">${helmDeko}<path d="M30 46 C38 55 62 55 70 46 V58 H30 Z" fill="#000" opacity=".28"/></g>`
      + `<path d="${visier}" fill="${g('visier')}" stroke="${hdDunkler(helm, 0.35)}" stroke-width="1.2"/>`
      + `<path d="M33.4 24.6 C38.6 21.6 44.4 20.8 50 20.8 C55.6 20.8 61.4 21.6 66.6 24.6 L65.8 26.6 C61 24.2 55.6 23.4 50 23.4 C44.4 23.4 39 24.2 34.2 26.6 Z" fill="${g('glanz')}"/>`
      + `<path d="M35.4 37.6 C41.4 39.6 46 40.2 50 40.2 C54 40.2 58.6 39.6 64.6 37.6" fill="none" stroke="${hdHeller(basis, 0.2)}" stroke-width="1.1" opacity=".55"/>`
      + `<path d="M57 22.2 C61.6 28.4 62.6 33.6 61.8 39.6" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2.6"/>`
      + `<path d="M40 22.4 C38.4 27 38.4 32 39.6 38" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.6"/>`
      + `<circle cx="30.8" cy="30.4" r="1.9" fill="${helmD}"/><circle cx="69.2" cy="30.4" r="1.9" fill="${helmD}"/>`
      + `<path d="M45 47.6 H55 M46.2 50.2 H53.8" stroke="#000" stroke-opacity=".35" stroke-width="1" stroke-linecap="round"/>`
      + `<path d="M33.4 18.4 C36.4 11.8 42.4 8.6 48.8 8.2" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M69.8 22 C71.6 30 71.4 41 67.8 48.6 C66 52 63.4 54.4 60.6 55.6" fill="none" stroke="${hdHeller(basis, 0.35)}" stroke-width="1.7" opacity=".75" stroke-linecap="round"/>`
      + `</g></svg>`;
  }
  function hdAvatarStil(car) { return (hd.avatare && hd.avatare[String(car.device.id)]) || 0; }
  // Hook used by the garage card (90-ghosts.js).
  function hdAvatarHtml(car, px) {
    if (!car || !car.device) return '';
    const name = car.alias || car.tag || garageLabel(car);
    return `<button type="button" class="hd-avatar-knopf" data-hd-avatar="${String(car.device.id).replace(/"/g, '')}" `
      + `title="${t('Avatar ändern')}">${hdAvatarFuerAuto(car, px || 34)}</button>`;
  }
  // v3.0: the garage's "Driver and Car Settings" header as a race-weekend grid card - large portrait, the name
  // (the given h3, kept for everything that reads it), the car number on a plate in the car colour, make / model.
  function hdGridKarte(car, kopf) {
    if (!car || !car.device) return null;
    const box = document.createElement('div');
    box.className = 'hd-gridkarte';
    const f = carColor(car);
    box.style.setProperty('--hd-gk-farbe', f.hex);
    const modell = typeof carModellName === 'function' ? carModellName(car.modellId) : '';
    // A picture, not a button: the controller's menu navigation walks the buttons of this column, and the
    // small avatar in the car list already rolls a new look.
    const name = car.alias || car.tag || garageLabel(car);
    box.innerHTML = `<span class="hd-gk-bild">${hdAvatarFuerAuto(car, 112)}</span>`
      + '<div class="hd-gk-text"></div>';
    const text = box.querySelector('.hd-gk-text');
    text.appendChild(kopf);
    const zeile = document.createElement('div');
    zeile.className = 'hd-gk-zeile';
    zeile.setAttribute('data-i18n-skip', '');
    zeile.innerHTML = `<span class="hd-gk-nr" style="background:${f.hex};color:${f.ink || '#fff'}">${hdNummer(car)}</span>`
      + (modell && !/^(–|-|Nicht zugeordnet|Not assigned)$/i.test(modell) ? `<span class="hd-gk-modell">${String(modell).replace(/[&<>]/g, '')}</span>` : '');
    text.appendChild(zeile);
    return box;
  }
  // One delegated listener: garage cards are re-rendered often.
  document.addEventListener('click', (e) => {
    const k = e.target && e.target.closest && e.target.closest('[data-hd-avatar]');
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const id = k.getAttribute('data-hd-avatar');
    hd.avatare = hd.avatare || {};
    // Photos: the next free portrait for this car only (hdFotoWeiter). The style number still counts on for the
    // drawn fallback.
    const car = garage.find((c) => c.device && String(c.device.id) === id);
    if (car) hdFotoWeiter(car);
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
      Object.assign(hd, JSON.parse(merk.hd)); Object.assign(hdSc, merk.sc); hdSc.offSeit = new Map(); hdSc.zaehler = new Map(); hdSc.ignoriert = new Map(); hdSc.box = new Map(); hdScFrageZu();
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

      // J2: stop over, the car still stands in the box -> nothing; once it has driven off
      // and then stops on track -> asked again.
      gruen(); fahren(a, 3); a.tileAt = now - 5000;
      pitState = 'servicing'; hdAutoScTick(); pitState = 'off'; hdAutoScTick();
      const stehtInBox = !hdScFrageOffen();
      fahren(a, 1); a.tileAt = now - 5000; hdAutoScTick();
      const danachGefragt = hdScFrageOffen();
      prüfen('standing in the box after the stop: no prompt until it drives off', stehtInBox && danachGefragt,
             'quiet in box ' + stehtInBox + ', asked after driving off ' + danachGefragt);
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
      const satz = lang === 'en' ? hdSatz('fahrer', { nr: 2, name: b.alias, auto: hdAutoBeschreibung(b) }) : '';
      prüfen('announcement names number, driver and car', !satz || satz === 'New driver: ' + b.alias + ', car number 2, driving the red car.', satz);

      // G3: "Announce all drivers": a connecting car is announced with driver, car and colour.
      hd.alleAnsagen = true; soundEnabled = true;
      const vorAlle = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length;
      const d = fake('hd-d', 'player', { alias: 'Mara Kovac', colorId: 'blau', tag: 'Gamma', modellId: 'porsche911' });
      hdAutoVerbunden(d);
      const alle = rennAnsagen.jobs.filter(j => j.art === 'hybriddash').length - vorAlle;
      rennAnsagen.jobs = rennAnsagen.jobs.filter(j => j.art !== 'hybriddash');
      const satzAlle = hdSatz('verbunden', { nr: 3, name: 'Mara Kovac', auto: 'blue Porsche 911' });
      const satzTag = hdSatz('verbunden', { nr: 3, name: '', auto: 'blue car' });
      soundEnabled = merkSound; hd.alleAnsagen = false;
      prüfen('announce all drivers: connecting car is announced', alle === 1 && (lang !== 'en' ||
             (satzAlle === 'Car number 3 connected: Mara Kovac, the blue Porsche 911.' && satzTag === 'Car number 3 connected: the blue car.')),
             satzAlle + ' | ' + satzTag);

      // G4: car numbers in the other announcements (safety car, standings).
      if (lang === 'en') {
        const e = fake('hd-e', 'ghost', { alias: 'Mo Kamit', nummer: 7, colorId: 'gelb', modellId: 'bmw' });
        const ohneName = fake('hd-f', 'ghost', { alias: '', nummer: 9, colorId: 'rot' });
        const frage = hdSatz('frage', { name: hdSprechName(e, true), grund: 'stand' });
        const frage2 = hdSatz('frage', { name: hdSprechName(ohneName, true), grund: 'off' });
        const stand = typeof rennstandText === 'function'
          ? rennstandText([{ platz: 1, alias: 'Mo Kamit', nummer: 7, farbeId: 'gelb', modellId: 'bmw', rundenZurueck: 0, msZurueck: 0 },
                           { platz: 2, alias: '', nummer: 9, farbeId: 'rot', modellId: '', rundenZurueck: 0, msZurueck: 1500 }], 3, false, 'en') : '';
        prüfen('car number in safety-car and standings announcements',
               frage === 'Safety car? Mo Kamit, car number 7, has stopped.' && frage2 === 'Safety car? Car number 9 is off track.'
               && /car number 7\./.test(stand) && /car number 9\./.test(stand),
               frage + ' | ' + frage2 + ' | ' + stand);
      }

      // H: avatar - a photo portrait matching the car colour, the same every time, another one on tap.
      const fo = (n, hex, st) => Number((hdAvatarSvg(n, hex, st, 30, '').match(/data-foto="(\d+)"/) || [])[1]);
      const rotNr = fo('Mara Kovac', '#e23b3b', 0), rot2 = fo('Mara Kovac', '#e23b3b', 0), rot3 = fo('Mara Kovac', '#e23b3b', 1);
      const blauNr = fo('Noor Rahimi', '#3b7fe2', 0), weissNr = fo('Emil Strand', '#f2f4f8', 0);
      const svg = hdAvatarSvg('Mara Kovac', '#e23b3b', 0, 30, 'porsche911');
      prüfen('avatar: photo portrait in the car colour (red car -> red, blue -> blue, white -> white), same every time, another on tap',
             HD_FOTOS[rotNr].indexOf('rot') >= 0 && HD_FOTOS[blauNr].indexOf('blau') >= 0 && HD_FOTOS[weissNr].indexOf('weiss') >= 0
             && rotNr === rot2 && rotNr !== rot3 && /img\/fahrer\/p\d\d\.jpg/.test(svg) && HD_FOTOS.length === 72,
             'red ' + rotNr + ', blue ' + blauNr + ', white ' + weissNr + ', red tap ' + rot3);
      // H2: no two drivers share an avatar (garage-wide), also when one colour has fewer portraits than cars.
      {
        const merkG = garage.slice();
        try {
          garage.length = 0; hd.fotos = {};
          for (let i = 0; i < 12; i++) garage.push(fake('hd-av-' + i, 'ghost', { alias: 'Fahrer ' + (i % 3), colorId: 'rot' }));
          const nrs = garage.map((c) => hdFotoBelegung().get(String(c.device.id)));
          // a tap on the first car moves only that car; nobody else's portrait changes
          hdFotoWeiter(garage[0]);
          const nach = garage.map((c) => hdFotoBelegung().get(String(c.device.id)));
          const stabil = nach[0] !== nrs[0] && nach.slice(1).every((n, i) => n === nrs[i + 1]) && new Set(nach).size === 12;
          const rote = nrs.filter((n) => HD_FOTOS[n].indexOf('rot') >= 0).length;
          garage.length = 0; hd.fotos = {};
          for (let i = 0; i < 80; i++) garage.push(fake('hd-av-x' + i, 'ghost', { alias: 'X', colorId: ['rot', 'blau', 'gelb', 'weiss'][i % 4] }));
          const viele = garage.map((c) => hdFotoBelegung().get(String(c.device.id)));
          prüfen('avatars: no two drivers share one, a tap changes only that driver - 12 red cars with repeated names get 12 different portraits (red ones first); with 80 cars all 72 are used before any repeats',
                 new Set(nrs).size === 12 && rote >= 6 && new Set(viele).size === HD_FOTOS.length && stabil,
                 new Set(nrs).size + ' different of 12 (' + rote + ' red); tap moves only that car: ' + stabil + '; 80 cars -> ' + new Set(viele).size + ' different');
        } finally { garage.length = 0; merkG.forEach((c) => garage.push(c)); }
      }
      // I: garage label - which laptop a car is connected to (two-laptop mode only).
      const rolleMerk = hdRelay.rolle;
      try {
        const eigen = fake('hd-l-eigen', 'ghost'), fremd = fake('relay-hd-l', 'ghost');
        hdRelay.rolle = null;
        const allein = hdLaptopVon(eigen) === null && hdLaptopEtikett(eigen) === '';
        hdRelay.rolle = 'host';
        const host = hdLaptopVon(eigen) === 'host' && hdLaptopVon(fremd) === 'helper' && /HELPER/.test(hdLaptopEtikett(fremd));
        hdRelay.rolle = 'helper';
        const helper = hdLaptopVon(eigen) === 'helper';
        prüfen('garage label: nothing on one laptop; on the host its own cars HOST, relayed cars HELPER; on the helper HELPER',
               allein && host && helper, [allein, host, helper].join(','));
        eigen.device.gatt = { connected: true }; fremd.device.gatt = { connected: false };
        hdRelay.rolle = 'host';
        prüfen('garage label: link icon - connected (green) or not connected (broken, grey)',
               /hd-link-an/.test(hdLaptopEtikett(eigen)) && /hd-link-aus/.test(hdLaptopEtikett(fremd)) && /Not connected/.test(hdLaptopEtikett(fremd)),
               hdLaptopEtikett(fremd).replace(/<svg[\s\S]*?<\/svg>/, '[svg]'));
      } finally { hdRelay.rolle = rolleMerk; }
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
    // Tests only: open the safety-car prompt for a stand-in car, read its state.
    _frage: { auf: () => hdScFrageAuf({ role: 'player', alias: 'Test', device: { id: 'hd-q' } }, 'stand'), offen: hdScFrageOffen, b: hdScTasteB,
              gesperrt: hdScTasteGesperrt, vsc: hdScVsc },
    // Race simulation hooks for the yellow-flag measurement (tests only).
    sim: { start: () => simStart(), stop: () => simStop('test'), gelb: () => setFlag('yellow'), gruen: () => gelbBeenden(),
           folge: (an) => { hd.gelbFolge = !!an; }, kacheln: () => (currentTrackTiles || []).length, param: (o) => Object.assign(hdFolge, o || {}),
           // Make simulated car i the safety car (role), or take the role back (i < 0).
           sc: (i) => { const autos = garage.filter((c) => c.sim); autos.forEach((c) => { if (c.role === 'safetycar') c.role = 'ghost'; });
                        if (i >= 0 && autos[i]) autos[i].role = 'safetycar'; return autos.map((c) => c.alias + ':' + c.role); } },
  });
