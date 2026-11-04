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
  // WHAT COUNTS:
  //   off track  byte 12 reads 0x00 (TILE_OFFTRACK) for the whole window, or an NPC was
  //              parked by the ghost logic because it left the track.
  //   stagnant   the tile counter has not moved for the whole window. The window starts no
  //              earlier than the green light (start or restart), so a grid of standing cars
  //              does not trigger it.
  //
  // Only on the track (trackMode 'on'): in printout mode byte 12 is almost always 0x00.
  const hdSc = { offSeit: new Map(), gruenSeit: 0, letzterStatus: '', sperreBis: 0, letzterFlag: 'green' };

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

  function hdAutoScGrund(car, now) {
    const fenster = hdAutoScFenster();
    const key = car;
    // Off track: byte 12 = 0x00 without a break.
    if (car.tileCode === TILE_OFFTRACK || car.parked === 'Bahn verlassen') {
      if (!hdSc.offSeit.has(key)) hdSc.offSeit.set(key, now);
      if (now - hdSc.offSeit.get(key) >= fenster) return 'off';
    } else {
      hdSc.offSeit.delete(key);
    }
    // Stagnant: no tile change since max(last tile change, green).
    const seit = Math.max(car.tileAt || 0, hdSc.gruenSeit);
    if (seit && now - seit >= fenster) return 'stuck';
    return null;
  }

  function hdAutoScTick() {
    let now;
    try { now = rennZeitJetzt(); } catch (e) { return; }
    // Watch the flag so the stagnation window restarts at every green.
    if (flagState === 'green' && hdSc.letzterFlag !== 'green') {
      hdSc.gruenSeit = now; hdSc.offSeit.clear();
      hdSc.sperreBis = now + HD_AUTO_SC_COOLDOWN_MS;
    }
    hdSc.letzterFlag = flagState;
    if (raceState !== 'racing') { hdSc.gruenSeit = 0; hdSc.offSeit.clear(); return; }
    if (!hdSc.gruenSeit) hdSc.gruenSeit = now;
    if (!hdAutoScAn() || flagState !== 'green' || trackMode !== 'on' || raceFormationLap) return;
    if (rennPauseAktiv() || gelbDeaktiviert() || now < hdSc.sperreBis) return;
    for (const car of garage) {
      if (!hdRenntAuto(car)) { hdSc.offSeit.delete(car); continue; }
      const grund = hdAutoScGrund(car, now);
      if (!grund) continue;
      hdAutoScAusloesen(car, grund, now);
      return;
    }
  }

  function hdAutoScAusloesen(car, grund, now) {
    hdSc.sperreBis = now + HD_AUTO_SC_COOLDOWN_MS;
    hdSc.offSeit.clear();
    const name = garageLabel(car);
    const sek = (hdAutoScFenster() / 1000).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
    const warum = grund === 'off'
      ? t('HD: neben der Strecke').replace('{s}', sek)
      : t('HD: steht').replace('{s}', sek);
    hdSc.letzterStatus = name + ' – ' + warum;
    log('HybridDash: automatic safety car – ' + name + ' (' + grund + ', ' + sek + ' s).', 'err');
    setFlag('yellow');
    if (flagState !== 'yellow') return;           // yellow disabled or refused
    showHudToast(t('SAFETY CAR') + ' · ' + name);
    hdSprechen(hdSatz('sc', { name, grund }), 30);
    hdEinstellungenMalen();
  }

  setInterval(hdAutoScTick, 200);

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
    if (hd.npcAnsage) hdSprechen(hdSatz('fahrer', { name: car.alias, auto: hdAutoBeschreibung(car) }), 10);
    if (typeof renderGarage === 'function') renderGarage();
    if (typeof renderRaceGrid === 'function') renderRaceGrid();
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
      return 'Safety Car! ' + x.name + (x.grund === 'off' ? ' ist von der Strecke abgekommen.' : ' steht auf der Strecke.');
    }
    if (lang === 'es') {
      if (art === 'fahrer') return 'Nuevo piloto: ' + x.name + ', en el ' + x.auto + '.';
      return '¡Coche de seguridad! ' + x.name + (x.grund === 'off' ? ' se ha salido de la pista.' : ' está detenido en la pista.');
    }
    if (art === 'fahrer') return 'New driver: ' + x.name + ', driving the ' + x.auto + '.';
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
    const n = $('hd-npc-namen'); if (n) n.checked = !!hd.npcNamen;
    const v = $('hd-npc-ansage'); if (v) v.checked = !!hd.npcAnsage;
    const st = $('hd-auto-sc-status'); if (st) st.textContent = hdSc.letzterStatus ? t('Zuletzt') + ': ' + hdSc.letzterStatus : '';
  }
  (function hdEinstellungenAnbinden() {
    const an = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', () => { fn(el); hdSpeichern(); hdEinstellungenMalen(); }); };
    an('hd-auto-sc', el => { hd.autoSc = el.checked; });
    an('hd-npc-namen', el => { hd.npcNamen = el.checked; });
    an('hd-npc-ansage', el => { hd.npcAnsage = el.checked; });
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
      Object.assign(hd, JSON.parse(merk.hd)); Object.assign(hdSc, merk.sc); hdSc.offSeit = new Map();
      carStoreSchreiben(JSON.parse(merk.store));
    };
    try {
      const now = rennZeitJetzt();
      garage.length = 0; hd.autoSc = true; hd.autoScMs = 3000;
      raceState = 'racing'; flagState = 'green'; trackMode = 'on'; raceFormationLap = false; pitState = 'off';
      hdSc.letzterFlag = 'green'; hdSc.sperreBis = 0; hdSc.offSeit = new Map();

      // A: a car that keeps moving does not trigger anything.
      const a = fake('hd-a', 'player', { tileAt: now - 500 });
      garage.push(a); hdSc.gruenSeit = now - 10000;
      hdAutoScTick();
      prüfen('moving car: no safety car', flagState === 'green', 'flag ' + flagState);

      // B: stagnant 2.5 s -> nothing yet; 3.5 s -> yellow.
      a.tileAt = now - 2500; hdAutoScTick();
      const vorher = flagState;
      a.tileAt = now - 3500; hdAutoScTick();
      prüfen('stagnant > 3 s: safety car', vorher === 'green' && flagState === 'yellow',
             'at 2.5 s ' + vorher + ', at 3.5 s ' + flagState);
      gelbBeenden(); hdSc.letzterFlag = 'green'; hdSc.sperreBis = 0;

      // C: the stagnation window never starts before green (grid start).
      a.tileAt = 0; hdSc.gruenSeit = now - 1000; hdAutoScTick();
      prüfen('standing grid right after green: no safety car', flagState === 'green', 'flag ' + flagState);

      // D: off track for 3 s (byte 12 = 0x00) -> yellow, even though tiles were counting.
      a.tileAt = now; a.tileCode = TILE_OFFTRACK; hdSc.gruenSeit = now - 10000;
      hdSc.offSeit.set(a, now - 3100); hdAutoScTick();
      prüfen('off track > 3 s: safety car', flagState === 'yellow', 'flag ' + flagState);
      gelbBeenden(); hdSc.letzterFlag = 'green'; hdSc.sperreBis = 0; a.tileCode = 0x02;

      // E: switched off -> nothing.
      hd.autoSc = false; a.tileAt = now - 5000; hdAutoScTick();
      prüfen('setting off: no safety car', flagState === 'green', 'flag ' + flagState);
      hd.autoSc = true;

      // F: player in the pit lane is ignored; safety car itself is ignored.
      pitState = 'servicing'; hdAutoScTick();
      const imPit = flagState;
      pitState = 'off'; a.role = 'safetycar'; hdAutoScTick();
      prüfen('pit lane and the safety car itself are ignored', imPit === 'green' && flagState === 'green',
             'pit ' + imPit + ', sc ' + flagState);
      a.role = 'player';

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
  });
