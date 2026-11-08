  // =====================================================================================
  // Hybrid-Dash 3.0: CAR MODEL STATS (from the real cars) AND NPC DRIVING STYLES
  // =====================================================================================
  //
  // BESTELLT: "Do the different car make and model have different statistics? If not, I want you to do the research
  // and make the car make and models have different statistics based on their real world counter parts ... I want to
  // see this graphically ... and maybe a way to compare it with other models. I want each NPC to have different
  // driving styles, that can also be manually adjusted if needed. and show this graphically too."
  //
  // Until now CAR_MODELLE (90-ghosts.js) was a name only. Here every model gets the figures of the race car it stands
  // for (the Carrera cars are GT3 / F1 liveries), four 0-100 ratings derived from them, and four BOUNDED factors the
  // physics engine multiplies in (engine.modell, 40-physics.js: acceleration, top-speed ceiling, cornering grip,
  // braking). GT3 cars are balance-of-performance cars in real life, so they stay within a few per cent of each other;
  // the F1 car and the Beetle are the outliers. The option sliders keep working on top: the factors are a separate
  // layer, all 1 for "not assigned", and off during the self-test suite.
  //
  // Figures: power and weight from the 2024 GT3 balance-of-performance sheets and the manufacturers where found; the
  // ones marked "~" are estimates (no reliable published figure), see HD_MODELL_QUELLEN.

  const HD_MODELL_SPECS = {
    bmw:         { real: 'BMW M4 GT3', klasse: 'GT3', ps: 590, kg: 1265, kmh: 290, motor: '3.0 L Biturbo-R6', layout: 'Frontmittelmotor, Heckantrieb', handling: 72, bremsen: 74, schaetz: ['ps', 'kmh'] },
    porsche911:  { real: 'Porsche 911 GT3 R (992)', klasse: 'GT3', ps: 565, kg: 1250, kmh: 290, motor: '4.2 L Boxer-6, Saugmotor', layout: 'Heckmotor, Heckantrieb', handling: 74, bremsen: 77, schaetz: ['kmh'] },
    fordmustang: { real: 'Ford Mustang GT3', klasse: 'GT3', ps: 500, kg: 1300, kmh: 285, motor: '5.4 L V8, Saugmotor', layout: 'Frontmittelmotor, Heckantrieb', handling: 68, bremsen: 70, schaetz: ['ps', 'kg', 'kmh'] },
    ferrari:     { real: 'Ferrari 296 GT3', klasse: 'GT3', ps: 600, kg: 1275, kmh: 290, motor: '3.0 L Biturbo-V6', layout: 'Mittelmotor, Heckantrieb', handling: 76, bremsen: 75, schaetz: ['ps', 'kmh'] },
    audi:        { real: 'Audi R8 LMS GT3 evo II', klasse: 'GT3', ps: 585, kg: 1235, kmh: 285, motor: '5.2 L V10, Saugmotor', layout: 'Mittelmotor, Heckantrieb', handling: 75, bremsen: 74, schaetz: [] },
    mclaren:     { real: 'McLaren 720S GT3 Evo', klasse: 'GT3', ps: 541, kg: 1330, kmh: 290, motor: '4.0 L Biturbo-V8', layout: 'Mittelmotor, Heckantrieb', handling: 77, bremsen: 73, schaetz: ['kg', 'kmh'] },
    mercedes:    { real: 'Mercedes-AMG GT3 Evo', klasse: 'GT3', ps: 550, kg: 1285, kmh: 285, motor: '6.2 L V8, Saugmotor', layout: 'Frontmittelmotor, Heckantrieb', handling: 71, bremsen: 73, schaetz: ['ps', 'kmh'] },
    redbull:     { real: 'Red Bull RB20 (Formel 1)', klasse: 'F1', ps: 1000, kg: 798, kmh: 350, motor: '1.6 L Turbo-V6-Hybrid', layout: 'Mittelmotor, Heckantrieb, Ground-Effect', handling: 100, bremsen: 100, schaetz: ['ps'] },
    vwkaefer:    { real: 'VW Käfer 1300', klasse: 'Klassiker', ps: 44, kg: 800, kmh: 120, motor: '1.3 L Boxer-4, luftgekühlt', layout: 'Heckmotor, Heckantrieb', handling: 18, bremsen: 12, schaetz: [] },
  };
  const HD_MODELL_QUELLEN = [
    'GT3 BoP 2024 (SRO / IMSA): BMW M4 GT3 1265 kg, Ferrari 296 GT3 1275 kg, Mercedes-AMG GT3 1285 kg, Porsche 911 GT3 R 1250 kg',
    'Porsche Motorsport: 911 GT3 R (992) bis 565 PS',
    'Audi Sport customer racing: R8 LMS GT3 evo II bis 585 PS, 1235 kg',
    'McLaren 720S GT3 Evo: 541 PS (Automobilista 2 Fahrzeugdaten)',
    'Red Bull RB20: ca. 1000 PS, 798 kg Mindestgewicht (FIA)',
    'VW Käfer 1300: 44 PS, ca. 800 kg, 120 km/h',
  ];
  // Reference = an average GT3 car: its factors are 1.
  const HD_REF = { accel: 70, top: 75, handling: 73, bremsen: 74 };
  function hdWertRating(id) {
    const s = HD_MODELL_SPECS[id];
    if (!s) return null;
    const pw = s.ps / s.kg * 1000;            // PS per tonne
    const accel = Math.round(Math.max(0, Math.min(100, 100 * (Math.log(pw) - Math.log(40)) / (Math.log(1300) - Math.log(40)))));
    const top = Math.round(Math.max(0, Math.min(100, (s.kmh - 80) / (360 - 80) * 100)));
    const r = { accel, top, handling: s.handling, bremsen: s.bremsen, pw: Math.round(pw) };
    r.gesamt = Math.round((r.accel + r.top + r.handling + r.bremsen) / 4);
    return r;
  }
  function hdWertFaktoren(id) {
    const r = hdWertRating(id);
    if (!r) return { top: 1, accel: 1, brake: 1, grip: 1 };
    const f = (wert, ref, k, lo, hi) => +Math.max(lo, Math.min(hi, 1 + (wert - ref) / 100 * k)).toFixed(3);
    return {
      accel: f(r.accel, HD_REF.accel, 1.0, 0.75, 1.15),
      top: f(r.top, HD_REF.top, 0.6, 0.8, 1.12),
      grip: f(r.handling, HD_REF.handling, 0.6, 0.85, 1.08),
      brake: f(r.bremsen, HD_REF.bremsen, 0.8, 0.8, 1.1),
    };
  }
  const HD_WERT_AN_STORE = 'hybriddash.modellwirkung';
  function hdWertWirkungAn() { try { return localStorage.getItem(HD_WERT_AN_STORE) !== 'aus'; } catch (e) { return true; } }
  function hdWertNeutral() {
    try { if (typeof hdSuiteLaeuft === 'function' && hdSuiteLaeuft()) return true; } catch (e) { /* not ready */ }
    return !hdWertWirkungAn();
  }
  function hdWertFuerAuto(car) {
    if (!car || hdWertNeutral()) return { top: 1, accel: 1, brake: 1, grip: 1 };
    return hdWertFaktoren(typeof carModellWert === 'function' ? carModellWert(car.modellId) : '');
  }
  // The NPC's target pace (a share of full speed) for this model: straights from top speed and acceleration, corners
  // from grip. Called from the ghost driver (90-ghosts.js) right after the difficulty.
  function hdModellTempo(car) {
    const f = hdWertFuerAuto(car);
    if (f.top === 1 && f.accel === 1 && f.grip === 1) return 1;
    let x;
    try { x = ghostTurnOf(car.tileCode) !== 0 ? Math.sqrt(f.grip) : Math.sqrt(f.top * f.accel); } catch (e) { x = 1; }
    return Math.max(0.82, Math.min(1.08, x));
  }
  // Every engine gets the factors of the car it drives: players 1-3 and every NPC.
  function hdWertMotorSetzen(motor, car) {
    if (!motor) return;
    const f = hdWertFuerAuto(car);
    const m = motor.modell || (motor.modell = { top: 1, accel: 1, brake: 1, grip: 1 });
    m.top = f.top; m.accel = f.accel; m.brake = f.brake; m.grip = f.grip;
  }
  function hdWertMotorenAbgleichen() {
    try {
      if (typeof physEngine !== 'undefined') hdWertMotorSetzen(physEngine, playerCar || garage.find((c) => c && c.role === 'player') || null);
      if (typeof physEngine2 !== 'undefined') hdWertMotorSetzen(physEngine2, typeof playerCar2 !== 'undefined' ? playerCar2 : null);
      if (typeof zusatzPlatz === 'function' && typeof SPIELER_MAX !== 'undefined') {
        for (let nr = 3; nr <= SPIELER_MAX; nr++) { const z = zusatzPlatz(nr); if (z && z.car) hdWertMotorSetzen(z.motor, z.car); }
      }
      for (const c of garage) if (c && c.ghost && c.ghost.engine) hdWertMotorSetzen(c.ghost.engine, c);
    } catch (e) { /* not ready */ }
  }
  setInterval(hdWertMotorenAbgleichen, 500);

  // =====================================================================================
  // NPC DRIVING STYLE: seven traits, 0-100, per car (device id), stored; generated once per car so every NPC differs
  // =====================================================================================
  //
  // Each trait turns an EXISTING behaviour knob of the ghost driver (see ghostCharakter in 90-ghosts.js):
  //   Overtaking      -> how often it launches a pass             (angriff 0.5 .. 1.5)
  //   Defending       -> how often it covers the attacked side     (verteidigung 0.5 .. 1.5)
  //   Consistency     -> how often it makes a mistake              (fehler 1.5 .. 0.5)
  //   Cornering       -> how much speed it gives away in corners   (kurvenAbzug 1.2 .. 0.8)
  //   Tyre / Fuel mgmt-> how long its stints are                   (pit window -2 .. +2 laps)
  //   Wet weather     -> how much pace and how many mistakes rain costs it (x1.4 .. x0.6)
  // The old per-race random "driver character" switch still works and varies around this base.
  const HD_STIL_STORE = 'hybriddash.fahrstil.v1';
  const HD_STIL_TRAITS = [
    { k: 'ueberholen', de: 'Überholen' },
    { k: 'verteidigen', de: 'Verteidigen' },
    { k: 'konstanz', de: 'Konstanz' },
    { k: 'kurven', de: 'Kurvenmut' },
    { k: 'reifen', de: 'Reifenmanagement' },
    { k: 'sprit', de: 'Spritmanagement' },
    { k: 'regen', de: 'Regenfahren' },
  ];
  const HD_STIL_PRESETS = [
    { id: 'ausgewogen', de: 'Ausgewogen', w: { ueberholen: 60, verteidigen: 60, konstanz: 60, kurven: 60, reifen: 60, sprit: 60, regen: 60 } },
    { id: 'angreifer', de: 'Angreifer', w: { ueberholen: 92, verteidigen: 55, konstanz: 42, kurven: 85, reifen: 38, sprit: 45, regen: 60 } },
    { id: 'verteidiger', de: 'Verteidiger', w: { ueberholen: 48, verteidigen: 94, konstanz: 78, kurven: 55, reifen: 70, sprit: 62, regen: 55 } },
    { id: 'stratege', de: 'Stratege', w: { ueberholen: 55, verteidigen: 62, konstanz: 86, kurven: 50, reifen: 93, sprit: 90, regen: 58 } },
    { id: 'regen', de: 'Regenkönig', w: { ueberholen: 66, verteidigen: 60, konstanz: 64, kurven: 66, reifen: 60, sprit: 55, regen: 96 } },
    { id: 'rookie', de: 'Neuling', w: { ueberholen: 38, verteidigen: 32, konstanz: 28, kurven: 40, reifen: 35, sprit: 40, regen: 30 } },
  ];
  let hdStilDaten = null, hdStilVersion = 1;
  const hdStilCache = new Map();
  function hdStilAlle() {
    if (!hdStilDaten) { try { hdStilDaten = JSON.parse(localStorage.getItem(HD_STIL_STORE) || '{}') || {}; } catch (e) { hdStilDaten = {}; } }
    return hdStilDaten;
  }
  function hdStilSpeichern() {
    hdStilVersion++;
    try { localStorage.setItem(HD_STIL_STORE, JSON.stringify(hdStilAlle())); } catch (e) { /* private */ }
  }
  // A generated style: seeded from the device id, so the same car always starts with the same driver.
  function hdStilErzeugen(seedText) {
    let h = 2166136261;
    for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    let a = h | 0;
    const rnd = () => {   // mulberry32
      a = (a + 0x6D2B79F5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 4; i++) rnd();
    const w = {};
    for (const tr of HD_STIL_TRAITS) w[tr.k] = 52 + ((rnd() + rnd()) / 2 - 0.5) * 60;
    // A signature: one trait the driver is known for, one it is weak at - so every NPC reads differently.
    const stark = HD_STIL_TRAITS[Math.floor(rnd() * HD_STIL_TRAITS.length)].k;
    let schwach = HD_STIL_TRAITS[Math.floor(rnd() * HD_STIL_TRAITS.length)].k;
    if (schwach === stark) schwach = HD_STIL_TRAITS[(HD_STIL_TRAITS.findIndex((x) => x.k === stark) + 3) % HD_STIL_TRAITS.length].k;
    w[stark] += 28; w[schwach] -= 22;
    for (const tr of HD_STIL_TRAITS) w[tr.k] = Math.round(Math.max(12, Math.min(97, w[tr.k])));
    return w;
  }
  function hdStilId(car) { return car && car.device ? String(car.device.id) : ''; }
  function hdStilWerte(car) {
    const id = hdStilId(car);
    if (!id) return hdStilErzeugen('leer');
    const alle = hdStilAlle();
    if (!alle[id]) { alle[id] = hdStilErzeugen(id); hdStilSpeichern(); }
    const w = alle[id];
    for (const tr of HD_STIL_TRAITS) if (typeof w[tr.k] !== 'number') w[tr.k] = 50;
    return w;
  }
  function hdStilSetzen(car, k, v) {
    const w = hdStilWerte(car);
    w[k] = Math.round(Math.max(0, Math.min(100, +v || 0)));
    hdStilSpeichern();
  }
  // Back to the style the car was born with (the generated one).
  function hdStilZuruecksetzen(car) {
    const id = hdStilId(car);
    if (!id) return;
    hdStilAlle()[id] = hdStilErzeugen(id);
    hdStilSpeichern();
  }
  function hdStilGesamt(w) { return Math.round(HD_STIL_TRAITS.reduce((s, tr) => s + w[tr.k], 0) / HD_STIL_TRAITS.length); }
  // The label under the name: the trait it is best at.
  function hdStilTyp(w) {
    const p = HD_STIL_PRESETS.find((x) => HD_STIL_TRAITS.every((tr) => x.w[tr.k] === w[tr.k]));
    if (p) return t(p.de);
    const best = HD_STIL_TRAITS.slice().sort((a, b) => w[b.k] - w[a.k])[0];
    return ({ ueberholen: t('Angreifer'), verteidigen: t('Verteidiger'), konstanz: t('Fehlerlos'), kurven: t('Kurvenkünstler'),
      reifen: t('Reifenflüsterer'), sprit: t('Spritsparer'), regen: t('Regenkönig') })[best.k];
  }
  function hdStilAus(car) {
    if (!car || car.role !== 'ghost' || !car.device) return true;
    try { if (typeof hdSuiteLaeuft === 'function' && hdSuiteLaeuft()) return true; } catch (e) { /* not ready */ }
    return false;
  }
  // The style as ghost-character factors (cached: ghostCharakter runs every tick for every NPC).
  function hdStilCharakter(car) {
    if (hdStilAus(car)) return null;
    const id = hdStilId(car);
    const c = hdStilCache.get(id);
    if (c && c.v === hdStilVersion) return c.ch;
    const w = hdStilWerte(car);
    const d = (k) => (w[k] - 50) / 50;
    const ch = {
      angriff: +(1 + 0.5 * d('ueberholen')).toFixed(3),
      verteidigung: +(1 + 0.5 * d('verteidigen')).toFixed(3),
      fehler: +(1 - 0.5 * d('konstanz')).toFixed(3),
      kurvenAbzug: +(1 - 0.2 * d('kurven')).toFixed(3),
      pitVersatz: Math.max(-2, Math.min(2, Math.round(1.2 * d('reifen') + 0.8 * d('sprit')))),
      regen: +(1 - 0.4 * d('regen')).toFixed(3),
    };
    hdStilCache.set(id, { v: hdStilVersion, ch });
    return ch;
  }
  function hdStilRegen(car) { const ch = hdStilCharakter(car); return ch ? ch.regen : 1; }
  function hdStilPitFuerGhost(g) {
    try { const car = garage.find((c) => c && c.ghost === g); const ch = hdStilCharakter(car); return ch ? ch.pitVersatz : 0; } catch (e) { return 0; }
  }

  // =====================================================================================
  // THE CARDS: car stats (with compare) and driver style (editable), one modal
  // =====================================================================================
  let hdWertBox = null, hdWertZustand = null;
  function hdWertEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function hdWertModelle() { return CAR_MODELLE.filter((m) => m.id && HD_MODELL_SPECS[m.id]); }
  function hdWertBoxBauen() {
    if (hdWertBox) return;
    hdWertBox = document.createElement('div');
    hdWertBox.id = 'hd-wert'; hdWertBox.className = 'hd-gepaart hdw-modal'; hdWertBox.setAttribute('role', 'dialog');
    hdWertBox.setAttribute('aria-modal', 'true'); hdWertBox.setAttribute('data-i18n-skip', '');
    hdWertBox.hidden = true;
    document.body.appendChild(hdWertBox);
    hdWertBox.addEventListener('click', hdWertKlick);
    hdWertBox.addEventListener('input', hdWertEingabe);
    // Letting go of a bar: redraw once, so the comparison differences follow.
    hdWertBox.addEventListener('change', (e) => { if (e.target.closest('[data-hdw-trait]')) { hdWertMalen(); try { hdSetupMalen(); } catch (er) { /* not open */ } } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdWertBox && !hdWertBox.hidden) hdWertZu(); });
  }
  function hdWertZu() { if (hdWertBox) hdWertBox.hidden = true; hdWertZustand = null; }
  function hdWertKopf(titel) {
    return '<div class="hdg-kopf"><b>' + hdWertEsc(titel) + '</b><button type="button" class="hdg-zu" data-hdw="zu" aria-label="' + hdWertEsc(t('Schließen')) + '">&#10005;</button></div>';
  }
  // One stat bar; with a comparison value a second, thin bar under it and the difference.
  function hdWertBalken(label, wert, vergleich, farbe) {
    const diff = vergleich == null ? '' : (wert === vergleich ? '<i class="hdw-d">=</i>'
      : '<i class="hdw-d ' + (wert > vergleich ? 'plus' : 'minus') + '">' + (wert > vergleich ? '+' : '−') + Math.abs(wert - vergleich) + '</i>');
    return '<div class="hdw-zeile"><span class="hdw-l">' + hdWertEsc(label) + '</span><b class="hdw-n">' + wert + '</b>' + diff
      + '<span class="hdw-bar"><span class="hdw-fill" style="width:' + wert + '%' + (farbe ? ';--hdw-f:' + farbe : '') + '"></span>'
      + (vergleich == null ? '' : '<span class="hdw-cmp" style="width:' + vergleich + '%"></span>') + '</span></div>';
  }
  function hdWertPfeil(D) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' + (D < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function hdWertZahl(s, k, text) { return (s.schaetz || []).includes(k) ? '~' + text : text; }
  // ---- car stats ----------------------------------------------------------------------------------------------------
  function hdWertAuto(car, modellId) {
    hdWertBoxBauen();
    const liste = hdWertModelle();
    let id = modellId || (car && typeof carModellWert === 'function' ? carModellWert(car.modellId) : '') || '';
    if (!HD_MODELL_SPECS[id]) id = liste[0].id;
    hdWertZustand = { art: 'auto', car: car || null, id, cmp: (hdWertZustand && hdWertZustand.art === 'auto') ? hdWertZustand.cmp : '' };
    hdWertMalen();
  }
  function hdWertAutoHtml() {
    const z = hdWertZustand, s = HD_MODELL_SPECS[z.id], r = hdWertRating(z.id), f = hdWertFaktoren(z.id);
    const cmpR = z.cmp && z.cmp !== z.id ? hdWertRating(z.cmp) : null;
    const name = t(carModellName(z.id));
    const farbe = z.car ? carColor(z.car).hex : '';
    const pz = (x) => (x >= 1 ? '+' : '−') + Math.abs(Math.round((x - 1) * 100)) + ' %';
    const auf = z.car ? (typeof carModellWert === 'function' ? carModellWert(z.car.modellId) : '') : '';
    let h = hdWertKopf(t('Fahrzeugwerte'));
    h += '<div class="hdw-titel"><button type="button" class="k-arrow hdw-pf" data-hdw="modell" data-d="-1" aria-label="' + hdWertEsc(t('Vorherige')) + '">' + hdWertPfeil(-1) + '</button>'
      + '<div class="hdw-name"><small>' + hdWertEsc(t(s.klasse)) + '</small><b>' + hdWertEsc(name) + '</b><span>' + hdWertEsc(t(s.real)) + '</span></div>'
      + '<div class="hdw-gesamt"><b>' + r.gesamt + '</b><small>' + hdWertEsc(t('Gesamt')) + '</small></div>'
      + '<button type="button" class="k-arrow hdw-pf" data-hdw="modell" data-d="1" aria-label="' + hdWertEsc(t('Nächste')) + '">' + hdWertPfeil(1) + '</button></div>';
    h += '<div class="hdw-balken">'
      + hdWertBalken(t('Beschleunigung'), r.accel, cmpR && cmpR.accel, farbe)
      + hdWertBalken(t('Höchstgeschwindigkeit'), r.top, cmpR && cmpR.top, farbe)
      + hdWertBalken(t('Handling'), r.handling, cmpR && cmpR.handling, farbe)
      + hdWertBalken(t('Bremsen'), r.bremsen, cmpR && cmpR.bremsen, farbe)
      + '</div>';
    if (cmpR) h += '<p class="hdw-leg"><span class="hdw-leg-a"></span>' + hdWertEsc(name) + ' <span class="hdw-leg-b"></span>' + hdWertEsc(t(carModellName(z.cmp))) + ' (' + cmpR.gesamt + ')</p>';
    h += '<div class="hdw-specs">'
      + '<div><small>' + hdWertEsc(t('Leistung')) + '</small><b>' + hdWertZahl(s, 'ps', s.ps + ' PS') + '</b></div>'
      + '<div><small>' + hdWertEsc(t('Gewicht')) + '</small><b>' + hdWertZahl(s, 'kg', s.kg + ' kg') + '</b></div>'
      + '<div><small>' + hdWertEsc(t('PS je Tonne')) + '</small><b>' + r.pw + '</b></div>'
      + '<div><small>' + hdWertEsc(t('Spitze')) + '</small><b>' + hdWertZahl(s, 'kmh', s.kmh + ' km/h') + '</b></div>'
      + '<div class="breit"><small>' + hdWertEsc(t('Motor')) + '</small><b>' + hdWertEsc(t(s.motor)) + '</b></div>'
      + '<div class="breit"><small>' + hdWertEsc(t('Bauart')) + '</small><b>' + hdWertEsc(t(s.layout)) + '</b></div>'
      + '</div>';
    h += '<p class="hdw-wirkung"><b>' + hdWertEsc(t('Im Spiel')) + ':</b> ' + hdWertEsc(t('Beschleunigung')) + ' ' + pz(f.accel)
      + ' · ' + hdWertEsc(t('Spitze')) + ' ' + pz(Math.min(1, f.top)) + ' · ' + hdWertEsc(t('Kurvengrip')) + ' ' + pz(f.grip)
      + ' · ' + hdWertEsc(t('Bremsen')) + ' ' + pz(f.brake) + (hdWertWirkungAn() ? '' : ' <i>(' + hdWertEsc(t('aus')) + ')</i>') + '</p>';
    h += '<div class="hdw-cmpwahl"><span class="hds-l">' + hdWertEsc(t('Vergleichen mit')) + '</span><span class="hds-chips">'
      + '<button type="button" data-hdw="cmp" data-id=""' + (!z.cmp ? ' class="an"' : '') + '>' + hdWertEsc(t('Keins')) + '</button>'
      + hdWertModelle().filter((m) => m.id !== z.id).map((m) => '<button type="button" data-hdw="cmp" data-id="' + m.id + '"' + (z.cmp === m.id ? ' class="an"' : '') + '>' + hdWertEsc(t(m.name)) + '</button>').join('')
      + '</span></div>';
    h += '<div class="hdg-fuss">';
    if (z.car) {
      h += auf === z.id ? '<span class="hdw-ok">&#10003; ' + hdWertEsc(t('Modell von')) + ' ' + hdWertEsc(z.car.alias || garageLabel(z.car)) + '</span>'
        : '<button type="button" class="primary" data-hdw="nehmen">' + hdWertEsc(t('Für dieses Auto übernehmen')) + ': ' + hdWertEsc(z.car.alias || garageLabel(z.car)) + '</button>';
    }
    h += '<label class="hdw-schalter"><input type="checkbox" data-hdw="wirkung"' + (hdWertWirkungAn() ? ' checked' : '') + '> ' + hdWertEsc(t('Modell beeinflusst die Fahrleistung')) + '</label></div>';
    h += '<details class="hdw-quellen"><summary>' + hdWertEsc(t('Quellen und Schätzwerte')) + '</summary><ul>'
      + HD_MODELL_QUELLEN.map((q) => '<li>' + hdWertEsc(t(q)) + '</li>').join('') + '</ul><p>' + hdWertEsc(t('„~“ = geschätzt: kein verlässlicher veröffentlichter Wert. Handling und Bremsen sind Bewertungen aus Bauart, Gewicht und Aerodynamik.')) + '</p></details>';
    return h;
  }
  // ---- driver style ---------------------------------------------------------------------------------------------------
  function hdWertStilListe() {
    try { return garage.filter((c) => c && c.device && c.role === 'ghost'); } catch (e) { return []; }
  }
  function hdWertStil(car) {
    if (!car) { car = hdWertStilListe()[0]; if (!car) return; }
    hdWertBoxBauen();
    hdWertZustand = { art: 'stil', car, cmp: '' };
    hdWertMalen();
  }
  function hdWertStilHtml() {
    const z = hdWertZustand, car = z.car, w = hdStilWerte(car);
    const andere = hdWertStilListe().filter((c) => c !== car);
    const cmpCar = z.cmp ? andere.find((c) => hdStilId(c) === z.cmp) : null;
    const cw = cmpCar ? hdStilWerte(cmpCar) : null;
    const farbe = carColor(car).hex;
    const nr = typeof hdNummer === 'function' ? hdNummer(car) : '';
    const stufe = car.ghostStufe === undefined || car.ghostStufe === null ? 1 : car.ghostStufe;
    const liste = hdWertStilListe();
    let h = hdWertKopf(t('Fahrstil'));
    h += '<div class="hdw-titel hdw-fahrer" style="--f:' + hdWertEsc(farbe) + '">'
      + (liste.length > 1 && liste.includes(car) ? '<button type="button" class="k-arrow hdw-pf" data-hdw="fahrer" data-d="-1" aria-label="' + hdWertEsc(t('Vorherige')) + '">' + hdWertPfeil(-1) + '</button>' : '')
      + '<span class="hdw-bild">' + (typeof hdAvatarFuerAuto === 'function' ? hdAvatarFuerAuto(car, 96) : '') + '</span>'
      + '<div class="hdw-name"><small>' + hdWertEsc(hdStilTyp(w)) + '</small><b>' + (nr ? '<em>#' + hdWertEsc(nr) + '</em> ' : '') + hdWertEsc(car.alias || car.tag || garageLabel(car)) + '</b>'
      + '<span>' + (typeof hdLandFlaggeFuer === 'function' ? hdLandFlaggeFuer(car, 14) + ' ' + hdWertEsc(hdLandName(hdLand(car))) + ' · ' : '') + hdWertEsc(t(carModellName(car.modellId))) + '</span></div>'
      + '<div class="hdw-gesamt"><b data-hdw-gesamt>' + hdStilGesamt(w) + '</b><small>' + hdWertEsc(t('Gesamt')) + '</small></div>'
      + (liste.length > 1 && liste.includes(car) ? '<button type="button" class="k-arrow hdw-pf" data-hdw="fahrer" data-d="1" aria-label="' + hdWertEsc(t('Nächste')) + '">' + hdWertPfeil(1) + '</button>' : '')
      + '</div>';
    h += '<div class="hdw-balken hdw-stil">' + HD_STIL_TRAITS.map((tr) => {
      const v = w[tr.k], c = cw ? cw[tr.k] : null;
      const diff = c == null ? '' : (v === c ? '<i class="hdw-d">=</i>' : '<i class="hdw-d ' + (v > c ? 'plus' : 'minus') + '">' + (v > c ? '+' : '−') + Math.abs(v - c) + '</i>');
      return '<div class="hdw-zeile"><span class="hdw-l">' + hdWertEsc(t(tr.de)) + '</span><b class="hdw-n" data-hdw-n="' + tr.k + '">' + v + '</b>' + diff
        + '<span class="hdw-bar"><span class="hdw-fill" data-hdw-fill="' + tr.k + '" style="width:' + v + '%;--hdw-f:' + hdWertEsc(farbe) + '"></span>'
        + (c == null ? '' : '<span class="hdw-cmp" style="width:' + c + '%"></span>')
        + '<input type="range" min="0" max="100" step="1" value="' + v + '" data-hdw-trait="' + tr.k + '" aria-label="' + hdWertEsc(t(tr.de)) + '"></span></div>';
    }).join('') + '</div>';
    if (cmpCar) h += '<p class="hdw-leg"><span class="hdw-leg-a" style="background:' + hdWertEsc(farbe) + '"></span>' + hdWertEsc(car.alias || garageLabel(car)) + ' <span class="hdw-leg-b"></span>' + hdWertEsc(cmpCar.alias || garageLabel(cmpCar)) + ' (' + hdStilGesamt(cw) + ')</p>';
    h += '<div class="hdw-cmpwahl"><span class="hds-l">' + hdWertEsc(t('Stil')) + '</span><span class="hds-chips">'
      + HD_STIL_PRESETS.map((p) => '<button type="button" data-hdw="preset" data-id="' + p.id + '">' + hdWertEsc(t(p.de)) + '</button>').join('')
      + '<button type="button" data-hdw="zufall">&#x1F3B2; ' + hdWertEsc(t('Zufällig')) + '</button>'
      + '<button type="button" data-hdw="standard">&#8634; ' + hdWertEsc(t('Standard')) + '</button></span></div>';
    if (typeof GHOST_TEMPO_STUFEN !== 'undefined') {
      h += '<div class="hdw-cmpwahl"><span class="hds-l">' + hdWertEsc(t('Schwierigkeit')) + '</span><span class="hds-chips">'
        + GHOST_TEMPO_STUFEN.map((st, k) => '<button type="button" data-hdw="stufe" data-k="' + k + '"' + (k === stufe ? ' class="an"' : '') + '>' + hdWertEsc(st.max ? 'MAX' : t(st.label)) + '</button>').join('')
        + '</span></div>';
    }
    if (andere.length) {
      h += '<div class="hdw-cmpwahl"><span class="hds-l">' + hdWertEsc(t('Vergleichen mit')) + '</span><span class="hds-chips">'
        + '<button type="button" data-hdw="cmpf" data-id=""' + (!z.cmp ? ' class="an"' : '') + '>' + hdWertEsc(t('Keins')) + '</button>'
        + andere.map((c) => '<button type="button" data-hdw="cmpf" data-id="' + hdWertEsc(hdStilId(c)) + '"' + (z.cmp === hdStilId(c) ? ' class="an"' : '') + '>' + hdWertEsc(c.alias || garageLabel(c)) + '</button>').join('')
        + '</span></div>';
    }
    h += '<p class="hdg-hinweis">' + hdWertEsc(car.role === 'ghost' ? t('Gilt, sobald dieses Auto als NPC fährt. Regler ziehen oder einen Stil wählen – gespeichert wird sofort.')
      : t('Dieses Auto fährt gerade nicht als NPC – der Stil wird gespeichert und gilt, sobald es die Rolle NPC hat.')) + '</p>';
    h += '<details class="hdw-quellen"><summary>' + hdWertEsc(t('Was die Werte bewirken')) + '</summary><ul>'
      + '<li>' + hdWertEsc(t('Überholen: wie oft ein Überholmanöver angesetzt wird.')) + '</li>'
      + '<li>' + hdWertEsc(t('Verteidigen: wie oft die angegriffene Seite gedeckt wird.')) + '</li>'
      + '<li>' + hdWertEsc(t('Konstanz: wie selten Verbremser und Fehler passieren.')) + '</li>'
      + '<li>' + hdWertEsc(t('Kurvenmut: wie wenig Tempo in Kurven abgegeben wird.')) + '</li>'
      + '<li>' + hdWertEsc(t('Reifen- und Spritmanagement: längere Stints, später an die Box.')) + '</li>'
      + '<li>' + hdWertEsc(t('Regenfahren: wie viel Tempo und wie viele Fehler Regen kostet.')) + '</li></ul></details>';
    return h;
  }
  function hdWertMalen() {
    if (!hdWertBox || !hdWertZustand) return;
    hdWertBox.innerHTML = '<div class="hdg-karte hdw-karte">' + (hdWertZustand.art === 'auto' ? hdWertAutoHtml() : hdWertStilHtml()) + '</div>';
    hdWertBox.hidden = false;
  }
  function hdWertKlick(e) {
    if (e.target === hdWertBox) { hdWertZu(); return; }
    const b = e.target.closest('[data-hdw]');
    if (!b || !hdWertZustand) return;
    const z = hdWertZustand, was = b.dataset.hdw;
    if (was === 'zu') { hdWertZu(); return; }
    if (was === 'wirkung') { try { localStorage.setItem(HD_WERT_AN_STORE, b.checked ? 'an' : 'aus'); } catch (er) { /* private */ } hdWertMotorenAbgleichen(); hdWertMalen(); return; }
    if (was === 'modell') {
      const l = hdWertModelle(), i = l.findIndex((m) => m.id === z.id);
      z.id = l[(i + Number(b.dataset.d) + l.length) % l.length].id;
      if (z.cmp === z.id) z.cmp = '';
    } else if (was === 'cmp') { z.cmp = b.dataset.id || ''; }
    else if (was === 'nehmen' && z.car) {
      z.car.modellId = z.id;
      try { carRemember(z.car); renderGarage(); renderRaceGrid(); } catch (er) { /* not ready */ }
      hdWertMotorenAbgleichen();
    } else if (was === 'fahrer') {
      const l = hdWertStilListe(), i = l.indexOf(z.car);
      z.car = l[(i + Number(b.dataset.d) + l.length) % l.length]; z.cmp = '';
    } else if (was === 'cmpf') { z.cmp = b.dataset.id || ''; }
    else if (was === 'preset') {
      const p = HD_STIL_PRESETS.find((x) => x.id === b.dataset.id);
      if (p) { Object.assign(hdStilWerte(z.car), p.w); hdStilSpeichern(); }
    } else if (was === 'zufall') {
      Object.assign(hdStilWerte(z.car), hdStilErzeugen(hdStilId(z.car) + ':' + Date.now() + ':' + Math.random())); hdStilSpeichern();
    } else if (was === 'standard') {
      hdStilZuruecksetzen(z.car);
    } else if (was === 'stufe') {
      z.car.ghostStufe = +b.dataset.k;
      try { if (typeof carRolleMerken === 'function') carRolleMerken(z.car); renderGarage(); } catch (er) { /* not ready */ }
    } else return;
    hdWertMalen();
    try { if (typeof hdSetupMalen === 'function') hdSetupMalen(); } catch (er) { /* not open */ }
  }
  // Dragging a trait: update its number, bar and the overall without redrawing (the drag would end).
  function hdWertEingabe(e) {
    const r = e.target.closest('[data-hdw-trait]');
    if (!r || !hdWertZustand || hdWertZustand.art !== 'stil') return;
    const k = r.dataset.hdwTrait;
    hdStilSetzen(hdWertZustand.car, k, r.value);
    const w = hdStilWerte(hdWertZustand.car);
    const n = hdWertBox.querySelector('[data-hdw-n="' + k + '"]'); if (n) n.textContent = w[k];
    const f = hdWertBox.querySelector('[data-hdw-fill="' + k + '"]'); if (f) f.style.width = w[k] + '%';
    const g = hdWertBox.querySelector('[data-hdw-gesamt]'); if (g) g.textContent = hdStilGesamt(w);
    const typ = hdWertBox.querySelector('.hdw-fahrer .hdw-name small'); if (typ) typ.textContent = hdStilTyp(w);
  }
  // Buttons elsewhere (pre-race setup) open the cards by device id.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-hdw-auto],[data-hdw-stil]');
    if (!a) return;
    const id = a.dataset.hdwAuto || a.dataset.hdwStil;
    let car = null;
    try { car = garage.find((c) => c && c.device && String(c.device.id) === id) || null; } catch (er) { car = null; }
    e.stopPropagation();
    if (a.dataset.hdwStil !== undefined) { if (car) hdWertStil(car); } else hdWertAuto(car);
  }, true);
  window.HYBRIDDASH_WERTE = Object.freeze({ specs: HD_MODELL_SPECS, rating: hdWertRating, faktoren: hdWertFaktoren,
    stil: hdStilWerte, charakter: hdStilCharakter, auto: hdWertAuto, fahrer: hdWertStil,
    // for tests
    _garage: () => garage, _ghostCharakter: (c) => ghostCharakter(c), _motor: () => physEngine.modell,
    _abgleichen: hdWertMotorenAbgleichen, _vorStart: () => hdVorStartGesperrt(), _menue: () => hdMenueGesperrt(), _offtrackSitzung: () => hdOfftrackSitzung(), _modellTempo: (c) => hdModellTempo(c) });
