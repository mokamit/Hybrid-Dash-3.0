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
  // name, car colour (hex), style number, size in px, brand id (car.modellId)
  function hdAvatarSvg(name, farbeHex, stil, px, marke) {
    const r = hdZufall(hdHash(String(name) + '#' + (stil || 0) + '#' + (marke || '')));
    const pick = (a) => a[Math.floor(r() * a.length) % a.length];
    const pal = HD_MARKEN_FARBEN[marke] || HD_MARKEN_FARBEN[''];
    const basis = farbeHex && !/^#(7a7a7a|b0b0b0)$/i.test(farbeHex) ? farbeHex : pal[0];
    const akz = pal.filter((c) => c.toLowerCase() !== basis.toLowerCase());
    const a1 = akz[Math.floor(r() * akz.length)];
    const a2 = akz.filter((c) => c !== a1)[Math.floor(r() * (akz.length - 1))] || '#ffffff';
    const haut = pick(HD_HAUT), haar = pick(HD_HAARE);
    const frisur = Math.floor(r() * 6), anzugMuster = Math.floor(r() * 5), bart = r() < 0.3, augen = pick(['#3b2a1e', '#2a1d14', '#4a6a82', '#3f5a3a', '#5b3b24']);
    const id = 'hdav' + (++hdAvatarNr) + '-' + (hdHash(String(name)) % 9973);
    const nummer = 1 + (hdHash(String(name)) % 99);
    const hautD = hdDunkler(haut, 0.78), hautDD = hdDunkler(haut, 0.62), hautH = hdHeller(haut, 0.12);
    const haarD = hdDunkler(haar, 0.7), haarH = hdHeller(haar, 0.18);
    const anzugH = hdHeller(basis, 0.22), anzugD = hdDunkler(basis, 0.58), anzugDD = hdDunkler(basis, 0.42);
    const patch = hdHell(basis) > 0.7 ? '#2a2e35' : '#f1f2f4';
    // ---- shapes (viewBox 100 x 100) ----
    const torso = 'M-3 101 L-1 84 C2 72 13 66 28 63 L40 60.6 L60 60.6 L72 63 C87 66 98 72 101 84 L103 101 Z';
    const gesicht = 'M33.5 33 C33.5 20.5 41 14 50 14 C59 14 66.5 20.5 66.5 33 C66.5 43.5 63.5 51.5 58 55.5 C55.5 57.4 52.8 58.4 50 58.4 C47.2 58.4 44.5 57.4 42 55.5 C36.5 51.5 33.5 43.5 33.5 33 Z';
    const haare = [
      // short crop with a little texture
      'M32.6 34 C31.6 19 39.5 11 50 11 C60.5 11 68.4 19 67.4 34 C66.5 28 64 24.5 59.5 23 C55 25.6 45.5 26.2 40.6 23.2 C36.6 25 34 28.6 32.6 34 Z',
      // side part, swept
      'M32.2 36 C29.6 18.5 40.5 9.4 52 10.2 C62.6 10.8 69.6 18.5 68.2 33 C64.5 23.5 57.5 19.8 48 21.2 C42.5 22.2 37.5 25.6 34.8 31 Z',
      // buzz cut
      'M33.4 31.5 C33.4 20.2 41 13.4 50 13.4 C59 13.4 66.6 20.2 66.6 31.5 C62.8 25.4 56.8 22.6 50 22.6 C43.2 22.6 37.2 25.4 33.4 31.5 Z',
      // curly top
      'M32.4 34 C31 22 37 12.5 44 11.8 C46 9 51 8.6 53.4 10.6 C57 9 62.5 11.4 64 15 C68 17.5 69 25 67.6 34 C66 28 63 24.6 59 23.6 C54 26.2 45.4 26.4 41 23.6 C36.8 25.4 34 28.8 32.4 34 Z',
      // longer quiff
      'M31.4 38 C29.2 20 38.6 8.4 51 8.4 C63.4 8.4 71.2 19 68.8 38 L67 31 C65.6 24.6 61 20.8 54 21.6 C46 19.6 38.8 23.4 34.8 30.4 Z',
      // fade with a parting line
      'M33 33 C32.4 19.6 40.4 11.6 50.4 11.8 C60.4 12 67.6 19.6 67 33 C65.8 27 62.4 23.4 57.6 22.2 L44 22.4 C39 23.6 35 27.4 33 33 Z',
    ];
    // suit panels (clipped to the torso): shoulder yoke, side panels, chest band, diagonal sash, centre stripe
    const am = [
      `<path d="M1 84 C8 74 20 69.5 34 67 L36 73 C22 75 12 79 4 90 Z M99 84 C92 74 80 69.5 66 67 L64 73 C78 75 88 79 96 90 Z" fill="${a1}"/>`,
      `<path d="M2 101 L7 80 L13 77 L10 101 Z M98 101 L93 80 L87 77 L90 101 Z" fill="${a1}"/><path d="M13 101 L15 79 L17 78 L16 101 Z M87 101 L85 79 L83 78 L84 101 Z" fill="${a2}"/>`,
      `<path d="M0 78 H100 V83 H0 Z" fill="${a1}"/><path d="M0 84.5 H100 V86.5 H0 Z" fill="${a2}"/>`,
      `<path d="M18 70 L27 67.5 L70 101 L56 101 Z" fill="${a1}"/><path d="M27 67.5 L30.5 66.8 L74 101 L70 101 Z" fill="${a2}"/>`,
      `<path d="M44 66 H56 L55 101 H45 Z" fill="${a1}"/><path d="M42.5 66 H44 L43.6 101 H42 Z M56 66 H57.5 L58 101 H56.4 Z" fill="${a2}"/>`,
    ][anzugMuster];
    // arms crossed: the far forearm (right arm) under, the near one (left arm) over it, a hand on each bicep
    const armHinten = 'M101 89 C88 87.4 54 84 32 81.4 C25.6 80.8 24.4 90.4 30.6 91.8 C52 95.6 86 99.8 101 101.4 Z';
    const armVorn = 'M-1 95.6 C3 90 10 88.8 19 88.2 C37 86.6 59 83 71.6 81.2 C78.6 80.2 80.4 89.4 74.4 91 C58 95 34 99.8 14 101.8 L-1 101.8 Z';
    const handR = 'M72.4 80.8 C75.8 78.2 81.4 78.4 83 81.8 C84.6 85.4 82.4 89.6 78.4 90.4 C75.6 91 73.8 89.4 74.2 87.4 Z';
    const handL = 'M32.2 81.4 C28.4 79.8 23.8 81.2 23.4 85 C23 88.6 26 91.4 29.6 91 C32 90.6 33.2 88.6 32.4 86.6 Z';
    return `<svg class="hd-avatar" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true">`
      + `<defs>`
      + `<clipPath id="${id}-k"><rect x="0.5" y="0.5" width="99" height="99" rx="14"/></clipPath>`
      + `<clipPath id="${id}-t"><path d="${torso}"/></clipPath>`
      + `<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2e37"/><stop offset="1" stop-color="#0b0d11"/></linearGradient>`
      + `<radialGradient id="${id}-glow" cx=".5" cy=".95" r=".6"><stop offset="0" stop-color="${basis}" stop-opacity=".55"/><stop offset="1" stop-color="${basis}" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id}-anzug" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${anzugH}"/><stop offset=".45" stop-color="${basis}"/><stop offset="1" stop-color="${anzugD}"/></linearGradient>`
      + `<radialGradient id="${id}-haut" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="${hautH}"/><stop offset=".55" stop-color="${haut}"/><stop offset="1" stop-color="${hautD}"/></radialGradient>`
      + `<linearGradient id="${id}-haar" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${haarH}"/><stop offset="1" stop-color="${haarD}"/></linearGradient>`
      + `<linearGradient id="${id}-arm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${anzugH}"/><stop offset=".5" stop-color="${basis}"/><stop offset="1" stop-color="${anzugD}"/></linearGradient>`
      + `<linearGradient id="${id}-armH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${basis}"/><stop offset="1" stop-color="${anzugDD}"/></linearGradient>`
      + `<linearGradient id="${id}-rand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".85" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>`
      + `</defs>`
      + `<g clip-path="url(#${id}-k)">`
      // background: dark studio, car-colour glow and two slanted broadcast stripes
      + `<rect width="100" height="100" fill="url(#${id}-bg)"/>`
      + `<path d="M64 -2 L80 -2 L44 102 L28 102 Z" fill="${basis}" opacity=".85"/>`
      + `<path d="M83 -2 L88 -2 L52 102 L47 102 Z" fill="${a1}" opacity=".7"/>`
      + `<rect width="100" height="100" fill="url(#${id}-glow)"/>`
      // neck and its shadow
      + `<path d="M43.4 44 L56.6 44 L57.8 61 C54 64 46 64 42.2 61 Z" fill="${hautD}"/>`
      + `<path d="M43 48.4 C46.4 53 53.6 53 57 48.4 L57.4 56 C53.6 59 46.4 59 42.6 56 Z" fill="${hautDD}" opacity=".7"/>`
      // suit, panels, shading, rim light
      + `<path d="${torso}" fill="url(#${id}-anzug)"/>`
      + `<g clip-path="url(#${id}-t)">${am}<path d="M0 0 H100 V101 H0 Z" fill="url(#${id}-rand)"/>`
      + `<rect x="24" y="66.6" width="10" height="4.2" rx="0.8" fill="${patch}"/><rect x="24" y="71.4" width="6.4" height="2.4" rx="0.6" fill="${a2}"/>`
      + `<rect x="65" y="66.2" width="12" height="5.8" rx="0.9" fill="${patch}"/>`
      + `<text x="71" y="70.8" font-family="Inter,system-ui,sans-serif" font-size="5" font-weight="900" font-style="italic" text-anchor="middle" fill="${hdHell(patch) > 0.6 ? '#14161c' : '#ffffff'}">${nummer}</text></g>`
      // high fireproof collar with a zip
      + `<path d="M39.4 55.6 H60.6 L61.8 64.6 C56.8 67.6 43.2 67.6 38.2 64.6 Z" fill="${anzugDD}"/>`
      + `<path d="M39.2 62.8 C43.8 65.2 56.2 65.2 60.8 62.8" fill="none" stroke="${a1}" stroke-width="1.2"/>`
      + `<path d="M50 66 V80" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
      // arms crossed
      + `<g transform="translate(0 -7) translate(0 90) scale(1 1.22) translate(0 -90)">`
      + `<ellipse cx="2" cy="94" rx="9" ry="9" fill="${anzugD}"/><ellipse cx="98" cy="91" rx="9" ry="9" fill="${anzugDD}"/>`
      + `<path d="${armHinten}" fill="url(#${id}-armH)"/>`
      + `<path d="M34 83.6 C52 86 80 89.4 101 91.4" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".9"/>`
      + `<path d="${handL}" fill="url(#${id}-haut)"/><path d="M22 86.6 C23.4 86.2 24.8 86.4 26 87" stroke="${hautDD}" stroke-width=".6" fill="none" opacity=".7"/>`
      + `<path d="M8 99 C30 96.6 56 92.4 76 88.6 L76 92.6 C58 96.6 34 101 12 102.4 Z" fill="rgba(0,0,0,.35)"/>`
      + `<path d="${armVorn}" fill="url(#${id}-arm)"/>`
      + `<path d="M62.4 82.6 C65.4 82.1 68.2 81.6 71 81.2 L72.6 90.6 C69.6 91.4 66.8 92.2 63.8 93 Z" fill="${a1}"/>`
      + `<path d="M4 92.4 C12 89.6 34 88 52 85.4" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/>`
      + `<path d="M10 99.4 C30 97.4 54 93.6 70 90.4" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`
      + `<path d="${handR}" fill="url(#${id}-haut)"/><path d="M76.6 82.6 C78.4 82.2 80 82.8 81 84" stroke="${hautDD}" stroke-width=".6" fill="none" opacity=".7"/>`
      + `</g>`
      // head: ears, face, features, hair
      + `<g transform="translate(8 0.6) scale(.84)">`
      + `<ellipse cx="33.6" cy="37.5" rx="3.1" ry="5" fill="${hautD}"/><ellipse cx="66.4" cy="37.5" rx="3.1" ry="5" fill="${hautD}"/>`
      + `<path d="${gesicht}" fill="url(#${id}-haut)"/>`
      + `<path d="M62.5 30 C64.6 38 63.6 47 58 54 C61.8 50 64.6 43 66 34 Z" fill="${hautDD}" opacity=".35"/>`
      + (bart ? `<path d="M37.6 45 C39.6 53 45 57.8 50 57.8 C55 57.8 60.4 53 62.4 45 C60 51.6 56 54 50 54 C44 54 40 51.6 37.6 45 Z" fill="${haar}" opacity=".55"/>` : '')
      // brows, eyes, nose, mouth
      + `<path d="M39.6 31.6 C41.6 30.2 44.8 30 47 31" stroke="${haarD}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
      + `<path d="M53 31 C55.2 30 58.4 30.2 60.4 31.6" stroke="${haarD}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
      + `<ellipse cx="43.4" cy="36" rx="2.7" ry="1.45" fill="#f4f1ec"/><ellipse cx="56.6" cy="36" rx="2.7" ry="1.45" fill="#f4f1ec"/>`
      + `<circle cx="43.6" cy="36" r="1.15" fill="${augen}"/><circle cx="56.4" cy="36" r="1.15" fill="${augen}"/>`
      + `<circle cx="43.9" cy="35.6" r=".35" fill="#fff"/><circle cx="56.7" cy="35.6" r=".35" fill="#fff"/>`
      + `<path d="M40.6 35 C42 34 45 34 46.2 35.2 M53.8 35.2 C55 34 58 34 59.4 35" stroke="${hautDD}" stroke-width=".7" fill="none"/>`
      + `<path d="M50.6 37.4 C51 41.4 52.4 43.6 52 45.2 C51.2 46 49.6 46.2 48.4 45.6" stroke="${hautDD}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>`
      + `<path d="M45.4 49.6 C48 50.8 52 50.8 54.6 49.6" stroke="${hdDunkler(haut, 0.5)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
      + `<path d="M46.8 51.6 C48.6 52.4 51.4 52.4 53.2 51.6" stroke="${hautH}" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".7"/>`
      // hair
      + `<path d="${haare[frisur]}" fill="url(#${id}-haar)"/>`
      + `<path d="M64.6 22 C67.6 28 67.8 38 65.6 46 C64.4 50.4 62 53.6 59.6 55.4" fill="none" stroke="${basis}" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`
      + (frisur === 5 ? `<path d="M44 22.4 C47 18 52 15.4 58 15" stroke="${haarH}" stroke-width=".8" fill="none" opacity=".7"/>` : '')
      + (frisur === 2 ? '' : `<path d="M40 17 C45 13.6 54 13 60 16" stroke="${haarH}" stroke-width=".9" fill="none" opacity=".45" stroke-linecap="round"/>`)
      + `</g></g></svg>`;
  }
  function hdAvatarStil(car) { return (hd.avatare && hd.avatare[String(car.device.id)]) || 0; }
  // Hook used by the garage card (90-ghosts.js).
  function hdAvatarHtml(car, px) {
    if (!car || !car.device) return '';
    const name = car.alias || car.tag || garageLabel(car);
    return `<button type="button" class="hd-avatar-knopf" data-hd-avatar="${String(car.device.id).replace(/"/g, '')}" `
      + `title="${t('Avatar ändern')}">${hdAvatarSvg(name, carColor(car).hex, hdAvatarStil(car), px || 34, carModellWert(car.modellId))}</button>`;
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
    box.innerHTML = `<span class="hd-gk-bild">${hdAvatarSvg(name, f.hex, hdAvatarStil(car), 112, carModellWert(car.modellId))}</span>`
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

      // H: avatar.
      const svg = hdAvatarSvg('Mara Kovac', '#e23b3b', 0, 30, 'porsche911');
      const svg2 = hdAvatarSvg('Mara Kovac', '#e23b3b', 0, 30, 'porsche911');
      const svg3 = hdAvatarSvg('Mara Kovac', '#e23b3b', 1, 30, 'porsche911');
      const ohneId = (x) => x.replace(/hdav\d+-\d+/g, '');
      prüfen('avatar: driver in the car colour, brand accents, same look every time, new look on tap',
             svg.includes('fill="#e23b3b"') && /#(d5001c|111111|ffffff|c9a227)/i.test(svg)
             && ohneId(svg) === ohneId(svg2) && ohneId(svg) !== ohneId(svg3), svg.length + ' chars');
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
