  // =========================================================================
  // HybridDash 2.1: RACE CONTROL (the steward's screen)
  // =========================================================================
  //
  // REQUESTED: "make this screen a Race Control screen, where I can act like the race steward
  // and control the race": yellow and red flags, virtual safety car and safety car, weather,
  // standings with position and lap count, and DNF for a car that cannot continue - the race
  // goes on without it, the results still list it as DNF.
  //
  // It lives on the cockpit's Race screen (#race-ovscreen): a steward bar above the standings,
  // a DNF button on every standings row, and an incident log under the track map.
  //
  // FLAGS - all four use the app's own machinery, they only decide WHICH parts of it run:
  //   YELLOW   flagState 'yellow' WITHOUT the safety car: no overtaking, a caution pace
  //            (HD_RL_GELB_TEMPO x the yellow speed), gaps kept (hdGelbFolge).
  //   VSC      flagState 'yellow' WITHOUT the safety car, at the full yellow (SC) pace.
  //   SC       flagState 'yellow' WITH the safety car (setFlag -> safetyCarRaus), as before.
  //   RED      the race pause (15-pause.js): every car stops, the race clock freezes.
  //   GREEN    from yellow/VSC/SC: the restart lights (yellowRestart); from red: the pause's
  //            restart lights.
  //   FINAL    the chequered flag: the race goes to 'finishing', every car completes its lap.
  //
  // DNF - one flag per car (hdRl.dnf, keyed by device id):
  //   * the car is stopped where commands leave the app (writeToCar / funkSchreiben), so it
  //     stays stopped whoever drives it (NPC logic, your pad, the autopilot);
  //   * an NPC's driver is stopped too (stopGhost), so it stops planning;
  //   * standings and results sort it to the bottom and show DNF; it no longer counts for
  //     "everyone has finished", the safety car detection, or the yellow-flag gap keeping.
  // BLACK FLAG - the same stop as DNF (hdRl.dnf with art 'dsq'), shown as DSQ, sorted below DNF.
  // TIME PENALTIES - hdRl.strafe (device id -> list of ms), added to the race time in the
  //   standings and the results, so a penalised car can lose places at the flag.
  // Each standings row has a STEWARD button: +5 s, +10 s, clear penalties, black flag, DNF,
  //   reinstate.

  const HD_RL_GELB_TEMPO = 1.35;     // local yellow: 35 % above the safety-car pace, still no overtaking
  const hdRl = { modus: 'sc', dnf: new Map(), strafe: new Map(), log: [], letzterRennstatus: 'idle' };

  // ---- hooks used by the original code ------------------------------------------------------
  function hdRlOhneSafetyCar() { return flagState === 'yellow' && (hdRl.modus === 'gelb' || hdRl.modus === 'vsc'); }
  // gelbZielFuer() (90-ghosts.js): the target pace under the flag. null = unchanged.
  function hdRlGelbZiel(car) {
    if (flagState === 'green' || hdRl.modus !== 'gelb' || !car || car.role === 'safetycar') return null;
    return Math.min(0.85, gelbGrenze() * HD_RL_GELB_TEMPO);
  }
  function hdRlBanner(text) {
    if (flagState !== 'yellow' || !text) return text;
    const scFaehrt = typeof safetyCarFaehrt === 'function' && safetyCarFaehrt();
    if (hdRl.modus === 'sc' && !scFaehrt) return text;   // plain yellow: the original text
    const name = t({ gelb: 'GELBE FLAGGE', vsc: 'VIRTUELLES SAFETY CAR', sc: 'SAFETY CAR' }[hdRl.modus] || '') || text;
    const teile = text.split('·');
    return teile.length > 1 ? name + ' · ' + teile.slice(1).join('·').trim() : name;
  }
  function hdDnfId(car) { return car && car.device ? String(car.device.id) : null; }
  function hdDnfAuto(car) { const id = hdDnfId(car); return !!(id && hdRl.dnf.has(id)); }
  function hdDnfZiel(ziel) {
    if (!ziel || !hdRl.dnf.size) return false;
    const car = garage.find((c) => c.rx === ziel);
    return !!(car && hdDnfAuto(car));
  }
  function hdDnfPaket() { return buildCommandPacket(0, 0, trackModeBit()); }
  function hdDnfVonId(id) { return hdRl.dnf.has(String(id)); }
  function hdDsqVonId(id) { const x = hdRl.dnf.get(String(id)); return !!(x && x.art === 'dsq'); }
  function hdDsqAuto(car) { const id = hdDnfId(car); return !!(id && hdDsqVonId(id)); }
  function hdStrafeMs(id) { const l = hdRl.strafe.get(String(id)); return l ? l.reduce((a, b) => a + b, 0) : 0; }

  // ---- incident log -------------------------------------------------------------------------
  function hdRlZeit() {
    let ms = 0;
    try { ms = raceState === 'idle' ? 0 : Math.max(0, rennZeitJetzt() - raceStartedAt); } catch (e) { ms = 0; }
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function hdRlLog(text, art) {
    hdRl.log.unshift({ zeit: hdRlZeit(), text, art: art || '' });
    if (hdRl.log.length > 60) hdRl.log.length = 60;
    log('Race control: ' + text, 'info');
    hdRlMalen();
  }
  function hdRlSag(text) { if (typeof hdSprechen === 'function') hdSprechen(text, 28); }

  // ---- flags ----------------------------------------------------------------------------------
  function hdRlRennt() { return raceState === 'racing' || raceState === 'finishing'; }
  function hdRlFlagge(modus) {
    if (!hdRlRennt()) { showHudToast('No race running'); return; }
    if (typeof rennPauseAktiv === 'function' && rennPauseAktiv()) { showHudToast('Red flag is out – resume first'); return; }
    if (modus === 'sc' && !(typeof safetyCar === 'function' && safetyCar())) {
      showHudToast('No safety car in the garage – assign one, or use VSC');
      return;
    }
    if (typeof hdScFrageZu === 'function') hdScFrageZu();
    const vorher = flagState;
    hdRl.modus = modus;
    if (flagState !== 'yellow') setFlag('yellow');
    else if (modus === 'sc' && typeof safetyCarFaehrt === 'function' && !safetyCarFaehrt()) safetyCarRaus();
    if (flagState !== 'yellow') { hdRl.modus = 'sc'; return; }     // yellow disabled in race settings
    // Pace for the human cars (the NPCs ask hdRlGelbZiel / gelbZielFuer each tick).
    limitYellow = modus === 'gelb' ? Math.max(gelbGrenze(), Math.min(0.85, gelbGrenze() * HD_RL_GELB_TEMPO))
      : (modus === 'sc' && typeof safetyCar === 'function' && safetyCar() && scAufschliessenAn()) ? Math.max(SC_AUFSCHLUSS, gelbGrenze()) : gelbGrenze();
    applySpeedLimit();
    const name = { gelb: 'YELLOW FLAG', vsc: 'VIRTUAL SAFETY CAR', sc: 'SAFETY CAR' }[modus];
    showHudToast(name);
    hdRlLog(name + (vorher === 'yellow' ? ' (changed)' : ''), modus);
    hdRlSag({ gelb: 'Yellow flag. No overtaking.', vsc: 'Virtual safety car deployed.', sc: 'Safety car deployed.' }[modus]);
    if (typeof updateFlagUi === 'function') updateFlagUi();
  }
  function hdRlGruen() {
    if (typeof rennPauseAktiv === 'function' && rennPauseAktiv()) {
      if (rennPause.phase === 'pause') { rennPauseUmschalten(); hdRlLog('Race resumed – restart lights', 'gruen'); hdRlSag('The race will resume.'); }
      return;
    }
    if (flagState === 'yellow') {
      yellowRestart();
      hdRlLog('Green flag – restart lights', 'gruen');
      hdRlSag('Green flag. Racing resumes.');
    }
  }
  function hdRlRot() {
    if (!hdRlRennt()) { showHudToast('No race running'); return; }
    if (typeof rennPauseAktiv === 'function' && rennPauseAktiv()) return;
    if (typeof hdScFrageZu === 'function') hdScFrageZu();
    rennPauseUmschalten();
    if (!(typeof rennPauseAktiv === 'function' && rennPauseAktiv())) return;
    showHudToast('RED FLAG');
    hdRlLog('RED FLAG – race stopped', 'rot');
    hdRlSag('Red flag. Red flag. The race is stopped.');
  }
  function hdRlZiel() {
    if (raceState !== 'racing') { showHudToast(raceState === 'finishing' ? 'Final lap already' : 'No race running'); return; }
    raceState = 'finishing';
    if ($('race-status')) $('race-status').textContent = 'Final lap – called by race control';
    showHudToast('Letzte Runde');
    if (typeof playLetzteRundeGlocke === 'function') playLetzteRundeGlocke();
    hdRlLog('Chequered flag – final lap', 'ziel');
    hdRlSag('Final lap. The chequered flag is out.');
  }
  function hdRlWetter(modus) {
    if (typeof wxModusSetzen !== 'function') return;
    wxModusSetzen(modus);
    const name = { dry: 'Dry', rain: 'Rain', wechsel: 'Changeable' }[modus];
    hdRlLog('Weather: ' + name, 'wetter');
    hdRlSag({ dry: 'The track is drying. Dry conditions.', rain: 'Rain is falling.', wechsel: 'Changeable weather.' }[modus]);
  }

  // ---- DNF ------------------------------------------------------------------------------------
  function hdRlName(id) { const car = garage.find((c) => hdDnfId(c) === id); return { car, name: car ? garageLabel(car) : id }; }
  function hdRlNeuMalen() {
    hdRlMalen();
    try { if (typeof ovScreenRender === 'function') ovScreenRender(); } catch (e) { /* not ready */ }
    try { if (typeof renderRaceResults === 'function' && raceState === 'finished') renderRaceResults(); } catch (e) { /* not ready */ }
  }
  function hdRlWieder(id) {
    id = String(id);
    if (!hdRl.dnf.has(id)) return;
    const { car, name } = hdRlName(id);
    if (!window.confirm('Reinstate ' + name + '? The car can drive again.')) return;
    hdRl.dnf.delete(id);
    if (car && car.ghost && car.role === 'ghost' && hdRlRennt() && typeof startGhost === 'function') startGhost(car);
    hdRlLog(name + ' reinstated', 'dnf');
    hdRlNeuMalen();
  }
  // Take a car out: art 'dnf' (did not finish) or 'dsq' (black flag, disqualified).
  function hdRlAus(id, art) {
    id = String(id); art = art === 'dsq' ? 'dsq' : 'dnf';
    const { car, name } = hdRlName(id);
    const alt = hdRl.dnf.get(id);
    if (alt && alt.art === art) return;
    const frage = art === 'dsq'
      ? 'BLACK FLAG: disqualify ' + name + '?\n\nThe car is stopped and the race continues without it. It stays in the results as DSQ, below every finisher and DNF. Remove it from the track yourself.'
      : 'DNF: take ' + name + ' out of the race?\n\nThe car is stopped and the race continues without it. It stays in the results as DNF. Remove it from the track yourself.';
    if (!window.confirm(frage)) return;
    let runden = alt ? alt.runden : 0;
    if (!alt) { try { const x = raceAllCars().find((c) => c.id === id); runden = x ? x.laps.length : 0; } catch (e) { runden = 0; } }
    hdRl.dnf.set(id, { runden, zeit: alt ? alt.zeit : hdRlZeit(), art });
    if (car) {
      if (car.ghost && typeof stopGhost === 'function') stopGhost(car);
      try { if (car.rx) writeToCar(car, 0, 0, trackModeBit()); } catch (e) { /* not connected */ }
    }
    if (art === 'dsq') {
      showHudToast('BLACK FLAG · ' + name + ' · DSQ');
      hdRlLog('Black flag: ' + name + ' disqualified', 'dsq');
      hdRlSag('Black flag. ' + name + ' is disqualified.');
    } else {
      showHudToast('DNF · ' + name);
      hdRlLog(name + ' – DNF after ' + runden + ' lap' + (runden === 1 ? '' : 's'), 'dnf');
      hdRlSag(name + ' is out of the race.');
    }
    hdRlNeuMalen();
  }
  // Toggle (kept for older calls): DNF, or reinstate a car that is out.
  function hdRlDnf(id) { id = String(id); if (hdRl.dnf.has(id)) hdRlWieder(id); else hdRlAus(id, 'dnf'); }
  // Time penalty in seconds; 0 clears them all.
  function hdRlStrafe(id, s) {
    id = String(id);
    const { name } = hdRlName(id);
    if (!s) {
      if (!hdRl.strafe.has(id)) return;
      hdRl.strafe.delete(id);
      hdRlLog(name + ': penalties cleared', 'strafe');
      showHudToast(name + ' · penalties cleared');
    } else {
      const l = hdRl.strafe.get(id) || [];
      l.push(s * 1000); hdRl.strafe.set(id, l);
      const summe = Math.round(hdStrafeMs(id) / 1000);
      hdRlLog(s + ' second penalty: ' + name + (summe !== s ? ' (total +' + summe + ' s)' : ''), 'strafe');
      showHudToast('+' + s + ' s · ' + name);
      hdRlSag(s + ' second time penalty for ' + name + '.');
    }
    hdRlNeuMalen();
  }
  // Standings row cell (ovScreenRender, 70-race.js).
  function hdDnfZelle(z) {
    if (!z || !z.id || z.id === 'undefined') return '<span class="ov-dnf-zelle"></span>';
    const id = String(z.id).replace(/"/g, '');
    const x = hdRl.dnf.get(id), s = Math.round(hdStrafeMs(id) / 1000);
    const marke = x ? (x.art === 'dsq' ? 'DSQ' : 'DNF') : '⚑';
    return '<span class="ov-dnf-zelle">'
      + (s ? '<span class="ov-strafe" title="Time penalties">+' + s + 's</span>' : '')
      + '<button type="button" class="ov-dnf-knopf' + (x ? ' aus' + (x.art === 'dsq' ? ' dsq' : '') : '') + '" data-hd-steward="' + id
      + '" title="Steward: time penalty, black flag, DNF" aria-haspopup="menu">' + marke + '</button></span>';
  }
  // The steward menu for one car.
  function hdRlMenueZu() { const m = $('hd-rl-menue'); if (m) m.remove(); }
  function hdRlMenue(knopf) {
    const id = knopf.getAttribute('data-hd-steward');
    const offen = $('hd-rl-menue');
    if (offen && offen.dataset.id === id) { hdRlMenueZu(); return; }
    hdRlMenueZu();
    const { name } = hdRlName(id);
    const x = hdRl.dnf.get(id), s = Math.round(hdStrafeMs(id) / 1000);
    const m = document.createElement('div');
    m.id = 'hd-rl-menue'; m.className = 'hd-rl-menue'; m.dataset.id = id; m.setAttribute('role', 'menu'); m.setAttribute('data-i18n-skip', '');
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    m.innerHTML = '<b>' + esc(name) + (s ? ' · +' + s + ' s' : '') + (x ? ' · ' + (x.art === 'dsq' ? 'DSQ' : 'DNF') : '') + '</b>'
      + '<button type="button" role="menuitem" data-hd-st="5">+5 s penalty</button>'
      + '<button type="button" role="menuitem" data-hd-st="10">+10 s penalty</button>'
      + (s ? '<button type="button" role="menuitem" data-hd-st="0">Clear penalties</button>' : '')
      + (x && x.art === 'dsq' ? '' : '<button type="button" role="menuitem" data-hd-st="dsq" class="st-schwarz">⚑ Black flag (DSQ)</button>')
      + (x && x.art !== 'dsq' ? '' : '<button type="button" role="menuitem" data-hd-st="dnf" class="st-dnf">DNF – retire</button>')
      + (x ? '<button type="button" role="menuitem" data-hd-st="wieder">Reinstate</button>' : '');
    (document.fullscreenElement || document.body).appendChild(m);
    const r = knopf.getBoundingClientRect(), mr = m.getBoundingClientRect();
    let left = r.right - mr.width, top = r.bottom + 4;
    if (top + mr.height > innerHeight - 6) top = Math.max(6, r.top - mr.height - 4);
    m.style.left = Math.max(6, Math.min(innerWidth - mr.width - 6, left)) + 'px';
    m.style.top = top + 'px';
    const erster = m.querySelector('button'); if (erster) erster.focus();
  }
  document.addEventListener('click', (e) => {
    const ziel = e.target && e.target.closest ? e.target : null;
    if (!ziel) return;
    const k = ziel.closest('[data-hd-steward]');
    if (k) { e.preventDefault(); e.stopPropagation(); hdRlMenue(k); return; }
    const a = ziel.closest('#hd-rl-menue [data-hd-st]');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      const id = $('hd-rl-menue').dataset.id, w = a.getAttribute('data-hd-st');
      hdRlMenueZu();
      if (w === 'dsq' || w === 'dnf') hdRlAus(id, w);
      else if (w === 'wieder') hdRlWieder(id);
      else hdRlStrafe(id, Number(w));
      return;
    }
    if (!ziel.closest('#hd-rl-menue')) hdRlMenueZu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hdRlMenueZu(); });

  // ---- the steward bar and the log ------------------------------------------------------------
  function hdRlBauen() {
    const schirm = $('race-ovscreen');
    if (!schirm || $('hd-rl-leiste')) return;
    const leiste = document.createElement('div');
    leiste.id = 'hd-rl-leiste'; leiste.className = 'hd-rl-leiste'; leiste.setAttribute('data-i18n-skip', '');
    leiste.innerHTML = `
      <span class="hd-rl-titel">RACE CONTROL</span>
      <div class="hd-rl-gruppe" role="group" aria-label="Flags">
        <button type="button" data-hd-rl="gruen" class="hd-rl-k hd-rl-gruen" title="Green: restart lights after a caution or red flag">GREEN</button>
        <button type="button" data-hd-rl="gelb" class="hd-rl-k hd-rl-gelb" title="Yellow: caution pace, no overtaking, no safety car">YELLOW</button>
        <button type="button" data-hd-rl="vsc" class="hd-rl-k hd-rl-vsc" title="Virtual safety car: whole field at safety-car pace, gaps kept">VSC</button>
        <button type="button" data-hd-rl="sc" class="hd-rl-k hd-rl-sc" title="Safety car: the safety car goes out, the field queues behind it">SC</button>
        <button type="button" data-hd-rl="rot" class="hd-rl-k hd-rl-rot" title="Red flag: every car stops, the race clock freezes">RED</button>
        <button type="button" data-hd-rl="ziel" class="hd-rl-k hd-rl-ziel" title="Chequered flag: final lap for everyone">🏁 FINAL LAP</button>
      </div>
      <div class="hd-rl-gruppe" role="group" aria-label="Weather">
        <button type="button" data-hd-rl="dry" class="hd-rl-k hd-rl-wx" title="Dry">☀ DRY</button>
        <button type="button" data-hd-rl="rain" class="hd-rl-k hd-rl-wx" title="Rain">🌧 RAIN</button>
        <button type="button" data-hd-rl="wechsel" class="hd-rl-k hd-rl-wx" title="Changeable">⛅ MIXED</button>
      </div>
      <span class="hd-rl-lage" id="hd-rl-lage">–</span>`;
    const kopf = schirm.querySelector('.schirm-kopf');
    if (kopf && kopf.nextSibling) schirm.insertBefore(leiste, kopf.nextSibling); else schirm.appendChild(leiste);
    const logEl = document.createElement('div');
    logEl.id = 'hd-rl-log'; logEl.className = 'hd-rl-log'; logEl.setAttribute('data-i18n-skip', '');
    logEl.innerHTML = '<b>Incident log</b><ol id="hd-rl-log-liste"></ol>';
    schirm.appendChild(logEl);
    leiste.addEventListener('click', (e) => {
      const k = e.target.closest('[data-hd-rl]'); if (!k) return;
      const a = k.dataset.hdRl;
      if (a === 'gruen') hdRlGruen();
      else if (a === 'gelb' || a === 'vsc' || a === 'sc') hdRlFlagge(a);
      else if (a === 'rot') hdRlRot();
      else if (a === 'ziel') hdRlZiel();
      else hdRlWetter(a);
      setTimeout(hdRlMalen, 80);
    });
  }
  function hdRlMalen() {
    const leiste = $('hd-rl-leiste'); if (!leiste) return;
    const rot = typeof rennPauseAktiv === 'function' && rennPauseAktiv();
    const lage = rot ? 'rot' : flagState === 'restart' ? 'restart' : flagState === 'yellow' ? hdRl.modus : 'gruen';
    const rennt = hdRlRennt();
    leiste.querySelectorAll('[data-hd-rl]').forEach((k) => {
      const a = k.dataset.hdRl;
      k.classList.toggle('an', a === lage || (a === 'dry' || a === 'rain' || a === 'wechsel') && a === raceWxStart);
      if (['gelb', 'vsc', 'sc', 'rot', 'ziel'].includes(a)) k.disabled = !rennt || (a !== 'rot' && rot) || (a === 'ziel' && raceState !== 'racing');
      if (a === 'gruen') k.disabled = !(rot ? rennPause.phase === 'pause' : flagState === 'yellow');
      if (a === 'sc') k.title = (typeof safetyCar === 'function' && safetyCar()) ? 'Safety car: the safety car goes out, the field queues behind it' : 'No safety car in the garage – assign a car the role "Safety Car"';
    });
    const txt = { gruen: rennt ? 'GREEN' : (raceState === 'finished' ? 'FINISHED' : 'NO RACE'), gelb: 'YELLOW', vsc: 'VSC', sc: 'SAFETY CAR', rot: 'RED FLAG', restart: 'RESTART' }[lage];
    const l = $('hd-rl-lage'); if (l) { l.textContent = (raceState === 'finishing' && lage === 'gruen' ? 'FINAL LAP' : txt) + hdRlAusText(); l.dataset.lage = lage; }
    const liste = $('hd-rl-log-liste');
    if (liste) {
      const html = hdRl.log.length ? hdRl.log.map((x) => `<li class="art-${x.art}"><time>${x.zeit}</time> ${String(x.text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</li>`).join('')
        : '<li class="leer">No incidents yet.</li>';
      if (liste.innerHTML !== html) liste.innerHTML = html;
    }
  }
  function hdRlAusText() {
    let dnf = 0, dsq = 0;
    hdRl.dnf.forEach((x) => { if (x.art === 'dsq') dsq++; else dnf++; });
    return (dnf ? ' · ' + dnf + ' DNF' : '') + (dsq ? ' · ' + dsq + ' DSQ' : '');
  }
  // A new race starts clean: no DNFs, no penalties, empty log, safety-car mode by default.
  function hdRlTick() {
    if (raceState === 'countdown' && hdRl.letzterRennstatus !== 'countdown') {
      hdRl.dnf.clear(); hdRl.strafe.clear(); hdRl.log = []; hdRl.modus = 'sc'; hdRlMenueZu();
      hdRlLog('Race start', 'gruen');
    }
    if (flagState === 'green' && hdRl.modus !== 'sc') hdRl.modus = 'sc';
    hdRl.letzterRennstatus = raceState;
    const d = $('race-dash');
    if (d && d.dataset.screen === 'uebersicht') hdRlMalen();
  }

  (function hdRlStart() {
    const css = document.createElement('style');
    css.textContent = `
      /* Standings get the whole left column; map, incident log and lap chart stack on the right. */
      body #race-ovscreen { grid-template-rows: auto auto minmax(0, auto) minmax(96px, 1fr) minmax(0, auto) auto auto !important;
        grid-template-areas: "kopf kopf" "rl rl" "tab karte" "tab log" "tab dia" "sek sek" "fuss fuss" !important; }
      body #race-ovscreen:has(.ov-podest:not([hidden])) { grid-template-rows: auto auto auto minmax(0, auto) minmax(96px, 1fr) minmax(0, auto) auto auto !important;
        grid-template-areas: "kopf kopf" "rl rl" "podium podium" "tab karte" "tab log" "tab dia" "sek sek" "fuss fuss" !important; }
      body #race-ovscreen { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) !important; }
      body #race-ovscreen > .ov-tab { overflow: auto; align-self: start; max-height: 100%; }
      body #race-ovscreen > .hd-rl-log { min-height: 0; }
      body #race-ovscreen > .ov-diagramm { height: min(18vh, 170px); overflow: hidden; }
      body #race-ovscreen > .ov-diagramm svg { width: 100%; height: 100%; max-height: min(18vh, 170px); }
      body #race-ovscreen > .ov-karte { max-height: 30vh; }
      #race-ovscreen > .schirm-kopf { grid-area: kopf; }
      #race-ovscreen > .ov-tab { grid-area: tab; }
      #race-ovscreen > .ov-karte { grid-area: karte; }
      #race-ovscreen > .schirm-fuss { grid-area: fuss; }
      .hd-rl-leiste { grid-area: rl; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 0 8px;
        border-bottom: 1px solid #262e3d; margin-bottom: 4px; }
      .hd-rl-titel { font: 800 12px var(--k-font, Inter, sans-serif); letter-spacing: .14em; color: #ff4d6a; }
      .hd-rl-gruppe { display: flex; gap: 6px; flex-wrap: wrap; }
      .hd-rl-k { all: unset; cursor: pointer; padding: 7px 12px; border-radius: 5px; border: 1px solid #343c4c; background: #141922;
        color: #e9ecf1; font: 800 12px var(--k-font, Inter, sans-serif); letter-spacing: .06em; white-space: nowrap; }
      .hd-rl-k:hover:not(:disabled) { border-color: #6a7488; }
      .hd-rl-k:focus-visible { outline: 2px solid #00d6ff; outline-offset: 2px; }
      .hd-rl-k:disabled { opacity: .35; cursor: default; }
      .hd-rl-gruen { border-color: #2d7a4a; } .hd-rl-gruen.an, .hd-rl-gruen:not(:disabled):hover { background: #1f8f4e; color: #fff; }
      .hd-rl-gelb.an { background: #ffd23f; color: #14161c; border-color: #ffd23f; }
      .hd-rl-vsc.an { background: #ffd23f; color: #14161c; border-color: #ffd23f; box-shadow: inset 0 0 0 2px #14161c; }
      .hd-rl-sc.an { background: #ff9a1f; color: #14161c; border-color: #ff9a1f; }
      .hd-rl-rot { border-color: #8a2333; } .hd-rl-rot.an { background: #e0283e; color: #fff; border-color: #e0283e; }
      .hd-rl-wx.an { background: #1f56d6; border-color: #1f56d6; }
      .hd-rl-lage { margin-left: auto; font: 800 13px var(--k-font, Inter, sans-serif); letter-spacing: .1em; padding: 6px 12px; border-radius: 5px;
        background: #1f8f4e; color: #fff; }
      .hd-rl-lage[data-lage="gelb"], .hd-rl-lage[data-lage="vsc"], .hd-rl-lage[data-lage="restart"] { background: #ffd23f; color: #14161c; }
      .hd-rl-lage[data-lage="sc"] { background: #ff9a1f; color: #14161c; }
      .hd-rl-lage[data-lage="rot"] { background: #e0283e; }
      .hd-rl-log { grid-area: log; min-height: 0; overflow: auto; max-height: 28vh; padding: 6px 8px; border: 1px solid #262e3d; border-radius: 6px;
        font: 12px/1.4 var(--k-font, Inter, sans-serif); color: #c3c8d4; }
      .hd-rl-log b { font-size: 11px; letter-spacing: .12em; color: #8a93a3; text-transform: uppercase; }
      .hd-rl-log ol { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; }
      .hd-rl-log time { color: #6fd3ff; font-variant-numeric: tabular-nums; margin-right: 6px; }
      .hd-rl-log .art-rot { color: #ff8a9a; } .hd-rl-log .art-gelb, .hd-rl-log .art-vsc { color: #ffe27a; } .hd-rl-log .art-sc { color: #ffc070; }
      .hd-rl-log .art-dnf { color: #ff8a9a; font-weight: 700; } .hd-rl-log .art-strafe { color: #ffd34d; }
      .hd-rl-log .art-dsq { color: #fff; font-weight: 800; background: #000; border-left: 3px solid #fff; padding-left: 4px; } .hd-rl-log .leer { opacity: .6; }
      /* standings: one more column for the DNF button */
      body .ov-zeile { grid-template-columns: 1.5em 1.1em minmax(0, 1fr) 2.2em 2.2em 1.4em 4.4em 4.4em 3.8em 5.4em !important; }
      body #race-ovscreen.ov-fertig .ov-zeile { grid-template-columns: 1.5em 1.1em minmax(0, 1fr) 2.2em 2.2em 1.4em 4.4em 3.8em 5.4em !important; }
      .ov-dnf-zelle { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
      .ov-strafe { font: 800 10px var(--k-font, Inter, sans-serif); color: #14161c; background: #ffd34d; border-radius: 3px; padding: 2px 4px; font-variant-numeric: tabular-nums; }
      .ov-dnf-knopf.dsq { background: #000; color: #fff; border-color: #fff; }
      .ov-zeile.ov-dsq .ov-luecke { color: #fff; }
      .hd-rl-menue { position: fixed; z-index: 2147483000; display: grid; gap: 3px; min-width: 190px; padding: 8px; border-radius: 8px;
        background: #12161d; border: 1px solid #39ff88; box-shadow: 0 0 14px rgba(57,255,136,.25), 0 10px 30px rgba(0,0,0,.6);
        font: 600 12px var(--k-font, Inter, sans-serif); color: #e6e9ef; }
      .hd-rl-menue b { font-size: 11px; letter-spacing: .06em; color: #8a93a3; padding: 0 4px 4px; text-transform: uppercase; }
      .hd-rl-menue button { all: unset; cursor: pointer; padding: 6px 8px; border-radius: 5px; }
      .hd-rl-menue button:hover, .hd-rl-menue button:focus-visible { background: #222a36; outline: none; }
      .hd-rl-menue .st-schwarz { background: #000; color: #fff; border: 1px solid #555; }
      .hd-rl-menue .st-dnf { color: #ff8a9a; }
      .ov-dnf-knopf { all: unset; cursor: pointer; font: 800 10px var(--k-font, Inter, sans-serif); letter-spacing: .06em; padding: 3px 7px;
        border-radius: 4px; border: 1px solid #5a2a33; color: #ff8a9a; background: transparent; }
      .ov-dnf-knopf:hover { background: #3a1820; }
      .ov-dnf-knopf.aus { background: #e0283e; color: #fff; border-color: #e0283e; }
      .ov-zeile.ov-dnf { opacity: .55; }
      .ov-zeile.ov-dnf .ov-luecke { color: #ff8a9a; font-weight: 800; }
    `;
    document.head.appendChild(css);
    hdRlBauen();
    // The screen's name when you flip to it (toast) follows its new job.
    try { const e = COCKPIT_SCREENS.find((x) => x.id === 'uebersicht'); if (e) e.name = 'Race Director'; } catch (e) { /* not ready */ }
    setInterval(hdRlTick, 250);
  })();

  // ---- SELF-TEST (window.HYBRIDDASH_RL.selbsttest()) - stand-in cars, state put back --------
  async function hdRlSelbsttest() {
    const out = [], ok = (n, b, m) => out.push({ name: n, ok: !!b, mass: m });
    const merk = { raceState, flagState, limitYellow, garage: garage.slice(), confirm: window.confirm, scRaus: safetyCarRaus, modus: hdRl.modus };
    let scRausGerufen = 0;
    safetyCarRaus = () => { scRausGerufen++; };
    window.confirm = () => true;
    const geschrieben = [];
    const fake = (id, role) => ({ role, alias: id, tag: id, colorId: 'rot', device: { id, name: id },
      rx: { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: async (d) => { geschrieben.push({ id, b: Array.from(new Uint8Array(d.buffer || d, d.byteOffset || 0, d.byteLength)) }); } },
      ghost: null, race: { laps: [{ ms: 9000 }, { ms: 8800 }] }, tileCode: 2 });
    try {
      garage.length = 0;
      const a = fake('rl-a', 'ghost'), b = fake('rl-b', 'ghost');
      garage.push(a, b);
      raceState = 'racing'; flagState = 'green'; hdRl.dnf.clear(); hdRl.strafe.clear(); hdRl.log = [];
      // Yellow: no safety car, caution pace above the SC pace.
      hdRlFlagge('gelb');
      const gelbZiel = gelbZielFuer(a);
      ok('yellow flag: flag out, safety car stays in', flagState === 'yellow' && scRausGerufen === 0, 'flag ' + flagState + ', SC deployed ' + scRausGerufen + 'x');
      // VSC: no safety car, SC pace.
      hdRlFlagge('vsc');
      const vscZiel = gelbZielFuer(a);
      ok('VSC: safety car stays in, slower than yellow', scRausGerufen === 0 && vscZiel < gelbZiel, 'yellow ' + gelbZiel.toFixed(2) + ' / VSC ' + vscZiel.toFixed(2));
      // SC without a safety car in the garage: refused, VSC stays.
      hdRlFlagge('sc');
      ok('SC without a safety car: refused', hdRl.modus === 'vsc', 'mode ' + hdRl.modus);
      // SC with a safety car: deployed.
      const sc = fake('rl-sc', 'safetycar'); garage.push(sc);
      gelbBeenden(); hdRl.modus = 'sc';
      hdRlFlagge('sc');
      ok('SC: the safety car goes out', flagState === 'yellow' && scRausGerufen >= 1, 'SC deployed ' + scRausGerufen + 'x');
      gelbBeenden(); garage.pop();
      // DNF: the car only gets neutral packets, sorts last, shows DNF.
      hdRlDnf('rl-a');
      geschrieben.length = 0;
      writeToCar(a, 0.6, 0.8, trackModeBit());
      const neutral = Array.from(buildCommandPacket(0, 0, trackModeBit()));
      const voll = Array.from(buildCommandPacket(0.6, 0.8, trackModeBit()));
      const p = geschrieben.find((x) => x.id === 'rl-a');
      ok('DNF: the car is stopped whatever is sent', !p || JSON.stringify(p.b) !== JSON.stringify(voll), p ? 'sent ' + (JSON.stringify(p.b) === JSON.stringify(neutral) ? 'neutral' : 'other') : 'nothing sent');
      // The path every player command takes (funkSchreiben): full throttle in, stop packet out.
      geschrieben.length = 0;
      await funkSchreiben(a.rx, buildCommandPacket(0.6, 0.8, trackModeBit()), null);
      const q = geschrieben.find((x) => x.id === 'rl-a');
      ok('DNF: full throttle to a DNF car goes out as a stop packet', q && JSON.stringify(q.b) === JSON.stringify(neutral), q ? JSON.stringify(q.b).slice(0, 40) : 'nothing sent');
      // Red flag and resume (the race pause).
      if (typeof rennPauseErlaubt === 'function' && rennPauseErlaubt()) {
        hdRlRot();
        const rotAn = rennPauseAktiv();
        hdRlGruen();
        ok('red flag stops the race, green resumes it (restart lights)', rotAn && rennPause.phase === 'ampel', 'red ' + rotAn + ', then ' + rennPause.phase);
        rennPauseAmpelAbbrechen(); rennPause.phase = 'aus'; rennPauseSenden(false); rennPauseMalen();
      }
      const liste = raceAllCars();
      const zeilen = ovDaten();
      ok('DNF: standings put it last and show DNF', liste.find((x) => x.id === 'rl-a').dnf && zeilen[zeilen.length - 1].id === 'rl-a' && zeilen[zeilen.length - 1].luecke === 'DNF',
         zeilen.map((z) => z.name + ':' + z.luecke).join(' | '));
      ok('DNF: logged', hdRl.log.some((x) => x.art === 'dnf'), hdRl.log.map((x) => x.text).join(' / '));
      // Reinstate.
      hdRlDnf('rl-a');
      ok('DNF can be undone', !hdDnfAuto(a), 'dnf ' + hdDnfAuto(a));
      // Time penalty: a gets +5 s on its race time.
      const vorher = ovDaten().map((z) => z.id);
      hdRlStrafe('rl-a', 5);
      const nachher = ovDaten();
      ok('time penalty: +5 s counts on the race time', hdStrafeMs('rl-a') === 5000 && nachher.find((z) => z.id === 'rl-a').strafeMs === 5000
         && nachher.find((z) => z.id === 'rl-a').summe === 9000 + 8800 + 5000, 'before ' + vorher.join(',') + ' after ' + nachher.map((z) => z.id + ':' + z.summe).join(','));
      hdRlStrafe('rl-a', 10);
      ok('time penalties add up and are logged', hdStrafeMs('rl-a') === 15000 && hdRl.log.filter((x) => x.art === 'strafe').length === 2, 'total ' + hdStrafeMs('rl-a'));
      hdRlStrafe('rl-a', 0);
      ok('penalties can be cleared', hdStrafeMs('rl-a') === 0, 'total ' + hdStrafeMs('rl-a'));
      // Black flag: stopped like a DNF, shown as DSQ below DNF.
      hdRlAus('rl-b', 'dsq'); hdRlAus('rl-a', 'dnf');
      geschrieben.length = 0;
      await funkSchreiben(b.rx, buildCommandPacket(0.6, 0.8, trackModeBit()), null);
      const r = geschrieben.find((x) => x.id === 'rl-b');
      const z2 = ovDaten();
      ok('black flag: car stopped, DSQ below DNF', r && JSON.stringify(r.b) === JSON.stringify(neutral) && z2[z2.length - 1].id === 'rl-b' && z2[z2.length - 1].luecke === 'DSQ'
         && z2[z2.length - 2].luecke === 'DNF', z2.map((z) => z.id + ':' + z.luecke).join(' | '));
      ok('steward cell shows DSQ / penalty badge', /DSQ/.test(hdDnfZelle({ id: 'rl-b' })) && (hdRlStrafe('rl-b', 5), /\+5s/.test(hdDnfZelle({ id: 'rl-b' }))), hdDnfZelle({ id: 'rl-b' }).slice(0, 80));
      hdRlWieder('rl-a'); hdRlWieder('rl-b'); hdRl.strafe.clear();
      // Chequered flag.
      hdRlZiel();
      ok('chequered flag: final lap for everyone', raceState === 'finishing', 'state ' + raceState);
    } catch (e) {
      ok('self-test ran', false, String(e && e.stack || e));
    } finally {
      safetyCarRaus = merk.scRaus; window.confirm = merk.confirm;
      if (flagState !== 'green') gelbBeenden();
      raceState = merk.raceState; flagState = merk.flagState; limitYellow = merk.limitYellow; hdRl.modus = merk.modus;
      garage.length = 0; merk.garage.forEach((c) => garage.push(c));
      hdRl.dnf.clear(); hdRl.strafe.clear(); hdRl.log = []; hdRlMenueZu();
    }
    return out;
  }

  window.HYBRIDDASH_RL = Object.freeze({
    selbsttest: hdRlSelbsttest,
    // Tests/screenshots only: stand-in field in a running race (reload the page afterwards).
    _demo: () => {
      const mk = (id, n, farbe, laps) => ({ role: 'ghost', alias: n, tag: id, colorId: farbe, device: { id, name: id }, ghost: null,
        race: { laps: laps.map((ms) => ({ ms })) }, tileCode: 2 });
      garage.length = 0;
      garage.push(mk('d1', 'Mara Kovac', 'rot', [9100, 8800, 8750]), mk('d2', 'Diego Reyes', 'blau', [9300, 9000, 8900]),
                  mk('d3', 'Noor Rahimi', 'gelb', [9600, 9400]), mk('d4', 'Emil Strand', 'gruen', [9800, 9500]));
      raceState = 'racing'; raceStartedAt = rennZeitJetzt() - 184000;
      window.confirm = () => true;
      hdRlFlagge('vsc'); hdRlDnf('d4'); hdRlWetter('rain'); hdRlStrafe('d2', 5); hdRlAus('d3', 'dsq');
    },
    flagge: hdRlFlagge, gruen: hdRlGruen, rot: hdRlRot, ziel: hdRlZiel, wetter: hdRlWetter, dnf: hdRlDnf, dsq: (id) => hdRlAus(id, 'dsq'), strafe: hdRlStrafe, wieder: hdRlWieder,
    status: () => ({ modus: hdRl.modus, flag: flagState, rot: typeof rennPauseAktiv === 'function' && rennPauseAktiv(),
                     dnf: [...hdRl.dnf.keys()], strafe: Object.fromEntries([...hdRl.strafe].map(([k]) => [k, hdStrafeMs(k)])), log: hdRl.log.slice(), limitYellow, raceState }),
  });
