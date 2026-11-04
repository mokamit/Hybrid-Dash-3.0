  // =========================================================================
  // HybridDash 2.1: the "HybridDash" cockpit look (tile dashboard)
  // =========================================================================
  //
  // REQUESTED (with a screenshot): a tile dashboard - status and setting chips on the left,
  // speed / gear / tyres in the middle, lap times on the right, a throttle/brake bar at the far
  // right. It is a cockpit LOOK like ACC, GT3 or Oldschool (Options > General > Cockpit look),
  // but unlike those it is its own layout, not a colour theme over the shared one.
  //
  // ONE SOURCE OF TRUTH: every number is read from the standard cockpit's own elements
  // (#race-speed, #race-gear, #race-lap-now, ...), which the app keeps updating while they are
  // hidden. So this dashboard can never disagree with the other looks - it shows the same values
  // in a different arrangement. Only throttle/brake input comes from a hook in the drive loop
  // (hdCockpitEingabe, 50-drive.js), because the standard cockpit does not show it as a number.
  //
  //   chips   AST driving aid · STR driving feel · THR throttle curve · TOP top speed
  //           LCK steering calibration · EXPO steering expo · BRK brake power
  //   rows    Battery · Position · Fuel · Off track
  //   middle  speed · gear · TYRES % (four corners)
  //   right   Lap · Lap time / Δ best / best · Last lap · Condition · flag box · THR/BRK bar

  const HD_CP_SEG = 6;            // segments for throttle (up) and brake (down)
  const hdCp = { gas: 0, bremse: 0, an: false, el: null, uhr: null };

  // Hook from the drive loop (50-drive.js), every tick.
  function hdCockpitEingabe(gas, bremse) {
    hdCp.gas = Math.max(0, Math.min(1, gas || 0));
    hdCp.bremse = Math.max(0, Math.min(1, bremse || 0));
  }

  const hdTxt = (id) => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const hdZahl = (s) => { const m = String(s || '').match(/-?\d+(?:[.,]\d+)?/); return m ? m[0].replace(',', '.') : ''; };
  const hdLeer = (s) => (s && s !== '–' && s !== '-' && s !== '—' ? s : '—');

  function hdCockpitBauen() {
    if (hdCp.el) return hdCp.el;
    const dash = $('race-dash');
    if (!dash) return null;
    const el = document.createElement('div');
    el.id = 'hd-cockpit';
    el.className = 'hd-cp';
    el.setAttribute('data-i18n-skip', '');
    const chip = (k, farbe, id) => `<div class="hd-cp-chip" style="--c:${farbe}"><span>${k}</span><b id="hd-cp-${id}">—</b></div>`;
    const zeile = (k, id) => `<div class="hd-cp-zeile"><span class="hd-cp-taste">${k}</span><b id="hd-cp-${id}">—</b></div>`;
    el.innerHTML = `
      <div class="hd-cp-links">
        <div class="hd-cp-kopf"><b id="hd-cp-status">No session</b>
          <svg id="hd-cp-licht" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 5 C7 5 6 9 6 12 C6 15 7 19 13 19 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8 H21 M16 12 H21 M16 16 H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
        <div class="hd-cp-raster">
          <div class="hd-cp-chips">${chip('AST', '#35d07f', 'ast')}${chip('STR', '#29c4e8', 'str')}${chip('THR', '#f2a01c', 'thr')}${chip('TOP', '#e9ecf1', 'top')}</div>
          <div class="hd-cp-zeilen">${zeile('Battery', 'akku')}${zeile('Position', 'pos')}${zeile('Fuel', 'tank')}${zeile('Off track', 'abseits')}</div>
        </div>
        <div class="hd-cp-chips2">${chip('LCK', '#ff5a5a', 'lck')}${chip('EXPO', '#35d07f', 'expo')}${chip('BRK', '#3b7fe2', 'brk')}</div>
      </div>
      <div class="hd-cp-mitte">
        <div class="hd-cp-box hd-cp-tempo"><b id="hd-cp-kmh">0</b><small>km/h</small></div>
        <div class="hd-cp-box hd-cp-gang"><b id="hd-cp-gang">N</b></div>
        <div class="hd-cp-reifen"><div class="hd-cp-reifen-kopf">TYRES %</div>
          <div class="hd-cp-reifen-raster"><b id="hd-cp-fl">—</b><b id="hd-cp-fr">—</b><b id="hd-cp-rl">—</b><b id="hd-cp-rr">—</b></div></div>
      </div>
      <div class="hd-cp-rechts">
        <div class="hd-cp-runde"><span>Lap</span><b id="hd-cp-runde">—</b></div>
        <div class="hd-cp-box hd-cp-zeiten"><div class="hd-cp-zt-kopf">Lap time</div><b id="hd-cp-jetzt">--</b>
          <div class="hd-cp-zt-fuss"><div><span>Δ Best</span><b id="hd-cp-delta">--</b></div><div><span>Best</span><b id="hd-cp-best">--</b></div></div></div>
        <div class="hd-cp-box hd-cp-reihe"><span>Last lap</span><b id="hd-cp-letzte">—</b></div>
        <div class="hd-cp-box hd-cp-reihe"><span>Condition</span><b id="hd-cp-schaden" class="hd-cp-blau">—</b></div>
      </div>
      <div class="hd-cp-aussen">
        <div class="hd-cp-flagge" id="hd-cp-flagge">—</div>
        <div class="hd-cp-balken"><span>THR</span><div class="hd-cp-seg" id="hd-cp-seg">
          ${Array.from({ length: HD_CP_SEG }, (_, i) => `<i class="hd-g" data-i="${HD_CP_SEG - 1 - i}"></i>`).join('')}
          <i class="hd-cp-pfeil" id="hd-cp-pfeil">⬆</i>
          ${Array.from({ length: HD_CP_SEG }, (_, i) => `<i class="hd-b" data-i="${i}"></i>`).join('')}
        </div><span>BRK</span></div>
      </div>`;
    dash.insertBefore(el, dash.firstChild);
    hdCp.el = el;
    return el;
  }

  function hdSetz(id, v) { const el = $('hd-cp-' + id); if (el && el.textContent !== v) el.textContent = v; }

  function hdCockpitMalen() {
    if (document.body.getAttribute('data-cockpit') !== 'hybriddash') return;
    const el = hdCockpitBauen();
    if (!el || !el.offsetParent) return;
    // Status
    let status = 'No session', farbe = '#ff4d4d';
    try {
      if (raceState === 'countdown') { status = 'Start lights'; farbe = '#ffd23f'; }
      else if (raceState === 'racing' || raceState === 'finishing') {
        status = flagState === 'yellow' ? 'Yellow flag' : flagState === 'restart' ? 'Restart' : (raceMode === 'practice' ? 'Practice' : 'Racing');
        farbe = flagState === 'green' ? '#35d07f' : '#ffd23f';
      } else if (raceState === 'finished') { status = 'Finished'; farbe = '#e9ecf1'; }
    } catch (e) { /* not ready */ }
    hdSetz('status', status);
    $('hd-cp-status').style.color = farbe;
    try { $('hd-cp-licht').style.color = headlightsOn ? '#29c4e8' : '#55606e'; } catch (e) { /* not ready */ }
    // Chips
    const assist = ($('driver-assist') || {}).value;
    hdSetz('ast', assist === 'voll' ? 'FULL' : assist === 'quer' ? 'LANE' : 'OFF');
    const gefuehl = hdTxt('race-act-mode-txt');
    const kurz = { arcade: 'ARC', pro: 'PRO', 'sim+': 'SIM+', sim: 'SIM', pacejka: 'PAC', omega: 'OMG', gt3: 'GT3', rc: 'RC' };
    const w = gefuehl.toLowerCase().split(/[\s·(]/)[0];
    hdSetz('str', gefuehl ? (kurz[w] || w.replace(/[^a-z0-9+]/g, '').slice(0, 4).toUpperCase()) : '—');
    hdSetz('thr', hdLeer(hdZahl(hdTxt('setting-throttle-gamma-val'))));
    hdSetz('top', hdLeer(hdZahl(hdTxt('setting-topspeed-val'))));
    hdSetz('lck', hdLeer(hdZahl(hdTxt('setting-steer-calib-val'))));
    hdSetz('expo', hdLeer(hdZahl(hdTxt('setting-steer-expo-val'))));
    hdSetz('brk', hdLeer(hdZahl(hdTxt('setting-brakepower-val'))));
    // Rows
    hdSetz('akku', hdLeer(hdTxt('race-batt')));
    const posEl = $('race-pos');
    hdSetz('pos', posEl && !posEl.hidden ? hdLeer(posEl.textContent.trim()) : '—');
    hdSetz('tank', hdLeer(hdTxt('race-fuel')));
    let ab = 0; try { ab = abseitsZaehlerFuer(1); } catch (e) { ab = 0; }
    hdSetz('abseits', String(ab));
    // Middle
    hdSetz('kmh', hdZahl(hdTxt('race-speed')) || '0');
    hdSetz('gang', hdTxt('race-gear') || 'N');
    for (const k of ['fl', 'fr', 'rl', 'rr']) {
      const t4 = $('race-tyre-' + k), b = t4 && t4.querySelector('b');
      let v = '—';
      if (b) {
        const h = b.style.height || b.style.getPropertyValue('--fill') || '';
        const m = String(h).match(/[\d.]+/);
        if (m) v = String(Math.round(parseFloat(m[0])));
      }
      hdSetz(k, v);
    }
    // Right
    hdSetz('runde', hdLeer(hdTxt('race-lap-count')));
    hdSetz('jetzt', hdLeer(hdTxt('race-lap-now')).replace('—', '--'));
    hdSetz('delta', hdLeer(hdTxt('race-lap-delta')).replace('—', '--'));
    hdSetz('best', hdLeer(hdTxt('race-lap-best')).replace('—', '--'));
    hdSetz('letzte', hdLeer(hdTxt('race-lap-last')));
    hdSetz('schaden', hdLeer(hdTxt('race-dmg')));
    // Flag box
    const fl = $('hd-cp-flagge');
    let f = 'GREEN', fc = '#35d07f';
    try {
      if (raceState !== 'racing' && raceState !== 'finishing') { f = '—'; fc = '#2bd1c0'; }
      else if (flagState === 'yellow') { f = typeof safetyCarFaehrt === 'function' && safetyCarFaehrt() ? 'SC' : 'YELLOW'; fc = '#ffd23f'; }
      else if (flagState === 'restart') { f = 'RESTART'; fc = '#ffd23f'; }
    } catch (e) { /* not ready */ }
    if (fl.textContent !== f) fl.textContent = f;
    fl.style.setProperty('--c', fc);
    // Throttle / brake bar (6 segments each way) and the shift arrow.
    const g = Math.round(hdCp.gas * HD_CP_SEG), br = Math.round(hdCp.bremse * HD_CP_SEG);
    el.querySelectorAll('.hd-g').forEach((s) => s.classList.toggle('an', Number(s.dataset.i) < g));
    el.querySelectorAll('.hd-b').forEach((s) => s.classList.toggle('an', Number(s.dataset.i) < br));
    const shift = $('race-shift');
    const voll = shift ? shift.querySelectorAll('span.on, span.an, span.lit').length : 0;
    $('hd-cp-pfeil').classList.toggle('an', voll >= 8);
  }

  (function hdCockpitStart() {
    const css = document.createElement('style');
    css.textContent = `
      body[data-cockpit="hybriddash"] #race-dash > :not(.race-corner):not(#hd-cockpit):not(#gt3-flag):not(#gt3-offtrack):not(#gt3-pit):not(#race-flag):not(.race-pit) { display: none !important; }
      #hd-cockpit { display: none; }
      body[data-cockpit="hybriddash"] #race-dash { position: relative; }
      body[data-cockpit="hybriddash"] #hd-cockpit { display: grid; position: absolute; inset: clamp(34px, 6vh, 52px) 0 0 0; overflow: auto; z-index: 1; }
      body[data-cockpit="hybriddash"] #race-dash > .race-corner { z-index: 3; }
      .hd-cp { --t: #3a3f49; grid-template-columns: 1.45fr 1fr 1.1fr .55fr; gap: clamp(6px, 1.2vw, 14px); padding: clamp(8px, 1.6vw, 18px);
        background: #000; color: #f4f6fb; font-family: Inter, system-ui, sans-serif; width: 100%; box-sizing: border-box;
        align-content: start; }
      .hd-cp b { font-weight: 800; font-variant-numeric: tabular-nums; }
      .hd-cp-box { border: 2px solid #2a2e35; border-radius: 8px; background: #08090b; }
      .hd-cp-links { display: grid; gap: clamp(6px, 1vw, 12px); align-content: start; }
      .hd-cp-kopf { display: flex; align-items: center; gap: 14px; font-size: clamp(13px, 1.6vw, 20px); }
      .hd-cp-raster { display: grid; grid-template-columns: auto 1fr; gap: clamp(6px, 1vw, 12px); }
      .hd-cp-chips, .hd-cp-zeilen { display: grid; gap: clamp(5px, .9vw, 10px); }
      .hd-cp-chip { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: clamp(70px, 9vw, 120px);
        padding: clamp(6px, .9vw, 10px) clamp(8px, 1vw, 12px); border: 2px solid var(--c); border-radius: 8px; background: #08090b; }
      .hd-cp-chip span { font-size: clamp(10px, 1.1vw, 14px); font-weight: 800; letter-spacing: .03em; }
      .hd-cp-chip b { font-size: clamp(15px, 2vw, 26px); }
      .hd-cp-chips2 { display: flex; gap: clamp(6px, 1vw, 12px); flex-wrap: wrap; justify-content: center; }
      .hd-cp-zeile { display: flex; align-items: center; gap: 12px; }
      .hd-cp-taste { flex: 0 0 clamp(80px, 8vw, 110px); text-align: center; background: #3a3f49; border-radius: 6px;
        padding: clamp(8px, 1.1vw, 13px) 6px; font-weight: 700; font-size: clamp(11px, 1.15vw, 15px); }
      .hd-cp-zeile b { flex: 1; text-align: right; font-size: clamp(14px, 1.8vw, 24px); white-space: nowrap; }
      .hd-cp-mitte { display: grid; gap: clamp(6px, 1vw, 12px); grid-template-rows: auto 1fr auto; }
      .hd-cp-tempo { display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 6px; }
      .hd-cp-tempo b { font-size: clamp(22px, 3vw, 38px); }
      .hd-cp-tempo small { font-size: clamp(9px, .9vw, 12px); color: #c3c8d4; }
      .hd-cp-gang { display: grid; place-items: center; min-height: clamp(110px, 22vh, 220px); }
      .hd-cp-gang b { font-size: clamp(70px, 14vh, 150px); line-height: 1; font-weight: 500; }
      .hd-cp-reifen { border: 2px solid #f2a01c; border-radius: 8px; overflow: hidden; background: #08090b; }
      .hd-cp-reifen-kopf { background: #f2a01c; color: #14161c; text-align: center; font-weight: 800; padding: 5px; font-size: clamp(11px, 1.1vw, 15px); }
      .hd-cp-reifen-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; }
      .hd-cp-reifen-raster b { background: #1a1d22; border-radius: 4px; text-align: center; padding: clamp(6px, 1vh, 12px) 0; font-size: clamp(16px, 2.2vw, 28px); }
      .hd-cp-rechts { display: grid; gap: clamp(6px, 1vw, 12px); align-content: start; }
      .hd-cp-runde { display: flex; align-items: center; gap: 10px; width: max-content; border: 2px solid #2a2e35; border-radius: 8px; background: #3a3f49; padding: 4px 4px 4px 12px; }
      .hd-cp-runde span { font-size: clamp(14px, 1.6vw, 20px); font-weight: 700; }
      .hd-cp-runde b { background: #000; border-radius: 6px; padding: 4px 16px; font-size: clamp(14px, 1.6vw, 20px); min-width: 2.5em; text-align: center; }
      .hd-cp-zeiten { overflow: hidden; }
      .hd-cp-zt-kopf { background: #3a3f49; text-align: center; padding: 5px; font-weight: 700; font-size: clamp(12px, 1.2vw, 16px); }
      .hd-cp-zeiten > b { display: block; text-align: center; font-size: clamp(22px, 3vw, 38px); padding: clamp(10px, 2vh, 22px) 0; }
      .hd-cp-zt-fuss { display: grid; grid-template-columns: 1fr 1fr; border-top: 2px solid #2a2e35; }
      .hd-cp-zt-fuss div { display: grid; text-align: center; }
      .hd-cp-zt-fuss div + div { border-left: 2px solid #2a2e35; }
      .hd-cp-zt-fuss span { background: #2a2e35; font-size: clamp(10px, 1vw, 13px); font-weight: 700; padding: 3px; }
      .hd-cp-zt-fuss b { padding: 8px 0; font-size: clamp(13px, 1.4vw, 18px); }
      .hd-cp-reihe { display: flex; align-items: center; justify-content: space-between; padding: clamp(6px, 1vh, 10px) 12px; background: #24272d; }
      .hd-cp-reihe span { font-weight: 700; font-size: clamp(11px, 1.15vw, 15px); }
      .hd-cp-reihe b { font-size: clamp(14px, 1.6vw, 20px); }
      .hd-cp-blau { background: #1f56d6; border-radius: 4px; padding: 3px 10px; }
      .hd-cp-aussen { display: grid; gap: clamp(6px, 1vw, 12px); grid-template-rows: auto 1fr; }
      .hd-cp-flagge { border: 2px solid var(--c, #2bd1c0); color: var(--c, #2bd1c0); border-radius: 8px; text-align: center; font-weight: 800;
        padding: clamp(8px, 1.4vh, 14px) 4px; font-size: clamp(11px, 1.2vw, 16px); }
      .hd-cp-balken { border: 2px solid #2a2e35; border-radius: 8px; display: grid; grid-template-rows: auto 1fr auto; text-align: center; padding: 6px; gap: 6px; }
      .hd-cp-balken span { font-size: clamp(10px, 1vw, 13px); font-weight: 700; color: #c3c8d4; }
      .hd-cp-seg { display: grid; grid-auto-rows: 1fr; gap: 3px; }
      .hd-cp-seg i { display: block; background: #15181c; border: 1px solid #2a2e35; border-radius: 2px; min-height: 8px; font-style: normal; }
      .hd-cp-seg i.hd-g.an { background: #35d07f; border-color: #35d07f; }
      .hd-cp-seg i.hd-b.an { background: #ff4d4d; border-color: #ff4d4d; }
      .hd-cp-pfeil { display: grid !important; place-items: center; color: #8a93a3; font-size: clamp(14px, 1.6vw, 22px); background: transparent !important; border: 0 !important; }
      .hd-cp-pfeil.an { color: #ffd23f; }
      @media (max-width: 760px) { .hd-cp { grid-template-columns: 1fr 1fr; } .hd-cp-aussen { grid-column: 1 / -1; grid-template-rows: auto; grid-template-columns: auto 1fr; } .hd-cp-balken { grid-template-rows: none; grid-template-columns: auto 1fr auto; } .hd-cp-seg { grid-auto-flow: column; grid-auto-columns: 1fr; grid-auto-rows: auto; } }
    `;
    document.head.appendChild(css);
    // The look in the existing chooser (Options > General > Cockpit look).
    // The option itself is in the markup (00-index.head.html), so a saved choice survives the
    // start-up in 50-drive.js. ONE-TIME switch to the new look (like OmegaSim's switch to ACC):
    // afterwards a choice of another look is kept.
    const sel = $('setting-cockpit');
    try {
      if (sel && !localStorage.getItem('hybriddash.cockpit.v1')) {
        localStorage.setItem('hybriddash.cockpit.v1', '1');
        sel.value = 'hybriddash';
        sel.dispatchEvent(new Event('change'));
      }
    } catch (e) { /* private mode */ }
    hdCp.uhr = setInterval(hdCockpitMalen, 100);
  })();

  window.HYBRIDDASH_COCKPIT = Object.freeze({ malen: hdCockpitMalen, eingabe: hdCockpitEingabe });
