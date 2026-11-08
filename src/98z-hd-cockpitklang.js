  // =====================================================================================
  // Hybrid-Dash 3.0: COCKPIT SOUNDS - brakes, lock-up, rattle, gear beeps, contact
  // =====================================================================================
  //
  // BESTELLT: "Add braking sounds, cockpit noises - such as rattle and gear beeps, add contact sound when crashing
  // with barrier or other cars and add tyre lock up noises."
  //
  // All synthesized with Web Audio (no new files), on top of what 80-sound.js already plays (engine, the brake-squeal
  // sample, tyre squeal at the grip limit, shift clunk, crash samples). Driven by player 1's physics, once per engine
  // sound tick (updateEngineSound -> hdCockpitKlangTick):
  //   brakes     disc / pad friction: band-passed noise (2.2 kHz) plus a low rumble, with pedal x speed
  //   lock-up    a hard stop above a third of top speed (or ABS working): a tonal screech with a fast wobble and a
  //              hiss on top, louder in the wet
  //   rattle     the cockpit: random clicks of band-passed noise (trim and mounts), more with speed, load and on
  //              kerbs / off the track
  //   gear beeps a short confirm beep on every gear change, and the shift-light beep at the rev limit
  //   contact    on every impact (the crash detection in 70-race.js): a thud and a crack; against another car (an NPC
  //              within reach on track) a lighter bump with a plastic clack, against the barrier a heavier hit with a
  //              scrape. Stronger with speed.
  // Own volume in Options > Sound ("Cockpit sounds"), 0 = off. Silent during the self-test suite.
  const HD_CK_STORE = 'hybriddash.cockpitklang.v1';
  let hdCkVolumen = (() => { try { const v = parseFloat(localStorage.getItem(HD_CK_STORE)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6; } catch (e) { return 0.6; } })();
  let hdCk = null;   // the nodes, built once per AudioContext
  function hdCkAus() {
    try { if (typeof hdSuiteLaeuft === 'function' && hdSuiteLaeuft()) return true; } catch (e) { /* not ready */ }
    if (typeof hdMenueGesperrt === 'function' && hdMenueGesperrt()) return true;
    return !hdCkVolumen || typeof audioCtx === 'undefined' || !audioCtx || (typeof soundEnabled !== 'undefined' && !soundEnabled);
  }
  function hdCkRauschen(ctx, sek) {
    const n = Math.floor(ctx.sampleRate * sek), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function hdCkBauen() {
    if (hdCk && hdCk.ctx === audioCtx) return hdCk;
    const ctx = audioCtx;
    const master = ctx.createGain(); master.gain.value = hdCkVolumen; master.connect(ctx.destination);
    const rauschen = hdCkRauschen(ctx, 2);
    const quelle = ctx.createBufferSource(); quelle.buffer = rauschen; quelle.loop = true; quelle.start();
    const zweig = (typ, hz, q, ziel) => {
      const f = ctx.createBiquadFilter(); f.type = typ; f.frequency.value = hz; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      quelle.connect(f).connect(g).connect(ziel || master);
      return g;
    };
    // brakes
    const bremse = zweig('bandpass', 2200, 0.9), bremsRumpeln = zweig('bandpass', 170, 1.2);
    // lock-up: two detuned saws with a wobble, through a band-pass, plus a hiss
    const blockFilter = ctx.createBiquadFilter(); blockFilter.type = 'bandpass'; blockFilter.frequency.value = 1500; blockFilter.Q.value = 2.5;
    const blockGain = ctx.createGain(); blockGain.gain.value = 0;
    blockFilter.connect(blockGain).connect(master);
    const wobbel = ctx.createOscillator(); wobbel.frequency.value = 13; const wobbelTiefe = ctx.createGain(); wobbelTiefe.gain.value = 45;
    wobbel.connect(wobbelTiefe);
    const saegen = [780, 1170].map((hz) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      wobbelTiefe.connect(o.frequency); o.connect(blockFilter); o.start(); return o;
    });
    wobbel.start();
    const blockZischen = zweig('bandpass', 3200, 1.4);
    // rattle: two bands, the gain set at random every tick = clicks
    const rassel = zweig('bandpass', 480, 3), surren = zweig('bandpass', 1300, 6);
    hdCk = { ctx, master, bremse, bremsRumpeln, blockGain, blockZischen, rassel, surren, saegen, rauschen, gang: null, piepBis: 0, letzterPiep: 0 };
    return hdCk;
  }
  // A short tone (gear beeps).
  function hdCkTon(hz, dauer, laut, typ) {
    const k = hdCkBauen(), ctx = k.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = typ || 'square'; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(laut, t0 + 0.004); g.gain.setTargetAtTime(0, t0 + dauer * 0.6, dauer * 0.25);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5000;
    o.connect(f).connect(g).connect(k.master);
    o.start(t0); o.stop(t0 + dauer + 0.2);
  }
  // A burst of filtered noise (contact).
  function hdCkStoss(typ, hz, q, laut, dauer, verzoegerung) {
    const k = hdCkBauen(), ctx = k.ctx, t0 = ctx.currentTime + (verzoegerung || 0);
    const s = ctx.createBufferSource(); s.buffer = k.rauschen; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = typ; f.frequency.value = hz; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(laut, t0 + 0.005); g.gain.setTargetAtTime(0, t0 + 0.01, dauer / 3);
    s.connect(f).connect(g).connect(k.master);
    s.start(t0, Math.random()); s.stop(t0 + dauer * 2 + 0.1);
  }
  function hdCkWumms(laut, hz) {
    const k = hdCkBauen(), ctx = k.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(hz, t0); o.frequency.exponentialRampToValueAtTime(hz * 0.45, t0 + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(laut, t0 + 0.006); g.gain.setTargetAtTime(0, t0 + 0.02, 0.07);
    o.connect(g).connect(k.master); o.start(t0); o.stop(t0 + 0.6);
  }
  // Is another car right next to the player on track? (then a contact is car-to-car, not barrier)
  function hdCkAutoDaneben() {
    try {
      const n = currentTrackTiles.length, ich = playerCar && ghostOrt(playerCar);
      if (!n || ich === null || ich === undefined) return false;
      return garage.some((c) => {
        if (!c || c === playerCar || !c.device) return false;
        const o = ghostOrt(c);
        if (o === null || o === undefined) return false;
        let d = Math.abs(o - ich) % n; d = Math.min(d, n - d);
        return d < 0.35;
      });
    } catch (e) { return false; }
  }
  // Called from the crash handler (70-race.js) with the impact strength 0..1.
  function hdKontaktKlang(wucht, wer) {
    if (hdCkAus() || (wer && wer >= 2)) return;
    const w = Math.max(0.25, Math.min(1, wucht || 0.5));
    if (hdCkAutoDaneben()) {
      // car-to-car: a body bump and a plastic clack, shorter
      hdCkWumms(0.5 * w, 120);
      hdCkStoss('bandpass', 2600, 2, 0.45 * w, 0.06);
      hdCkStoss('bandpass', 1200, 3, 0.3 * w, 0.05, 0.05);
    } else {
      // barrier: a heavy thud, a crack, and the scrape along the wall
      hdCkWumms(0.85 * w, 85);
      hdCkStoss('lowpass', 500, 0.7, 0.7 * w, 0.12);
      hdCkStoss('bandpass', 3000, 1.5, 0.4 * w, 0.05);
      hdCkStoss('bandpass', 1700, 1.2, 0.22 * w, 0.35 + 0.3 * w, 0.06);
    }
  }
  // Every engine sound tick (player 1).
  function hdCockpitKlangTick(st, load, throttleY) {
    if (hdCkAus()) { if (hdCk) hdCkStill(); return; }
    let k;
    try { k = hdCkBauen(); } catch (e) { return; }
    const cfg = physEngine.config, t = k.ctx.currentTime;
    const v = Math.max(0, Math.min(1, Math.abs(st.speedKmh) / Math.max(0.01, cfg.topSpeedKmh)));
    const pedal = Math.max(0, -(+throttleY || 0));
    const rollt = v > 0.04;
    // brakes
    const brems = rollt ? Math.min(1, pedal * 1.2) * Math.min(1, v * 1.6) : 0;
    k.bremse.gain.setTargetAtTime(0.16 * brems, t, 0.05);
    k.bremsRumpeln.gain.setTargetAtTime(0.22 * brems, t, 0.06);
    // lock-up: a hard stop above a third of top speed, or ABS at work; the wet makes it come sooner
    let nass = 0;
    try { nass = typeof wxRainLevel === 'function' ? wxRainLevel() : 0; } catch (e) { nass = 0; }
    const schwelle = 0.82 - 0.2 * nass;
    let block = (pedal > schwelle && v > 0.3) ? Math.min(1, (pedal - schwelle) / (1 - schwelle + 1e-6)) * Math.min(1, (v - 0.3) / 0.3) : 0;
    if (st.absActive) block = Math.max(block, 0.6);
    k.blockGain.gain.setTargetAtTime(0.09 * block, t, 0.03);
    k.blockZischen.gain.setTargetAtTime(0.12 * block, t, 0.03);
    // rattle: random clicks, more with speed, load and off the track / on kerbs
    let rau = 0;
    try { rau = (typeof trackMode !== 'undefined' && trackMode === 'on' && typeof abseitsJetzt === 'function' && abseitsJetzt()) ? 1 : 0; } catch (e) { rau = 0; }
    const basis = rollt ? (0.025 + 0.06 * v + 0.02 * (load || 0) + 0.12 * rau * v) : 0;
    k.rassel.gain.setTargetAtTime(basis * (Math.random() < 0.35 ? 1 : 0.15), t, 0.008);
    k.surren.gain.setTargetAtTime(basis * 0.35 * (0.5 + Math.random() * 0.5), t, 0.02);
    // gear beeps: confirm on a change, shift-light beep at the limit
    const gang = st.currentGear;
    if (k.gang !== null && gang !== k.gang && rollt) hdCkTon(gang > k.gang ? 1650 : 1250, 0.045, 0.07);
    k.gang = gang;
    const jetzt = Date.now();
    if ((st.rpmFrac || 0) > 0.93 && (load || 0) > 0.3 && jetzt - k.letzterPiep > 150) { k.letzterPiep = jetzt; hdCkTon(2400, 0.06, 0.05); }
  }
  function hdCkStill() {
    if (!hdCk) return;
    const t = hdCk.ctx.currentTime;
    ['bremse', 'bremsRumpeln', 'blockGain', 'blockZischen', 'rassel', 'surren'].forEach((n) => hdCk[n].gain.setTargetAtTime(0, t, 0.05));
  }
  // ---- Options > Sound: "Cockpit sounds" volume ---------------------------------------------------------------------
  function hdCkReglerBauen() {
    const vorlage = document.getElementById('brake-volume');
    const zeile = vorlage && vorlage.closest('.opt-row');
    if (!zeile || document.getElementById('hd-cockpit-volume')) return;
    const z = document.createElement('div');
    z.className = 'opt-row';
    z.innerHTML = '<div class="opt-label">' + t('Cockpit-Geräusche') + '<small>' + t('Bremsen, blockierende Reifen, Klappern im Cockpit, Schaltpiepen und der Kontakt mit Bande oder anderen Autos. 0 % = aus.') + '</small></div>'
      + '<div class="opt-slider"><button type="button" data-step="-1" aria-label="' + t('weniger') + '">&minus;</button>'
      + '<input type="range" id="hd-cockpit-volume" min="0" max="1" step="0.05" value="' + hdCkVolumen + '">'
      + '<button type="button" data-step="1" aria-label="' + t('mehr') + '">+</button><span class="opt-val">' + Math.round(hdCkVolumen * 100) + '%</span></div>';
    zeile.parentNode.insertBefore(z, zeile.nextSibling);
    if (typeof optInfoEinrichten === 'function') optInfoEinrichten();   // the help text behind the (i), like every option
    const r = z.querySelector('input'), wert = z.querySelector('.opt-val');
    r.addEventListener('input', () => {
      hdCkVolumen = parseFloat(r.value) || 0;
      wert.textContent = Math.round(hdCkVolumen * 100) + '%';
      try { localStorage.setItem(HD_CK_STORE, String(hdCkVolumen)); } catch (e) { /* private */ }
      if (hdCk) hdCk.master.gain.setTargetAtTime(hdCkVolumen, hdCk.ctx.currentTime, 0.05);
    });
    r.addEventListener('change', () => { if (!hdCkAus()) { hdCkTon(1650, 0.045, 0.07); setTimeout(() => hdKontaktKlang(0.5), 120); } });
    z.querySelectorAll('button[data-step]').forEach((b) => b.addEventListener('click', () => {
      r.value = String(Math.max(0, Math.min(1, (parseFloat(r.value) || 0) + 0.05 * Number(b.dataset.step))));
      r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  }
  setTimeout(hdCkReglerBauen, 0);
  window.HYBRIDDASH_COCKPITKLANG = Object.freeze({ kontakt: hdKontaktKlang, ton: (hz) => hdCkTon(hz || 1650, 0.05, 0.07),
    _lage: () => (hdCk ? { bremse: hdCk.bremse.gain.value, block: hdCk.blockGain.gain.value, rassel: hdCk.rassel.gain.value } : null), _tick: hdCockpitKlangTick,
    _warum: () => ({ ctx: typeof audioCtx !== 'undefined' && !!audioCtx, an: typeof soundEnabled !== 'undefined' ? soundEnabled : null, vol: hdCkVolumen, suite: typeof hdSuiteLaeuft === 'function' ? hdSuiteLaeuft() : null }) });
