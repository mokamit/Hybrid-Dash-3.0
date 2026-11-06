  // =====================================================================================
  // Hybrid-Dash 3.0: MULTIPLAYER - one laptop hosts, phones and laptops drive
  // =====================================================================================
  //
  // BESTELLT: "Create a separate tab for Multiplayer. A laptop is required to be the host, and then other players
  // can either connect with their phones or another laptop by going to the browser and multiplayer tab and then
  // connecting using a quick pairing code and or just using the wifi. Use the best solution with the least amount
  // of interference and latency. A dedicated multiplayer window, where they can connect and select their car, tune
  // and have their own cockpit view too."
  //
  // ---- WHO DOES WHAT -----------------------------------------------------------------------------------------------
  //
  //   HOST (laptop)     holds every Bluetooth connection (its own, plus a helper laptop's if two-laptop mode is on),
  //                     runs physics, timing, race control. A remote player is one of the extra player slots
  //                     (zusatzPlatz 2 / 3, 49-spieler.js) - the same slot a second gamepad on the host would use.
  //   PLAYER (phone /   joins with the room code, picks a free car, tunes it, and drives from the dedicated window:
  //   laptop)           a gamepad on that device, or touch controls on a phone. It gets its own cockpit back.
  //
  // ---- WHY A VIRTUAL GAMEPAD ---------------------------------------------------------------------------------------
  //
  // The player's device sends what its controller looks like (standard mapping: 4 axes, 18 buttons). The host hands
  // that snapshot to pollPadZusatz() (90-ghosts.js) in place of a local pad. So everything a second local pad can do
  // - throttle, brake, steering, shifting, lights, pit stop, yellow flag, tyre and fuel choice, the player's own
  // button mapping - works for a remote player without a second code path, and stays in step when that code changes.
  // Touch controls on a phone press the same virtual buttons.
  //
  // ---- THE LINK: lowest latency and least interference -------------------------------------------------------------
  //
  // WebRTC data channels, device to device on the local Wi-Fi: no server in the path of a single steering packet.
  //   'mp-ctl'  reliable, ordered: lobby, car choice, setup, pings.
  //   'mp-in'   UNRELIABLE, unordered (maxRetransmits 0): controller snapshots up (60 / s) and cockpit state down
  //             (20 / s). A lost packet is never resent - the next one, 16 ms later, is newer anyway. A reliable
  //             channel would hold every later packet back behind a lost one (head-of-line blocking): exactly the lag
  //             spike a driver feels.
  // Finding each other: a browser page cannot discover another one on the network, so host and players meet in the
  // same Supabase Realtime room as the two-laptop pairing (98k-hd-pairing.js) - a hashed, AES-GCM-encrypted channel
  // that only ever carries the handshake. One public STUN server lets the browsers find a route when the Wi-Fi hides
  // local addresses (mDNS); on one Wi-Fi the direct local route still wins. No race data goes online.
  // "Just using the Wi-Fi": the host shows a link with the code in it (?mp=CODE). Opening it joins straight away.
  //
  // ---- SAFETY ------------------------------------------------------------------------------------------------------
  //
  // No controller snapshot for HD_MP_STILL_MS -> the host feeds that player's slot a neutral pad (no throttle): the car
  // stops. A player who leaves, or whose link closes, releases the car (setCarRole 'none' sends the stop packet).
  // A phone that locks its screen stops sending (requestAnimationFrame pauses) - the car stops, as it should.

  const HD_MP_STILL_MS = 400;
  const HD_MP_INPUT_HZ = 60;
  const HD_MP_STATE_MS = 50;
  const HD_MP_LOBBY_MS = 1500;
  const HD_MP_HALLO_MS = 2000;
  const HD_MP_HOST_STORE = 'hybriddash.mp.host.v1';
  const HD_MP_CLIENT_STORE = 'hybriddash.mp.client.v1';
  const HD_MP_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  const HD_MP_SLOTS = [2, 3];
  const HD_MP_KNOEPFE = 18;

  function mt(s) { return typeof t === 'function' ? t(s) : s; }
  function hdMpEsc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function hdMpId() { return Math.random().toString(36).slice(2, 10); }
  function hdMpZeit(ms) {
    if (!(ms > 0)) return '–';
    const s = ms / 1000, m = Math.floor(s / 60);
    return (m ? m + ':' + String((s - m * 60).toFixed(3)).padStart(6, '0') : s.toFixed(3));
  }

  // =====================================================================================
  // The meeting room (Supabase Realtime broadcast, encrypted with the room code)
  // =====================================================================================
  function hdMpRaum(code, rolle, beiNachricht, beiStatus) {
    const r = { code, rolle, id: hdMpId(), ws: null, topic: null, key: null, drin: false, aktiv: true, ref: 1, hb: null, neu: null, versuche: 0 };
    const senden = (o) => { if (r.ws && r.ws.readyState === 1) { o.ref = String(r.ref++); r.ws.send(JSON.stringify(o)); return true; } return false; };
    async function verschl(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const d = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, r.key, new TextEncoder().encode(JSON.stringify(obj)));
      return { iv: hdB64(iv), d: hdB64(new Uint8Array(d)) };
    }
    async function entschl(p) {
      const d = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hdUnB64(p.iv) }, r.key, hdUnB64(p.d));
      return JSON.parse(new TextDecoder().decode(d));
    }
    function verbinden() {
      if (!r.aktiv) return;
      const sig = hdSignal();
      let ws;
      try { ws = new WebSocket(sig.url + '?apikey=' + encodeURIComponent(sig.key) + '&vsn=1.0.0'); }
      catch (e) { beiStatus(mt('Treffpunkt nicht erreichbar') + ': ' + e.message); return spaeter(); }
      r.ws = ws; r.drin = false;
      ws.onopen = () => {
        r.versuche = 0;
        senden({ topic: r.topic, event: 'phx_join', join_ref: '1',
          payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: sig.key } });
        clearInterval(r.hb);
        r.hb = setInterval(() => senden({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.topic !== r.topic) return;
        if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !r.drin) { r.drin = true; beiStatus(''); beiNachricht({ t: '_drin' }); }
        else if (m.event === 'broadcast' && m.payload && m.payload.event === 'mp') {
          entschl(m.payload.payload).then((o) => { if (o && o.von !== r.id) beiNachricht(o); }).catch(() => { /* other room */ });
        }
      };
      ws.onclose = () => {
        if (r.ws !== ws) return;
        r.drin = false; clearInterval(r.hb);
        if (r.aktiv) { beiStatus(mt('Treffpunkt getrennt – neuer Versuch …')); spaeter(); }
      };
      ws.onerror = () => { /* onclose follows */ };
    }
    function spaeter() { clearTimeout(r.neu); r.neu = setTimeout(verbinden, Math.min(30000, 2000 * Math.pow(2, r.versuche++))); }
    r.senden = async (obj) => {
      if (!r.drin) return false;
      const payload = await verschl(Object.assign({ von: r.id, rolle: r.rolle }, obj));
      return senden({ topic: r.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'mp', payload } });
    };
    r.zu = () => { r.aktiv = false; clearInterval(r.hb); clearTimeout(r.neu); try { if (r.ws) r.ws.close(); } catch (e) { /* gone */ } r.ws = null; };
    r.start = async () => {
      r.topic = 'realtime:hdmp-' + hdHex(await hdSha('hybriddash-mp-topic:' + code)).slice(0, 32);
      r.key = await crypto.subtle.importKey('raw', await hdSha('hybriddash-mp-key:' + code), 'AES-GCM', false, ['encrypt', 'decrypt']);
      verbinden();
    };
    return r;
  }
  // Wait until ICE gathering is done (all candidates in the SDP: one message each way, no trickle).
  function hdMpIce(pc) {
    return new Promise((fertig) => {
      if (pc.iceGatheringState === 'complete') return fertig();
      const uhr = setTimeout(fertig, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(uhr); fertig(); } });
    });
  }
  // A controller snapshot as 22 floats: 4 axes, 18 button values.
  function hdMpPadPacken(axes, knoepfe, seq) {
    const f = new Float32Array(1 + 4 + HD_MP_KNOEPFE);
    f[0] = seq;
    for (let i = 0; i < 4; i++) f[1 + i] = axes[i] || 0;
    for (let i = 0; i < HD_MP_KNOEPFE; i++) f[5 + i] = knoepfe[i] || 0;
    return f.buffer;
  }
  function hdMpNeutralPad() {
    return { id: 'Hybrid-Dash remote player', index: -1, mapping: 'standard', connected: true, timestamp: performance.now(),
             axes: [0, 0, 0, 0], buttons: Array.from({ length: HD_MP_KNOEPFE }, () => ({ pressed: false, touched: false, value: 0 })) };
  }

  // =====================================================================================
  // HOST
  // =====================================================================================
  const hdMpH = { aktiv: false, code: null, raum: null, spieler: new Map(), lobbyUhr: null, stateUhr: null, pingUhr: null, status: '' };

  function hdMpHostStarten(code) {
    hdMpHostStoppen(true);
    hdMpH.code = hdCodeNorm(code || '') || hdCodeNeu();
    hdMpH.aktiv = true;
    try { localStorage.setItem(HD_MP_HOST_STORE, JSON.stringify({ code: hdMpH.code })); } catch (e) { /* private */ }
    hdMpH.raum = hdMpRaum(hdMpH.code, 'host', hdMpHostSignal, (s) => { hdMpH.status = s; hdMpMalen(); });
    hdMpH.raum.start();
    hdMpH.lobbyUhr = setInterval(hdMpLobbySenden, HD_MP_LOBBY_MS);
    hdMpH.stateUhr = setInterval(hdMpStateSenden, HD_MP_STATE_MS);
    hdMpH.pingUhr = setInterval(hdMpPingen, 1000);
    log('Multiplayer: hosting room ' + hdCodeZeigen(hdMpH.code) + '.', 'info');
    hdMpMalen();
  }
  function hdMpHostStoppen(still) {
    for (const s of [...hdMpH.spieler.values()]) hdMpSpielerWeg(s, mt('Host hat beendet'));
    if (hdMpH.raum) hdMpH.raum.zu();
    clearInterval(hdMpH.lobbyUhr); clearInterval(hdMpH.stateUhr); clearInterval(hdMpH.pingUhr);
    const war = hdMpH.aktiv;
    Object.assign(hdMpH, { aktiv: false, raum: null, status: '' });
    if (!still) { try { localStorage.removeItem(HD_MP_HOST_STORE); } catch (e) { /* private */ } }
    if (war && !still) log('Multiplayer: room closed.', 'info');
    hdMpMalen();
  }
  function hdMpHostSignal(m) {
    if (m.t === '_drin') { hdMpH.raum.senden({ t: 'host-da' }); return; }
    if (m.rolle !== 'client' || !m.cid) return;
    if (m.t === 'hallo') {
      const s = hdMpH.spieler.get(m.cid);
      const offen = s && s.ctl && s.ctl.readyState === 'open';
      if (!offen && (!s || !s.angebotAt || performance.now() - s.angebotAt > 8000)) hdMpAngebot(m.cid, m.name);
    } else if (m.t === 'antwort') {
      const s = hdMpH.spieler.get(m.cid);
      if (s && s.pc && s.angebotId === m.id) s.pc.setRemoteDescription(m.sdp).catch((e) => { s.status = e.message; hdMpMalen(); });
    }
  }
  async function hdMpAngebot(cid, name) {
    let s = hdMpH.spieler.get(cid);
    if (s && s.pc) { try { s.pc.close(); } catch (e) { /* gone */ } }
    if (!s) {
      s = { cid, name: String(name || '').slice(0, 24) || mt('Spieler'), pc: null, ctl: null, inp: null, slot: null, carId: null,
            pad: hdMpNeutralPad(), letzte: 0, seq: 0, rtt: null, rate: 0, zaehler: 0, rateUhr: performance.now(), status: '' };
      hdMpH.spieler.set(cid, s);
    }
    const pc = new RTCPeerConnection({ iceServers: HD_MP_ICE });
    s.pc = pc; s.angebotId = hdMpId(); s.angebotAt = performance.now();
    pc.addEventListener('connectionstatechange', () => {
      if (s.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') hdMpSpielerWeg(s, mt('Verbindung verloren'));
      hdMpMalen();
    });
    s.ctl = pc.createDataChannel('mp-ctl', { ordered: true });
    s.inp = pc.createDataChannel('mp-in', { ordered: false, maxRetransmits: 0 });
    s.inp.binaryType = 'arraybuffer';
    s.ctl.onopen = () => { s.status = ''; hdMpLobbySenden(); hdMpMalen(); log('Multiplayer: ' + s.name + ' joined.', 'info'); };
    s.ctl.onclose = () => { if (s.pc === pc) hdMpSpielerWeg(s, mt('Verbindung verloren')); };
    s.ctl.onmessage = (e) => { let o; try { o = JSON.parse(e.data); } catch (err) { return; } hdMpHostCtl(s, o); };
    s.inp.onmessage = (e) => hdMpHostInput(s, e.data);
    await pc.setLocalDescription(await pc.createOffer());
    await hdMpIce(pc);
    if (s.pc !== pc) return;
    hdMpH.raum.senden({ t: 'angebot', an: cid, id: s.angebotId, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    hdMpMalen();
  }
  function hdMpSpielerWeg(s, grund) {
    hdMpAutoFrei(s);
    try { if (s.ctl && s.ctl.readyState === 'open') s.ctl.send(JSON.stringify({ t: 'tschuess', grund })); } catch (e) { /* closed */ }
    try { if (s.pc) s.pc.close(); } catch (e) { /* gone */ }
    if (hdMpH.spieler.get(s.cid) === s) hdMpH.spieler.delete(s.cid);
    log('Multiplayer: ' + s.name + ' left (' + grund + ').', 'info');
    hdMpMalen();
  }
  function hdMpAutoVon(id) { try { return garage.find((c) => c && c.device && String(c.device.id) === String(id)) || null; } catch (e) { return null; } }
  function hdMpAutoFrei(s) {
    const car = s.carId ? hdMpAutoVon(s.carId) : null;
    if (car && s.slot && car.role === 'player' + s.slot && typeof setCarRole === 'function') {
      setCarRole(car, 'none');
      if (typeof renderGarage === 'function') renderGarage();
    }
    s.slot = null; s.carId = null; s.pad = hdMpNeutralPad();
  }
  // Which cars a player may take: connected, not the safety car / sweeper, not the host's own car and not another
  // player's. A ghost (NPC) may be taken - it becomes the player's car.
  function hdMpBelegtVon(car) {
    const id = String(car.device && car.device.id);
    for (const s of hdMpH.spieler.values()) if (s.carId === id) return s.name;
    if (car.role === 'player') return mt('Host');
    if (/^player[2-9]$/.test(car.role || '')) return mt('lokaler Spieler');
    return null;
  }
  function hdMpFreierSlot(s) {
    if (s.slot) return s.slot;
    const belegt = new Set([...hdMpH.spieler.values()].map((x) => x.slot).filter(Boolean));
    for (const n of HD_MP_SLOTS) {
      const z = zusatzPlatz(n);
      if (!belegt.has(n) && !(z && z.car)) return n;
    }
    return null;
  }
  function hdMpHostCtl(s, o) {
    if (o.t === 'name') { s.name = String(o.name || '').slice(0, 24) || s.name; hdMpMalen(); return; }
    if (o.t === 'pong') { s.rtt = Math.max(0, Math.round(performance.now() - o.ts)); return; }
    if (o.t === 'wahl') {
      const car = hdMpAutoVon(o.carId);
      const antwort = (ok, text) => { try { s.ctl.send(JSON.stringify({ t: 'wahl-ok', ok, text, carId: ok ? s.carId : null })); } catch (e) { /* closed */ } };
      if (!car) return antwort(false, mt('Dieses Auto ist nicht mehr verbunden.'));
      const belegt = hdMpBelegtVon(car);
      if (belegt && String(car.device.id) !== s.carId) return antwort(false, mt('Dieses Auto fährt schon') + ': ' + belegt);
      if (car.role === 'safetycar' || car.role === 'reinig') return antwort(false, mt('Dieses Auto ist das Safety Car.'));
      const vorher = s.carId;
      if (vorher && vorher !== String(car.device.id)) hdMpAutoFrei(s);
      const slot = hdMpFreierSlot(s);
      if (!slot) return antwort(false, mt('Alle Plätze für Mitspieler sind belegt (höchstens zwei).'));
      s.slot = slot; s.carId = String(car.device.id);
      setCarRole(car, 'player' + slot);
      if (typeof startPadLoop === 'function') startPadLoop();
      if (typeof renderGarage === 'function') renderGarage();
      log('Multiplayer: ' + s.name + ' drives ' + garageLabel(car) + ' (player ' + slot + ').', 'info');
      antwort(true, '');
      hdMpLobbySenden(); hdMpMalen();
      return;
    }
    if (o.t === 'frei') { hdMpAutoFrei(s); hdMpLobbySenden(); hdMpMalen(); return; }
    if (o.t === 'setup' && s.slot) {
      const z = zusatzPlatz(s.slot);
      if (!z) return;
      if (typeof o.preset === 'string' && typeof window.__spielerPresetSetzen === 'function') window.__spielerPresetSetzen(s.slot, o.preset || null);
      if (['weich', 'mittel', 'hart', 'regen'].includes(o.reifen)) {
        let laeuft = false; try { laeuft = raceState === 'racing' || raceState === 'countdown'; } catch (e) { laeuft = false; }
        if (laeuft) z.mischungWunsch = o.reifen; else { z.reifen = o.reifen; if (typeof physEngine2Abgleichen === 'function') physEngine2Abgleichen(); }
      }
      if ([25, 50, 75, 100].includes(o.tank)) z.tankZiel = o.tank;
      hdMpLobbySenden();
    }
  }
  function hdMpHostInput(s, buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength !== 4 * (5 + HD_MP_KNOEPFE)) return;
    const f = new Float32Array(buf);
    if (f[0] <= s.seq && s.seq - f[0] < 1e6) return;   // older than what we have (unordered channel)
    s.seq = f[0];
    const pad = s.pad;
    for (let i = 0; i < 4; i++) pad.axes[i] = Math.max(-1, Math.min(1, f[1 + i] || 0));
    for (let i = 0; i < HD_MP_KNOEPFE; i++) { const v = Math.max(0, Math.min(1, f[5 + i] || 0)); pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; }
    pad.timestamp = performance.now();
    s.letzte = pad.timestamp;
    s.zaehler++;
  }
  // Hook for pollGamepad (90-ghosts.js): the pad that drives slot nr, if a remote player has it. A stale player gets a
  // neutral pad - not undefined - so the slot does not fall back to a local controller and the car stops.
  function hdMpPadFuer(nr) {
    try { if (!hdMpH.aktiv) return null; } catch (e) { return null; }
    for (const s of hdMpH.spieler.values()) {
      if (s.slot !== nr) continue;
      if (performance.now() - s.letzte > HD_MP_STILL_MS) return hdMpNeutralPad();
      return s.pad;
    }
    return null;
  }
  function hdMpPingen() {
    const jetzt = performance.now();
    for (const s of hdMpH.spieler.values()) {
      if (s.ctl && s.ctl.readyState === 'open') { try { s.ctl.send(JSON.stringify({ t: 'ping', ts: jetzt })); } catch (e) { /* closed */ } }
      const dt = (jetzt - s.rateUhr) / 1000;
      if (dt > 0) { s.rate = Math.round(s.zaehler / dt); s.zaehler = 0; s.rateUhr = jetzt; }
    }
    hdMpMalen();
  }
  function hdMpLobby() {
    let autos = [];
    try {
      autos = garage.filter((c) => c && c.device && c.role !== 'safetycar' && c.role !== 'reinig').map((c) => {
        const f = carColor(c);
        return { id: String(c.device.id), name: c.alias || c.tag || garageLabel(c), nummer: typeof hdNummer === 'function' ? hdNummer(c) : (c.nummer || ''),
                 hex: f.hex, farbe: mt(f.name), modell: carModellWert(c.modellId) && typeof carModellName === 'function' ? carModellName(c.modellId) : '', marke: carModellWert(c.modellId) || '',
                 foto: typeof hdFotoBelegung === 'function' ? (hdFotoBelegung().get(String(c.device.id)) ?? null) : null,
                 stil: typeof hdAvatarStil === 'function' ? hdAvatarStil(c) : 0, belegt: hdMpBelegtVon(c) };
      });
    } catch (e) { autos = []; }
    let presets = [];
    try { presets = (window.__presetKeysFahren ? window.__presetKeysFahren() : []).map((k) => ({ k, n: window.__presetLabel(k) })); } catch (e) { presets = []; }
    let rennen = {};
    try { rennen = { modus: raceMode, limit: raceLimit, zustand: raceState }; } catch (e) { rennen = {}; }
    return { t: 'lobby', autos, presets, rennen };
  }
  function hdMpLobbySenden() {
    if (!hdMpH.aktiv) return;
    const basis = hdMpLobby();
    for (const s of hdMpH.spieler.values()) {
      if (!s.ctl || s.ctl.readyState !== 'open') continue;
      let setup = null;
      if (s.slot) {
        const z = zusatzPlatz(s.slot);
        setup = { preset: (window.__spielerPreset && window.__spielerPreset(s.slot)) || '', reifen: z.mischungWunsch || z.reifen, tank: z.tankZiel };
      }
      try { s.ctl.send(JSON.stringify(Object.assign({}, basis, { ich: { carId: s.carId, slot: s.slot, setup } }))); } catch (e) { /* closed */ }
    }
  }
  // The player's cockpit: own car's speed, gear, lap, position, times, fuel, damage, battery, and the race state.
  function hdMpStand(s) {
    const z = s.slot ? zusatzPlatz(s.slot) : null;
    const car = s.carId ? hdMpAutoVon(s.carId) : null;
    const o = { t: 'z', rtt: s.rtt };
    try { o.rennen = raceState; o.modus = raceMode; o.limit = raceLimit; } catch (e) { /* not ready */ }
    try { o.sc = typeof scAktiv === 'function' ? !!scAktiv() : false; } catch (e) { o.sc = false; }
    if (z && car) {
      const st = z.motor && z.motor.state;
      o.kmh = st ? Math.round(Math.abs(st.speedKmh)) : 0;
      o.gang = st ? (st.driveMode === 'reverse' ? 'R' : st.driveMode === 'neutral' ? 'N' : String(st.currentGear || 1)) : '';
      o.drehzahl = st ? Math.round((st.rpmFrac || 0) * 100) : 0;
      o.tank = Math.round(z.tank ? z.tank.stand : 0);
      o.schaden = Math.round(z.schaden ? z.schaden.wert : 0);
      o.reifen = z.reifen; o.licht = !!z.licht;
      try { o.akku = car.battery > 0 ? batteryPercent(car.battery, car) : null; } catch (e) { o.akku = null; }
      o.box = z.box ? z.box.lage : 'aus';
      try {
        const alle = raceAllCars();
        const reihe = alle.slice().sort((a, b) => (b.laps.length - a.laps.length) || ((b.ort || 0) - (a.ort || 0)));
        const ich = reihe.findIndex((x) => x.id === s.carId);
        const mein = alle.find((x) => x.id === s.carId);
        o.pos = ich >= 0 ? ich + 1 : null; o.von = reihe.length;
        if (mein) {
          const st2 = raceStats(mein.laps);
          o.runde = mein.laps.length; o.letzte = mein.laps.length ? mein.laps[mein.laps.length - 1].ms : null; o.beste = st2 ? st2.best : null;
        }
        o.feld = reihe.slice(0, 8).map((x, i) => ({ p: i + 1, n: x.alias || x.name, h: x.farbe, r: x.laps.length, ich: x.id === s.carId }));
      } catch (e) { /* race module not ready */ }
    }
    return o;
  }
  function hdMpStateSenden() {
    if (!hdMpH.aktiv) return;
    for (const s of hdMpH.spieler.values()) {
      if (!s.inp || s.inp.readyState !== 'open') continue;
      try { s.inp.send(JSON.stringify(hdMpStand(s))); } catch (e) { /* closed */ }
    }
  }
  function hdMpKick(cid) { const s = hdMpH.spieler.get(cid); if (s) hdMpSpielerWeg(s, mt('vom Host entfernt')); }
  function hdMpLink() {
    try { return location.origin + location.pathname + '?mp=' + hdCodeZeigen(hdMpH.code); } catch (e) { return ''; }
  }

  // =====================================================================================
  // PLAYER (client)
  // =====================================================================================
  const hdMpC = { aktiv: false, code: null, cid: hdMpId(), name: '', raum: null, pc: null, ctl: null, inp: null, verbunden: false,
                  lobby: null, stand: null, ich: null, seq: 1, eingabeUhr: null, halloUhr: null, status: '', ansicht: 'wahl',
                  touch: { gas: 0, bremse: 0, lenk: 0, knoepfe: {} }, letzteZeit: 0 };

  function hdMpClientStarten(code, name) {
    hdMpClientStoppen(true);
    const c = hdCodeNorm(code);
    if (c.length !== 6) throw new Error(mt('Ein Raumcode hat 6 Zeichen, z. B. K7Q-2XM.'));
    Object.assign(hdMpC, { aktiv: true, code: c, name: String(name || '').trim().slice(0, 24) || mt('Spieler'), verbunden: false, lobby: null, stand: null, ich: null, ansicht: 'wahl' });
    try { localStorage.setItem(HD_MP_CLIENT_STORE, JSON.stringify({ code: c, name: hdMpC.name, cid: hdMpC.cid })); } catch (e) { /* private */ }
    hdMpC.raum = hdMpRaum(c, 'client', hdMpClientSignal, (s) => { hdMpC.status = s; hdMpFensterMalen(); });
    hdMpC.raum.start();
    hdMpC.status = mt('Suche den Host …');
    hdMpC.halloUhr = setInterval(hdMpHallo, HD_MP_HALLO_MS);
    hdMpFensterAuf();
  }
  function hdMpClientStoppen(still) {
    if (hdMpC.ctl && hdMpC.ctl.readyState === 'open') { try { hdMpC.ctl.send(JSON.stringify({ t: 'frei' })); } catch (e) { /* closed */ } }
    if (hdMpC.raum) hdMpC.raum.zu();
    try { if (hdMpC.pc) hdMpC.pc.close(); } catch (e) { /* gone */ }
    clearInterval(hdMpC.halloUhr); hdMpEingabeStopp();
    Object.assign(hdMpC, { aktiv: false, raum: null, pc: null, ctl: null, inp: null, verbunden: false });
    if (!still) { try { localStorage.removeItem(HD_MP_CLIENT_STORE); } catch (e) { /* private */ } hdMpFensterZu(); }
    hdMpMalen();
  }
  function hdMpHallo() { if (hdMpC.aktiv && !hdMpC.verbunden && hdMpC.raum) hdMpC.raum.senden({ t: 'hallo', cid: hdMpC.cid, name: hdMpC.name }); }
  async function hdMpClientSignal(m) {
    if (m.t === '_drin' || m.t === 'host-da') { hdMpHallo(); return; }
    if (m.t !== 'angebot' || m.an !== hdMpC.cid || hdMpC.verbunden) return;
    try { if (hdMpC.pc) hdMpC.pc.close(); } catch (e) { /* gone */ }
    const pc = new RTCPeerConnection({ iceServers: HD_MP_ICE });
    hdMpC.pc = pc;
    hdMpC.status = mt('Host gefunden – verbinde …'); hdMpFensterMalen();
    pc.addEventListener('connectionstatechange', () => {
      if (hdMpC.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') hdMpClientGetrennt(mt('Verbindung zum Host verloren – neuer Versuch …'));
    });
    pc.addEventListener('datachannel', (e) => {
      const k = e.channel;
      if (k.label === 'mp-ctl') {
        hdMpC.ctl = k;
        k.onopen = () => { hdMpC.verbunden = true; hdMpC.status = ''; k.send(JSON.stringify({ t: 'name', name: hdMpC.name })); hdMpEingabeStart(); hdMpFensterMalen(); };
        k.onmessage = (ev) => { let o; try { o = JSON.parse(ev.data); } catch (err) { return; } hdMpClientCtl(o); };
        k.onclose = () => { if (hdMpC.ctl === k) hdMpClientGetrennt(mt('Verbindung zum Host verloren – neuer Versuch …')); };
      } else if (k.label === 'mp-in') {
        hdMpC.inp = k; k.binaryType = 'arraybuffer';
        k.onmessage = (ev) => { let o; try { o = JSON.parse(ev.data); } catch (err) { return; } if (o.t === 'z') { hdMpC.stand = o; hdMpC.letzteZeit = performance.now(); hdMpCockpitMalen(); } };
      }
    });
    try {
      await pc.setRemoteDescription(m.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await hdMpIce(pc);
    } catch (e) { hdMpC.status = '⚠ ' + e.message; hdMpFensterMalen(); return; }
    if (hdMpC.pc !== pc) return;
    hdMpC.raum.senden({ t: 'antwort', cid: hdMpC.cid, id: m.id, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  }
  function hdMpClientGetrennt(text) {
    hdMpC.verbunden = false; hdMpC.ctl = null; hdMpC.inp = null; hdMpTouchLos();
    hdMpEingabeStopp();
    hdMpC.status = text;
    hdMpFensterMalen();
  }
  function hdMpClientCtl(o) {
    if (o.t === 'ping') { try { hdMpC.ctl.send(JSON.stringify({ t: 'pong', ts: o.ts })); } catch (e) { /* closed */ } return; }
    if (o.t === 'lobby') {
      hdMpC.lobby = o; hdMpC.ich = o.ich || null;
      if (!(hdMpC.ich && hdMpC.ich.carId) && hdMpC.ansicht !== 'wahl') hdMpC.ansicht = 'wahl';
      hdMpFensterMalen(); return;
    }
    if (o.t === 'wahl-ok') {
      if (o.ok) { hdMpC.ansicht = 'setup'; hdMpC.status = ''; } else { hdMpC.status = o.text || mt('Nicht möglich.'); }
      hdMpFensterMalen(); return;
    }
    if (o.t === 'tschuess') { hdMpClientStoppen(true); hdMpC.status = mt('Der Host hat die Verbindung beendet') + (o.grund ? ' (' + o.grund + ')' : '') + '.'; hdMpFensterMalen(); }
  }
  // ---- the player's controller: a gamepad on this device, or the touch controls -------------------------------------
  function hdMpEigenesPad() {
    try {
      const l = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter((p) => p && p.connected);
      return l.find((p) => p.mapping === 'standard') || l[0] || null;
    } catch (e) { return null; }
  }
  function hdMpEingabeTick() {
    if (!hdMpC.inp || hdMpC.inp.readyState !== 'open') return;
    if (document.hidden) return;   // locked phone / hidden tab: send nothing, the host stops the car
    const pad = hdMpEigenesPad();
    const axes = [0, 0, 0, 0], k = new Array(HD_MP_KNOEPFE).fill(0);
    if (pad) {
      for (let i = 0; i < 4; i++) axes[i] = pad.axes[i] || 0;
      for (let i = 0; i < HD_MP_KNOEPFE; i++) { const b = pad.buttons[i]; k[i] = b ? (b.value ?? (b.pressed ? 1 : 0)) : 0; }
    }
    const tc = hdMpC.touch;
    // Touch on top of the pad (a phone without a pad has only touch): throttle RT (7), brake LT (6), steering LS x.
    k[7] = Math.max(k[7], tc.gas); k[6] = Math.max(k[6], tc.bremse);
    if (Math.abs(tc.lenk) > Math.abs(axes[0])) axes[0] = tc.lenk;
    for (const i of Object.keys(tc.knoepfe)) k[i] = Math.max(k[i], tc.knoepfe[i] ? 1 : 0);
    try { hdMpC.inp.send(hdMpPadPacken(axes, k, hdMpC.seq++)); } catch (e) { /* closed */ }
  }
  function hdMpEingabeStart() {
    hdMpEingabeStopp();
    hdMpC.eingabeUhr = setInterval(hdMpEingabeTick, Math.round(1000 / HD_MP_INPUT_HZ));
  }
  function hdMpEingabeStopp() { clearInterval(hdMpC.eingabeUhr); hdMpC.eingabeUhr = null; }

  // =====================================================================================
  // The dedicated player window (#hd-mp-fenster): choose car -> tune -> cockpit
  // =====================================================================================
  let hdMpFenster = null;
  function hdMpFensterAuf() {
    if (!hdMpFenster) {
      hdMpFenster = document.createElement('div');
      hdMpFenster.id = 'hd-mp-fenster'; hdMpFenster.className = 'hd-mp-fenster';
      hdMpFenster.setAttribute('role', 'dialog'); hdMpFenster.setAttribute('aria-modal', 'true'); hdMpFenster.setAttribute('data-i18n-skip', '');
      document.body.appendChild(hdMpFenster);
      hdMpFenster.addEventListener('click', hdMpFensterKlick);
      hdMpFenster.addEventListener('change', hdMpFensterAenderung);
    }
    hdMpFenster.hidden = false;
    document.body.classList.add('hd-mp-fenster-an');
    hdMpFensterMalen();
  }
  function hdMpFensterZu() {
    hdMpTouchLos();
    if (hdMpFenster) hdMpFenster.hidden = true;
    document.body.classList.remove('hd-mp-fenster-an');
  }
  function hdMpKopf() {
    const ping = hdMpC.stand && hdMpC.stand.rtt != null ? hdMpC.stand.rtt + ' ms' : '–';
    const gut = hdMpC.verbunden;
    return '<div class="hdmp-kopf"><span class="hdmp-marke">HYBRID-DASH <i>MP</i></span>'
      + '<span class="hdmp-raum">' + mt('Raum') + ' <b>' + hdMpEsc(hdCodeZeigen(hdMpC.code)) + '</b></span>'
      + '<span class="hdmp-verb ' + (gut ? 'an' : 'aus') + '">' + (gut ? mt('verbunden') + ' · ' + ping : mt('nicht verbunden')) + '</span>'
      + '<span class="hdmp-tabs">'
      + ['wahl', 'setup', 'cockpit'].map((a) => '<button type="button" data-mp="ansicht" data-a="' + a + '"' + (hdMpC.ansicht === a ? ' class="an"' : '')
        + ((a !== 'wahl' && !(hdMpC.ich && hdMpC.ich.carId)) ? ' disabled' : '') + '>' + mt(a === 'wahl' ? 'Auto' : a === 'setup' ? 'Abstimmung' : 'Cockpit') + '</button>').join('')
      + '</span><button type="button" class="hdmp-raus" data-mp="raus">' + mt('Verlassen') + '</button></div>';
  }
  let hdMpFensterSchluessel = '';
  function hdMpFensterMalen() {
    if (!hdMpFenster || hdMpFenster.hidden) return;
    // The cockpit stays put while driving: only the header and the readouts change. Redrawing it would replace the
    // pedal under the player's finger (the press would be lost - or, worse, never released).
    const imCockpit = hdMpC.ansicht === 'cockpit' && hdMpC.verbunden && hdMpC.lobby;
    if (imCockpit && document.getElementById('hdmp-cockpit')) {
      const kopf = hdMpFenster.querySelector('.hdmp-kopf');
      if (kopf) kopf.outerHTML = hdMpKopf();
      hdMpCockpitMalen();
      return;
    }
    // Wahl / Abstimmung: redraw only when something on it changed (a lobby every 1.5 s would reset an open list).
    const schluessel = [hdMpC.ansicht, hdMpC.verbunden, hdMpC.status, JSON.stringify(hdMpC.lobby || null)].join('|');
    if (schluessel === hdMpFensterSchluessel && hdMpFenster.firstChild) {
      const kopf = hdMpFenster.querySelector('.hdmp-kopf');
      if (kopf) kopf.outerHTML = hdMpKopf();
      return;
    }
    hdMpFensterSchluessel = schluessel;
    hdMpTouchLos();
    let inhalt = '';
    const st = hdMpC.status ? '<p class="hdmp-status">' + hdMpEsc(hdMpC.status) + '</p>' : '';
    if (!hdMpC.verbunden || !hdMpC.lobby) {
      inhalt = '<div class="hdmp-warten"><div class="hdmp-spinner"></div><h2>' + mt('Verbinde mit dem Host') + '</h2>' + st
        + '<p>' + mt('Host und dieses Gerät müssen im selben WLAN sein. Der Host-Laptop zeigt den Raum im Reiter Mehrspieler.') + '</p></div>';
    } else if (hdMpC.ansicht === 'wahl') {
      const autos = hdMpC.lobby.autos || [];
      inhalt = '<h2>' + mt('Wähle dein Auto') + '</h2>' + st
        + (autos.length ? '<div class="hdmp-autos">' + autos.map((a) => {
          const meins = hdMpC.ich && hdMpC.ich.carId === a.id;
          const belegt = a.belegt && !meins;
          const bild = typeof hdAvatarSvg === 'function' ? hdAvatarSvg(String(a.name || ''), a.hex, a.stil || 0, 96, a.marke || '', Number.isInteger(a.foto) ? a.foto : undefined) : '';
          return '<button type="button" class="hdmp-auto' + (meins ? ' meins' : '') + '" data-mp="wahl" data-id="' + hdMpEsc(a.id) + '"' + (belegt ? ' disabled' : '')
            + ' style="--f:' + hdMpEsc(a.hex) + '"><span class="hdmp-bild">' + bild + '</span>'
            + '<b>' + (a.nummer ? '#' + hdMpEsc(a.nummer) + ' ' : '') + hdMpEsc(a.name) + '</b>'
            + '<span>' + hdMpEsc([a.modell ? mt(a.modell) : '', a.farbe].filter(Boolean).join(' · ')) + '</span>'
            + '<small>' + (meins ? mt('dein Auto') : belegt ? mt('fährt') + ': ' + hdMpEsc(a.belegt) : mt('frei')) + '</small></button>';
        }).join('') + '</div>' : '<p>' + mt('Am Host ist noch kein Auto verbunden.') + '</p>');
    } else if (hdMpC.ansicht === 'setup') {
      const s = (hdMpC.ich && hdMpC.ich.setup) || {};
      const opt = (wert, liste) => liste.map(([k, n]) => '<option value="' + hdMpEsc(k) + '"' + (String(k) === String(wert) ? ' selected' : '') + '>' + hdMpEsc(n) + '</option>').join('');
      const presets = [['', mt('wie der Host')]].concat((hdMpC.lobby.presets || []).map((p) => [p.k, p.n]));
      inhalt = '<h2>' + mt('Abstimmung') + '</h2>' + st + '<div class="hdmp-setup">'
        + '<label><span>' + mt('Fahrgefühl') + '</span><select data-mp="setup" data-f="preset">' + opt(s.preset || '', presets) + '</select></label>'
        + '<label><span>' + mt('Reifen') + '</span><select data-mp="setup" data-f="reifen">' + opt(s.reifen || 'mittel', [['weich', mt('weich')], ['mittel', mt('mittel')], ['hart', mt('hart')], ['regen', mt('Regen')]]) + '</select></label>'
        + '<label><span>' + mt('Tank beim Boxenstopp') + '</span><select data-mp="setup" data-f="tank">' + opt(s.tank || 100, [[100, '100 %'], [75, '75 %'], [50, '50 %'], [25, '25 %']]) + '</select></label>'
        + '</div><p class="hdmp-hinweis">' + mt('Während eines Rennens gilt die Reifenwahl ab dem nächsten Boxenstopp.') + '</p>'
        + '<button type="button" class="hdmp-gross" data-mp="ansicht" data-a="cockpit">' + mt('Zum Cockpit') + ' →</button>';
    } else {
      inhalt = '<div class="hdmp-cockpit" id="hdmp-cockpit"></div>' + hdMpTouchHtml();
    }
    hdMpFenster.innerHTML = '<div class="hdmp-rahmen">' + hdMpKopf() + '<div class="hdmp-inhalt">' + inhalt + '</div></div>';
    if (hdMpC.ansicht === 'cockpit') { hdMpCockpitMalen(); hdMpTouchAnbinden(); }
  }
  function hdMpCockpitMalen() {
    const el = document.getElementById('hdmp-cockpit');
    if (!el) return;
    const s = hdMpC.stand || {};
    const alt = performance.now() - hdMpC.letzteZeit > 1500;
    const zustand = { idle: mt('Warten auf den Start'), countdown: mt('Ampel!'), racing: s.sc ? mt('SAFETY CAR') : mt('Rennen läuft'), finishing: mt('Letzte Runde'), finished: mt('Ziel') }[s.rennen] || '';
    const balken = (wert, farbe) => '<span class="hdmp-balken"><i style="width:' + Math.max(0, Math.min(100, wert || 0)) + '%;background:' + farbe + '"></i></span>';
    el.innerHTML = '<div class="hdmp-band' + (s.sc ? ' sc' : '') + '">' + hdMpEsc(zustand) + (alt ? ' · ' + mt('keine Daten') : '') + '</div>'
      + '<div class="hdmp-cp-gitter">'
      + '<div class="hdmp-pos"><small>' + mt('Position') + '</small><b>' + (s.pos ? 'P' + s.pos : '–') + '</b><span>/ ' + (s.von || '–') + '</span></div>'
      + '<div class="hdmp-gang"><b>' + hdMpEsc(s.gang || 'N') + '</b><span>' + (s.kmh || 0) + ' km/h</span>' + balken(s.drehzahl, 'linear-gradient(90deg,#3ddc84,#e8c72a 70%,#e10632)') + '</div>'
      + '<div class="hdmp-runde"><small>' + mt('Runde') + '</small><b>' + (s.runde || 0) + (s.modus === 'laps' && s.limit ? '<span>/' + s.limit + '</span>' : '') + '</b>'
      + '<span>' + mt('Letzte') + ' ' + hdMpZeit(s.letzte) + '</span><span class="beste">' + mt('Beste') + ' ' + hdMpZeit(s.beste) + '</span></div>'
      + '</div><div class="hdmp-werte">'
      + '<span>' + mt('Tank') + ' ' + (s.tank ?? '–') + ' %' + balken(s.tank, '#3ddc84') + '</span>'
      + '<span>' + mt('Schaden') + ' ' + (s.schaden ?? '–') + ' %' + balken(s.schaden, '#e10632') + '</span>'
      + '<span>' + mt('Akku') + ' ' + (s.akku != null ? s.akku + ' %' : '–') + balken(s.akku, '#3b7fe2') + '</span>'
      + '<span>' + mt('Reifen') + ' ' + hdMpEsc(mt(s.reifen || 'mittel')) + '</span></div>'
      + (Array.isArray(s.feld) && s.feld.length ? '<ol class="hdmp-feld">' + s.feld.map((x) => '<li' + (x.ich ? ' class="ich"' : '') + '><b>' + x.p + '</b><i style="background:' + hdMpEsc(x.h || '#888') + '"></i>' + hdMpEsc(x.n) + '<span>' + x.r + '</span></li>').join('') + '</ol>' : '');
  }
  function hdMpTouchLos() { const tc = hdMpC.touch; tc.gas = 0; tc.bremse = 0; tc.lenk = 0; tc.knoepfe = {}; }
  // Touch controls (phones): steering left / right, brake, throttle, shift down / up, lights, pit.
  function hdMpTouchHtml() {
    return '<div class="hdmp-touch" aria-label="' + mt('Touch-Steuerung') + '">'
      + '<div class="hdmp-t-links"><button type="button" data-tl="-1">◀</button><button type="button" data-tl="1">▶</button></div>'
      + '<div class="hdmp-t-mitte"><button type="button" data-tk="2">' + mt('Runter') + '</button><button type="button" data-tk="1">' + mt('Hoch') + '</button>'
      + '<button type="button" data-tk="3">' + mt('Licht') + '</button><button type="button" data-tk="0">' + mt('Box') + '</button></div>'
      + '<div class="hdmp-t-rechts"><button type="button" data-tb="1">' + mt('Bremse') + '</button><div class="hdmp-gas" data-tg="1"><i></i><span>' + mt('Gas') + '</span></div></div></div>';
  }
  function hdMpTouchAnbinden() {
    const box = hdMpFenster && hdMpFenster.querySelector('.hdmp-touch');
    if (!box) return;
    const tc = hdMpC.touch;
    const halt = (el, an, aus) => {
      const ein = (e) => { e.preventDefault(); an(e); el.classList.add('an'); };
      const los = (e) => { e.preventDefault(); aus(e); el.classList.remove('an'); };
      el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ } ein(e); });
      el.addEventListener('pointerup', los); el.addEventListener('pointercancel', los); el.addEventListener('lostpointercapture', los);
    };
    box.querySelectorAll('[data-tl]').forEach((b) => halt(b, () => { tc.lenk = Number(b.dataset.tl); }, () => { tc.lenk = 0; }));
    box.querySelectorAll('[data-tk]').forEach((b) => halt(b, () => { tc.knoepfe[b.dataset.tk] = true; }, () => { tc.knoepfe[b.dataset.tk] = false; }));
    box.querySelectorAll('[data-tb]').forEach((b) => halt(b, () => { tc.bremse = 1; }, () => { tc.bremse = 0; }));
    // Throttle: how far up the finger is on the pedal, 0 at the bottom, 1 at the top.
    const gas = box.querySelector('[data-tg]');
    if (gas) {
      const stellen = (e) => {
        const r = gas.getBoundingClientRect();
        tc.gas = Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height));
        const i = gas.querySelector('i'); if (i) i.style.height = Math.round(tc.gas * 100) + '%';
      };
      halt(gas, stellen, () => { tc.gas = 0; const i = gas.querySelector('i'); if (i) i.style.height = '0%'; });
      gas.addEventListener('pointermove', (e) => { if (gas.classList.contains('an')) stellen(e); });
    }
  }
  function hdMpFensterKlick(e) {
    const b = e.target.closest('[data-mp]');
    if (!b) return;
    const was = b.dataset.mp;
    if (was === 'raus') { if (window.confirm(mt('Mehrspieler verlassen? Dein Auto wird freigegeben.'))) hdMpClientStoppen(false); return; }
    if (was === 'ansicht') { hdMpC.ansicht = b.dataset.a; hdMpFensterMalen(); return; }
    if (was === 'wahl' && hdMpC.ctl) { hdMpC.status = mt('Frage den Host …'); hdMpC.ctl.send(JSON.stringify({ t: 'wahl', carId: b.dataset.id })); hdMpFensterMalen(); }
  }
  function hdMpFensterAenderung(e) {
    const el = e.target.closest('[data-mp="setup"]');
    if (!el || !hdMpC.ctl) return;
    const s = Object.assign({}, (hdMpC.ich && hdMpC.ich.setup) || {});
    s[el.dataset.f] = el.dataset.f === 'tank' ? Number(el.value) : el.value;
    if (hdMpC.ich) hdMpC.ich.setup = s;
    hdMpC.ctl.send(JSON.stringify(Object.assign({ t: 'setup' }, s)));
  }

  // =====================================================================================
  // The Multiplayer tab (#tab-hdmp): host card and join card
  // =====================================================================================
  function hdMpMalen() {
    const host = document.getElementById('hdmp-host');
    const join = document.getElementById('hdmp-join');
    if (!host || !join) return;
    if (!hdMpH.aktiv) {
      host.innerHTML = '<p>' + mt('Dieser Laptop ist mit den Autos verbunden und lädt Mitspieler ein. Sie fahren mit ihrem Handy oder Laptop.') + '</p>'
        + '<button type="button" class="primary hdmp-gross" data-mph="start">' + mt('Raum öffnen') + '</button>';
    } else {
      const liste = [...hdMpH.spieler.values()];
      const link = hdMpLink();
      host.innerHTML = '<div class="hdmp-code"><small>' + mt('Raumcode') + '</small><b>' + hdMpEsc(hdCodeZeigen(hdMpH.code)) + '</b></div>'
        + '<p class="hdmp-link"><span>' + hdMpEsc(link) + '</span><button type="button" data-mph="kopieren">' + mt('Link kopieren') + '</button></p>'
        + (hdMpH.status ? '<p class="hdmp-status">' + hdMpEsc(hdMpH.status) + '</p>' : '')
        + '<h3>' + mt('Mitspieler') + ' (' + liste.length + ')</h3>'
        + (liste.length ? '<ul class="hdmp-liste">' + liste.map((s) => {
          const car = s.carId ? hdMpAutoVon(s.carId) : null;
          const offen = s.ctl && s.ctl.readyState === 'open';
          return '<li><b>' + hdMpEsc(s.name) + '</b><span>' + (car ? hdMpEsc(garageLabel(car)) + ' · P' + s.slot : mt('wählt ein Auto')) + '</span>'
            + '<span class="hdmp-mess">' + (offen ? (s.rtt != null ? s.rtt + ' ms' : '…') + ' · ' + s.rate + '/s' : mt('verbindet …')) + '</span>'
            + '<button type="button" data-mph="kick" data-cid="' + hdMpEsc(s.cid) + '">' + mt('Entfernen') + '</button></li>';
        }).join('') + '</ul>' : '<p class="muted">' + mt('Noch niemand da. Mitspieler öffnen den Link oder geben den Code im Reiter Mehrspieler ein.') + '</p>')
        + '<button type="button" data-mph="stopp">' + mt('Raum schließen') + '</button>';
    }
    if (hdMpC.aktiv) {
      join.innerHTML = '<p>' + mt('Verbunden mit Raum') + ' <b>' + hdMpEsc(hdCodeZeigen(hdMpC.code)) + '</b>.</p>'
        + '<button type="button" class="primary hdmp-gross" data-mph="fenster">' + mt('Mehrspieler-Fenster öffnen') + '</button>';
    } else {
      let gemerkt = {};
      try { gemerkt = JSON.parse(localStorage.getItem(HD_MP_CLIENT_STORE) || '{}') || {}; } catch (e) { gemerkt = {}; }
      const altName = join.querySelector('#hdmp-name'), altCode = join.querySelector('#hdmp-code');
      const name = altName ? altName.value : (gemerkt.name || '');
      const code = altCode ? altCode.value : (gemerkt.code ? hdCodeZeigen(gemerkt.code) : '');
      join.innerHTML = '<p>' + mt('Mit dem Handy oder einem zweiten Laptop mitfahren: Code vom Host eingeben.') + '</p>'
        + '<label class="hdmp-feld-ein"><span>' + mt('Dein Name') + '</span><input id="hdmp-name" type="text" maxlength="24" autocomplete="nickname" value="' + hdMpEsc(name) + '"></label>'
        + '<label class="hdmp-feld-ein"><span>' + mt('Raumcode') + '</span><input id="hdmp-code" type="text" maxlength="7" autocapitalize="characters" placeholder="K7Q-2XM" value="' + hdMpEsc(code) + '"></label>'
        + '<button type="button" class="primary hdmp-gross" data-mph="join">' + mt('Beitreten') + '</button>';
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-mph]');
    if (!b) return;
    const was = b.dataset.mph;
    if (was === 'start') hdMpHostStarten();
    else if (was === 'stopp') { if (window.confirm(mt('Raum schließen? Alle Mitspieler werden getrennt und ihre Autos halten an.'))) hdMpHostStoppen(false); }
    else if (was === 'kick') hdMpKick(b.dataset.cid);
    else if (was === 'kopieren') { try { navigator.clipboard.writeText(hdMpLink()); showHudToast(mt('Link kopiert')); } catch (err) { /* no clipboard */ } }
    else if (was === 'fenster') hdMpFensterAuf();
    else if (was === 'join') {
      try { hdMpClientStarten(($('hdmp-code') || {}).value, ($('hdmp-name') || {}).value); }
      catch (err) { showHudToast(err.message); }
    }
  });
  // Escape closes the player window (it stays connected; the tab reopens it).
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdMpFenster && !hdMpFenster.hidden) { e.preventDefault(); hdMpFensterZu(); hdMpMalen(); } }, true);

  // Start-up: a host keeps its room over a reload; a link with ?mp=CODE joins straight away.
  setTimeout(() => {
    try {
      const h = JSON.parse(localStorage.getItem(HD_MP_HOST_STORE) || 'null');
      if (h && h.code) hdMpHostStarten(h.code);
    } catch (e) { /* none */ }
    try {
      const q = new URLSearchParams(location.search).get('mp');
      if (q) {
        let name = '';
        try { name = (JSON.parse(localStorage.getItem(HD_MP_CLIENT_STORE) || '{}') || {}).name || ''; } catch (e) { name = ''; }
        if (typeof showTab === 'function') showTab('hdmp');
        if (name) hdMpClientStarten(q, name);
        else { hdMpMalen(); const c = $('hdmp-code'); if (c) c.value = hdCodeZeigen(hdCodeNorm(q)); const n = $('hdmp-name'); if (n) n.focus(); }
      }
    } catch (e) { /* bad link */ }
    hdMpMalen();
  }, 0);
  if (typeof i18nOnLangChange === 'function') i18nOnLangChange(() => { hdMpMalen(); hdMpFensterMalen(); });

  window.HYBRIDDASH_MP = Object.freeze({
    host: { starten: hdMpHostStarten, stoppen: hdMpHostStoppen, zustand: () => ({ aktiv: hdMpH.aktiv, code: hdMpH.code, spieler: [...hdMpH.spieler.values()].map((s) => ({ name: s.name, slot: s.slot, carId: s.carId, rtt: s.rtt })) }), lobby: hdMpLobby },
    client: { starten: hdMpClientStarten, stoppen: hdMpClientStoppen, zustand: () => ({ aktiv: hdMpC.aktiv, verbunden: hdMpC.verbunden, ich: hdMpC.ich, ansicht: hdMpC.ansicht, stand: hdMpC.stand }) },
    fenster: { auf: hdMpFensterAuf, zu: hdMpFensterZu },
    _pad: { packen: hdMpPadPacken, fuer: hdMpPadFuer, slot: (nr) => { const z = zusatzPlatz(nr); return z ? { throttle: z.throttle, steer: z.steer, car: z.car ? String(z.car.device.id) : null } : null; } },
  });
