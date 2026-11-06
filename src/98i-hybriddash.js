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
    // Accents: brand colours that differ from the base (and from each other).
    const akz = pal.filter((c) => c.toLowerCase() !== basis.toLowerCase());
    const a1 = akz[Math.floor(r() * akz.length)];
    const a2 = akz.filter((c) => c !== a1)[Math.floor(r() * (akz.length - 1))] || '#ffffff';
    // Helmet: car colour most of the time, sometimes a brand colour or white.
    const helm = r() < 0.65 ? basis : pick([pal[0], '#f4f5f7', '#1c1f24'].filter((c) => c.toLowerCase() !== a1.toLowerCase()));
    const haut = pick(HD_HAUT), haar = pick(HD_HAARE);
    const helmMuster = Math.floor(r() * 6), anzugMuster = Math.floor(r() * 5);
    const kante = hdHell(basis) > 0.8 ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,.18)';
    const id = 'hdav' + (++hdAvatarNr) + '-' + (hdHash(String(name)) % 9973);
    const nummer = 1 + (hdHash(String(name)) % 99);
    const helmPfad = 'M24 46 C23 25 35 13 51 13 C67 13 78 25 77 44 C76.5 55 73 62 66 66 L35 66 C28 62 24.5 55 24 46 Z';
    const torso = 'M3 104 C4 85 17 74 36 70.5 L64 70.5 C83 74 96 85 97 104 Z';
    // Helmet patterns (clipped to the shell) - on the sides, crown and chin, where the raised
    // visor and the face opening leave the shell visible.
    const spiegel = (d) => `<path d="${d}" fill="CF"/><path d="${d}" fill="CF" transform="translate(101 0) scale(-1 1)"/>`;
    const hm = [
      spiegel('M23 40 L31 35 L37 63 L28 64 Z').replace(/CF/g, a1) + spiegel('M30 36 L32 35 L38 63 L36 63 Z').replace(/CF/g, a2),
      `<path d="M20 53 C30 60 72 60 82 53 L82 72 L20 72 Z" fill="${a1}"/><path d="M22 51 C32 57.5 70 57.5 80 51" fill="none" stroke="${a2}" stroke-width="1.8"/>`,
      `<path d="M47 8 H55 V24 H47 Z" fill="${a1}"/>` + spiegel('M24 44 L31 40 L33 47 L25 51 Z').replace(/CF/g, a2) + spiegel('M25 54 L33 50 L35 57 L27 61 Z').replace(/CF/g, a1),
      spiegel('M22 34 C30 38 26 46 32 50 C27 54 30 60 34 66 L22 66 Z').replace(/CF/g, a1),
      spiegel(Array.from({ length: 4 }, (_, i) => `M${23 + (i % 2) * 4.5} ${38 + i * 6} h4.5 v6 h-4.5 Z M${27.5 - (i % 2) * 4.5} ${41 + i * 6} h4.5 v3 h-4.5 Z`).join(' ')).replace(/CF/g, a1),
      `<path d="M10 8 H51 V72 H10 Z" fill="${a1}" opacity=".95"/><path d="M50 8 H52.5 V72 H50 Z" fill="${a2}"/>`,
    ][helmMuster];
    // Suit patterns (clipped to the torso).
    const am = [
      `<path d="M3 92 C9 80 21 73.5 36 70.5 L32 80 C21 82 12 87 6 98 Z M97 92 C91 80 79 73.5 64 70.5 L68 80 C79 82 88 87 94 98 Z" fill="${a1}"/>`,
      `<path d="M36 70.5 L50 90 L64 70.5 L58.5 70.5 L50 82.5 L41.5 70.5 Z" fill="${a1}"/><path d="M12 104 L18 82 L23.5 82 L18 104 Z M88 104 L82 82 L76.5 82 L82 104 Z" fill="${a2}"/>`,
      `<path d="M15 76 L25 72.5 L62 104 L50 104 Z" fill="${a1}"/>`,
      `<path d="M3 93 H97 V98 H3 Z" fill="${a1}"/><path d="M3 100 H97 V103 H3 Z" fill="${a2}"/>`,
      `<path d="M5 94 C11 82 23 75 36 71.5 L34 76.5 C23 79.5 14 86 9.5 96 Z M95 94 C89 82 77 75 64 71.5 L66 76.5 C77 79.5 86 86 90.5 96 Z" fill="${a1}"/><path d="M44 71 H56 L54 104 H46 Z" fill="${a2}"/>`,
    ][anzugMuster];
    const patch = hdHell(basis) > 0.7 ? '#2a2e35' : '#f1f2f4';   // always readable on the suit
    return `<svg class="hd-avatar" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true">`
      + `<defs><clipPath id="${id}-k"><rect x="1" y="1" width="98" height="98" rx="18"/></clipPath>`
      + `<clipPath id="${id}-h"><path d="${helmPfad}"/></clipPath><clipPath id="${id}-t"><path d="${torso}"/></clipPath></defs>`
      + `<g clip-path="url(#${id}-k)">`
      + `<rect width="100" height="100" fill="#eef0f3"/>`
      // suit
      + `<path d="${torso}" fill="${basis}" stroke="${kante}" stroke-width="1"/>`
      + `<g clip-path="url(#${id}-t)">${am}</g>`
      + `<rect x="25" y="84" width="14" height="6.5" rx="1.2" fill="${patch}"/><rect x="61" y="84" width="14" height="6.5" rx="1.2" fill="${patch}"/>`
      + `<text x="68" y="89.4" font-family="Inter,system-ui,sans-serif" font-size="5" font-weight="800" text-anchor="middle" fill="${hdHell(patch) > 0.6 ? '#14161c' : '#ffffff'}">${nummer}</text>`
      // collar and neck
      + `<path d="M38 63 H62 L64.5 72.5 C58 75.5 42 75.5 35.5 72.5 Z" fill="${hdDunkler(basis, 0.55)}"/>`
      + `<path d="M43.5 62 H56.5 V69 C53.5 71 46.5 71 43.5 69 Z" fill="${hdDunkler(haut, 0.85)}"/>`
      // helmet shell + pattern
      + `<path d="${helmPfad}" fill="${helm}" stroke="${hdHell(helm) > 0.8 ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.2)'}" stroke-width="1"/>`
      + `<g clip-path="url(#${id}-h)">${hm}<path d="M24 52 C30 66 72 66 77 52 L77 70 L24 70 Z" fill="${hdDunkler(helm, 0.82)}"/></g>`
      // face opening, face, fringe
      + `<path d="M32 38 C33 31 42 29 51 29 C60 29 68 31 69 38 L68 50 C66 57 58 60 50.5 60 C43 60 35 57 33 50 Z" fill="#1c1f24"/>`
      + `<path d="M34 39 C35 33 43 31.5 51 31.5 C59 31.5 66 33 67 39 L66 49 C64.5 55 57.5 58 50.5 58 C43.5 58 36.5 55 35 49 Z" fill="${haut}"/>`
      + `<path d="M34 41 C35 33 43 31.5 51 31.5 C59 31.5 66 33 67 41 C62 36 57 39 52 37 C47 40 41 36 34 41 Z" fill="${haar}"/>`
      // raised visor
      + `<path d="M28 34 C31 22 40 18 51 18 C62 18 71 22 74 34 C67 29 60 27.5 51 27.5 C42 27.5 35 29 28 34 Z" fill="#2a2e35"/>`
      + `<path d="M33 27 C38 22 44 20.5 51 20.5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.6" stroke-linecap="round"/>`
      // chin guard vent
      + `<path d="M44 61.5 H57" stroke="rgba(0,0,0,.35)" stroke-width="1.6" stroke-linecap="round"/>`
      + `</g></svg>`;
  }
  function hdAvatarStil(car) { return (hd.avatare && hd.avatare[String(car.device.id)]) || 0; }
  // Hook used by the garage card (90-ghosts.js).
  function hdAvatarHtml(car, px) {
    if (!car || !car.device) return '';
    const name = car.alias || car.tag || garageLabel(car);
    return `<button type="button" class="hd-avatar-knopf" data-hd-avatar="${String(car.device.id).replace(/"/g, '')}" `
      + `title="${t('Avatar ändern')}">${hdAvatarSvg(name, carColor(car).hex, hdAvatarStil(car), px || 34, carModellWert(car.modellId))}</button>`;
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
