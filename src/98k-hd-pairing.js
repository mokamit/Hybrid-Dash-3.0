  // =========================================================================
  // HybridDash 2.1: QUICK PAIRING for two-laptop mode (short code + auto-reconnect)
  // =========================================================================
  //
  // REPORTED: "The pairing codes work, but is there a better system to link the laptops? The
  // process was cumbersome." The manual way (98j-hd-relay.js) copies two long codes across.
  // Here the host shows a short code (e.g. K7Q-2XM), the helper types it once, and from then on
  // both laptops find each other by themselves - after a reload, a dropped link or the next
  // race night.
  //
  // HOW: a browser page cannot find another one on the network, so the two laptops meet in a
  // Supabase Realtime broadcast channel (project "HybridDash", the owner's account). The channel
  // only carries the WebRTC handshake (offer/answer). The car packets still go laptop to laptop
  // over the local Wi-Fi data channel, exactly as before - nothing about the race goes online.
  //
  // PRIVACY: the channel name is a hash of the code, and every message in it is AES-GCM
  // encrypted with a key derived from the code. Someone without the code sees neither who
  // pairs nor what is sent. The WebRTC link itself is LAN only (no STUN/TURN) and DTLS-encrypted.
  //
  // The protocol is Supabase Realtime's Phoenix websocket protocol (vsn 1.0.0): phx_join on
  // "realtime:<topic>", heartbeat on "phoenix" every 25 s, and "broadcast" messages with
  // { type: 'broadcast', event, payload }. Written by hand (about 80 lines) instead of loading
  // supabase-js, so the app keeps working from file:// and offline.
  //
  // Override for tests: localStorage 'hybriddash.signal' = {"url": "...", "key": "..."}.

  const HD_SIGNAL_VORGABE = {
    url: 'wss://rvfjuwkmqwixwaahjfbz.supabase.co/realtime/v1/websocket',
    // Public client key (anon). Safe to ship: it only allows what Realtime allows anonymously.
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Zmp1d2ttcXdpeHdhYWhqZmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MDU4MTAsImV4cCI6MjEwOTM4MTgxMH0.ULrOdj67OZ9Onmz6ohYg-62G7UYyF807RfiDmk1jGG4',
  };
  const HD_PAAR_STORE = 'hybriddash.paar.v1';
  const HD_PAAR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const HD_HALLO_MS = 2500;

  function hdSignal() {
    try { return Object.assign({}, HD_SIGNAL_VORGABE, JSON.parse(localStorage.getItem('hybriddash.signal') || '{}')); }
    catch (e) { return HD_SIGNAL_VORGABE; }
  }
  const hdPaar = {
    code: null, rolle: null, aktiv: false,
    ws: null, topic: null, schluessel: null, beigetreten: false,
    ref: 1, hbUhr: null, halloUhr: null, neuUhr: null, neuVersuche: 0,
    id: Math.random().toString(36).slice(2, 10),
    angebotId: null, angebotAt: 0, status: '',
  };

  function hdPaarLaden() {
    try { return JSON.parse(localStorage.getItem(HD_PAAR_STORE) || 'null'); } catch (e) { return null; }
  }
  function hdPaarMerken() {
    try {
      if (hdPaar.code && hdPaar.rolle) localStorage.setItem(HD_PAAR_STORE, JSON.stringify({ code: hdPaar.code, rolle: hdPaar.rolle }));
      else localStorage.removeItem(HD_PAAR_STORE);
    } catch (e) { /* private mode */ }
  }
  function hdCodeNeu() {
    const z = new Uint8Array(6); crypto.getRandomValues(z);
    return Array.from(z, (b) => HD_PAAR_ALPHABET[b % HD_PAAR_ALPHABET.length]).join('');
  }
  function hdCodeNorm(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function hdCodeZeigen(c) { return c ? c.slice(0, 3) + '-' + c.slice(3) : ''; }

  // ---- crypto: topic hash and message key from the code -----------------------------------
  async function hdSha(text) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  }
  const hdHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const hdB64 = (b) => { let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
  const hdUnB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function hdPaarSchluessel(code) {
    const roh = await hdSha('hybriddash-pair-key:' + code);
    return crypto.subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function hdVerschluesseln(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const d = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, hdPaar.schluessel, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv: hdB64(iv), d: hdB64(new Uint8Array(d)) };
  }
  async function hdEntschluesseln(p) {
    const d = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hdUnB64(p.iv) }, hdPaar.schluessel, hdUnB64(p.d));
    return JSON.parse(new TextDecoder().decode(d));
  }

  // ---- the Realtime websocket -------------------------------------------------------------
  function hdPaarStatus(s) { hdPaar.status = s; const el = $('hdr-paar-status'); if (el) el.textContent = s; if (typeof hdRelayMalen === 'function') hdRelayMalen(); }
  function hdWsSenden(o) {
    if (hdPaar.ws && hdPaar.ws.readyState === 1) { o.ref = String(hdPaar.ref++); hdPaar.ws.send(JSON.stringify(o)); return true; }
    return false;
  }
  async function hdSignalSenden(obj) {
    if (!hdPaar.beigetreten) return false;
    const payload = await hdVerschluesseln(Object.assign({ von: hdPaar.id, rolle: hdPaar.rolle }, obj));
    return hdWsSenden({ topic: hdPaar.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'hd', payload } });
  }
  function hdWsVerbinden() {
    if (!hdPaar.aktiv) return;
    const sig = hdSignal();
    let ws;
    try { ws = new WebSocket(sig.url + '?apikey=' + encodeURIComponent(sig.key) + '&vsn=1.0.0'); }
    catch (e) { hdPaarStatus('⚠ Cannot reach the pairing service: ' + e.message); return hdWsSpaeter(); }
    hdPaar.ws = ws; hdPaar.beigetreten = false;
    ws.onopen = () => {
      hdPaar.neuVersuche = 0;
      hdWsSenden({ topic: hdPaar.topic, event: 'phx_join', join_ref: '1',
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: sig.key } });
      clearInterval(hdPaar.hbUhr);
      hdPaar.hbUhr = setInterval(() => hdWsSenden({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.topic !== hdPaar.topic) return;
      if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !hdPaar.beigetreten) {
        hdPaar.beigetreten = true;
        hdPaarStatus(hdPaar.rolle === 'host' ? 'Waiting for the helper laptop … (code ' + hdCodeZeigen(hdPaar.code) + ')' : 'Looking for the host laptop …');
        hdHalloSenden();
      } else if (m.event === 'phx_reply' && m.payload && m.payload.status === 'error') {
        hdPaarStatus('⚠ Pairing service refused: ' + JSON.stringify(m.payload.response || {}));
      } else if (m.event === 'broadcast' && m.payload && m.payload.event === 'hd') {
        hdEntschluesseln(m.payload.payload).then(hdSignalEmpfangen).catch(() => { /* other code or garbage */ });
      }
    };
    ws.onclose = () => {
      if (hdPaar.ws !== ws) return;
      hdPaar.beigetreten = false; clearInterval(hdPaar.hbUhr);
      if (hdPaar.aktiv) { hdPaarStatus(hdRelay.offen ? hdPaar.status : 'Pairing service offline – retrying …'); hdWsSpaeter(); }
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  function hdWsSpaeter() {
    clearTimeout(hdPaar.neuUhr);
    const ms = Math.min(30000, 2000 * Math.pow(2, hdPaar.neuVersuche++));
    hdPaar.neuUhr = setTimeout(hdWsVerbinden, ms);
  }

  // ---- the handshake ----------------------------------------------------------------------
  // Both sides say "hallo" every HD_HALLO_MS while not linked. The HOST answers a helper's hallo
  // with an offer; the helper answers the offer. One offer at a time (angebotId), and a new one
  // after 10 s if nothing came back.
  function hdHalloSenden() { if (!hdRelay.offen) hdSignalSenden({ t: 'hallo' }); }
  async function hdSignalEmpfangen(m) {
    if (!m || m.von === hdPaar.id) return;
    if (hdPaar.rolle === 'host') {
      if (m.t === 'hallo' && m.rolle === 'helper' && !hdRelay.offen
          && (!hdPaar.angebotId || performance.now() - hdPaar.angebotAt > 10000)) {
        await hdPaarAngebot(m.von);
      } else if (m.t === 'answer' && m.id === hdPaar.angebotId && hdRelay.pc) {
        try { await hdRelay.pc.setRemoteDescription(m.sdp); hdPaarStatus('Connecting to the helper laptop …'); }
        catch (e) { hdPaarStatus('⚠ ' + e.message); }
      }
    } else if (hdPaar.rolle === 'helper') {
      if (m.t === 'hallo' && m.rolle === 'host' && !hdRelay.offen) hdHalloSenden();
      else if (m.t === 'offer' && (!m.an || m.an === hdPaar.id)) await hdPaarAntwort(m);
    }
  }
  async function hdPaarAngebot(helperId) {
    hdRelay.rolle = 'host';
    const pc = hdRelayNeu();
    hdKanalAnbinden(pc.createDataChannel('hd-ctl', { ordered: true }));
    hdKanalAnbinden(pc.createDataChannel('hd-io', { ordered: true }));
    hdPaar.angebotId = Math.random().toString(36).slice(2, 10);
    hdPaar.angebotAt = performance.now();
    await pc.setLocalDescription(await pc.createOffer());
    await hdIceFertig(pc);
    if (pc !== hdRelay.pc) return;
    hdPaarStatus('Helper found – connecting …');
    hdSignalSenden({ t: 'offer', id: hdPaar.angebotId, an: helperId, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  }
  async function hdPaarAntwort(m) {
    hdRelay.rolle = 'helper';
    const pc = hdRelayNeu();
    pc.addEventListener('datachannel', (e) => hdKanalAnbinden(e.channel));
    try {
      await pc.setRemoteDescription(m.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await hdIceFertig(pc);
    } catch (e) { hdPaarStatus('⚠ ' + e.message); return; }
    if (pc !== hdRelay.pc) return;
    hdWachhundStarten();
    hdPaarStatus('Host found – connecting …');
    hdSignalSenden({ t: 'answer', id: m.id, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  }

  // ---- start / stop -----------------------------------------------------------------------
  async function hdPaarStarten(rolle, code) {
    hdPaarStoppen(true);
    hdPaar.rolle = rolle; hdPaar.code = hdCodeNorm(code);
    if (hdPaar.code.length !== 6) throw new Error('A pairing code has 6 characters, like K7Q-2XM.');
    hdRelay.rolle = rolle;
    hdPaar.topic = 'realtime:hd-' + hdHex(await hdSha('hybriddash-pair-topic:' + hdPaar.code)).slice(0, 32);
    hdPaar.schluessel = await hdPaarSchluessel(hdPaar.code);
    hdPaar.aktiv = true; hdPaar.angebotId = null; hdPaar.neuVersuche = 0;
    hdPaarMerken();
    if (rolle === 'helper') hdWachhundStarten();
    hdPaarStatus('Connecting to the pairing service …');
    hdWsVerbinden();
    clearInterval(hdPaar.halloUhr);
    hdPaar.halloUhr = setInterval(hdHalloSenden, HD_HALLO_MS);
    hdPaarMalen();
  }
  function hdPaarStoppen(still) {
    hdPaar.aktiv = false;
    clearInterval(hdPaar.halloUhr); clearInterval(hdPaar.hbUhr); clearTimeout(hdPaar.neuUhr);
    const ws = hdPaar.ws; hdPaar.ws = null; hdPaar.beigetreten = false;
    try { if (ws) ws.close(); } catch (e) { /* closed */ }
    if (!still) hdPaarStatus('');
  }
  function hdPaarVergessen() {
    hdPaarStoppen();
    hdPaar.code = null; hdPaar.rolle = null;
    hdPaarMerken();
    hdPaarMalen();
  }
  // v3.0 BESTELLT: "forget pairing on the host laptop in case there is a pairing clash" (two laptops both
  // acting as host, a helper still on an old code, the wrong laptop linked). A clean slate: the remembered code
  // and role are dropped, the pairing service is left, the current link is closed and this laptop is neither
  // host nor helper until you choose again. Pairing again = create a new code and type it on the helper.
  function hdPaarAllesVergessen() {
    hdPaarVergessen();
    try { hdRelaySchliessen(true); } catch (e) { /* not ready */ }
    try { hdRelay.rolle = null; hdRelay.offen = false; } catch (e) { /* not ready */ }
    try { localStorage.removeItem(HD_PAAR_STORE); } catch (e) { /* private */ }
    const box = $('hd-relay'); if (box) delete box.dataset.zeige;
    const ein = $('hdr-paar-eingabe'); if (ein) ein.value = '';
    hdPaarStatus('Pairing forgotten. Choose HOST or HELPER and pair again with a new code.');
    try { hdRelayMalen(); } catch (e) { /* not ready */ }
    hdPaarMalen();
    log('Two-laptop mode: pairing forgotten on this laptop.', 'info');
  }

  // After a reload of a HELPER page, reconnect the cars this laptop had permission for (Chrome
  // remembers the Web Bluetooth permission; getDevices() returns them without the chooser).
  async function hdHelperBekannteVerbinden() {
    const bt = navigator.bluetooth;
    if (!bt || typeof bt.getDevices !== 'function') return 0;
    let n = 0;
    try {
      const liste = (await bt.getDevices()).filter((d) => /^HYBRID/i.test(d.name || ''));
      for (const dev of liste) {
        try {
          await Promise.race([hdHelperGeraet(dev), new Promise((_, nein) => setTimeout(() => nein(new Error('timeout')), 8000))]);
          n++;
        } catch (e) { /* out of range or off */ }
      }
    } catch (e) { /* not allowed */ }
    if (n) hdPaarStatus(hdPaar.status + ' · ' + n + ' car(s) reconnected');
    return n;
  }

  // ---- UI ---------------------------------------------------------------------------------
  function hdPaarMalen() {
    const hc = $('hdr-paar-code');
    if (hc) hc.textContent = hdPaar.rolle === 'host' && hdPaar.code ? hdCodeZeigen(hdPaar.code) : '——';
    const vg = $('hdr-paar-vergessen');
    if (vg) vg.hidden = !(hdPaar.code || hdRelay.rolle);
    const st = $('hdr-paar-status');
    if (st) st.textContent = hdPaar.status;
    const ein = $('hdr-paar-eingabe');
    if (ein && hdPaar.rolle === 'helper' && hdPaar.code && !ein.value) ein.value = hdCodeZeigen(hdPaar.code);
  }
  (function hdPaarAnbinden() {
    const an = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    const fehler = (e) => hdPaarStatus('⚠ ' + ((e && e.message) || e));
    an('hdr-paar-host', () => {
      const alt = hdPaarLaden();
      const code = alt && alt.rolle === 'host' && alt.code ? alt.code : hdCodeNeu();
      hdPaarStarten('host', code).catch(fehler);
    });
    an('hdr-paar-neu', () => hdPaarStarten('host', hdCodeNeu()).catch(fehler));
    an('hdr-paar-helper', () => hdPaarStarten('helper', ($('hdr-paar-eingabe') || {}).value).catch(fehler));
    const ein = $('hdr-paar-eingabe');
    if (ein) ein.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('hdr-paar-helper').click(); } });
    const vergessenFragen = () => {
      if (window.confirm('Forget the pairing on this laptop?\n\nThe link closes and the saved code is deleted. To pair again, create a new code here and type it on the helper laptop.')) hdPaarAllesVergessen();
    };
    an('hdr-paar-vergessen', vergessenFragen);
    an('hdr-paar-vergessen-host', vergessenFragen);
    an('hdr-helper-bekannte', () => hdHelperBekannteVerbinden());
    // Unlink also stops the automatic reconnect (the code stays remembered for "Reconnect").
    an('hdr-trennen', () => { hdPaarStoppen(); hdPaarStatus('Unlinked. Press Pair / Create code to link again.'); });
    // Auto-resume a remembered pairing.
    const merk = hdPaarLaden();
    if (merk && merk.code && (merk.rolle === 'host' || merk.rolle === 'helper')) {
      if (merk.rolle === 'helper' && typeof hdRelayOeffnen === 'function' && document.body.classList.contains('hd-helper-seite')) hdRelayOeffnen('helper');
      const box = $('hd-relay'); if (box && !box.dataset.zeige) box.dataset.zeige = merk.rolle;
      hdPaarStarten(merk.rolle, merk.code).then(() => {
        if (merk.rolle === 'helper') hdHelperBekannteVerbinden();
      }).catch(() => {});
    }
    hdPaarMalen();
  })();

  window.HYBRIDDASH_PAAR = Object.freeze({
    starten: hdPaarStarten, stoppen: () => hdPaarStoppen(), vergessen: hdPaarVergessen, allesVergessen: hdPaarAllesVergessen, neuerCode: hdCodeNeu,
    status: () => ({ code: hdPaar.code, rolle: hdPaar.rolle, aktiv: hdPaar.aktiv, beigetreten: hdPaar.beigetreten,
                     status: hdPaar.status, topic: hdPaar.topic }),
  });
