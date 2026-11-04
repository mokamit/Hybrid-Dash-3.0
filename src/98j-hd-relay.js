  // =========================================================================
  // HybridDash 2.0: TWO-LAPTOP MODE (Bluetooth relay)
  // =========================================================================
  //
  // One laptop has only so many Bluetooth connections. Two-laptop mode splits them:
  //
  //   HOST (laptop A)    runs the race as usual: race control, timing, standings, NPC
  //                      drivers, your own car and the dashboard.
  //   HELPER (laptop B)  connects the remaining cars over ITS OWN Bluetooth and only passes
  //                      packets back and forth over Wi-Fi. It drives nothing and times
  //                      nothing.
  //
  // ---- HOW THE HOST SEES A HELPER CAR -----------------------------------------------------
  //
  // Exactly the way the Android bridge (05-app-bruecke.js) works: the rest of the app talks
  // Web Bluetooth (device.gatt.connect, getPrimaryService, getCharacteristic,
  // writeValueWithoutResponse, characteristicvaluechanged, gattserverdisconnected). For
  // every helper car the host builds a stand-in device with that same surface, whose writes
  // go over the link and whose notifications come back over it. It is handed to the normal
  // garageGeraetAufnehmen(), so the car gets a garage card, a role, a colour, NPC driving,
  // lap timing and standings like any other car. Nothing else in the app knows.
  //
  // ---- THE LINK ---------------------------------------------------------------------------
  //
  // A WebRTC data channel, laptop to laptop on the same Wi-Fi. No server and no install: it
  // works from the published page (GitHub Pages) on both laptops. Pairing is a one-time code
  // exchange (host code -> helper, answer code -> host), because a browser page cannot find
  // another one on the network by itself. No STUN/TURN servers: LAN only, nothing leaves the
  // network.
  //
  // Two channels: 'hd-ctl' (JSON: car list, pings) and 'hd-io' (binary packets). Both are
  // ordered and reliable: a lost "stop" packet must never leave a car driving. The helper
  // keeps only the newest pending packet per car (latest wins), so a hiccup on the link never
  // builds a backlog of stale steering commands.
  //
  // ---- SAFETY -----------------------------------------------------------------------------
  //
  // The host pings every 400 ms. If the helper hears nothing for HD_RELAY_STILL_MS, or the
  // link closes, it sends every car a stop packet (zero throttle, zero steering) and keeps
  // doing so until the link is back.
  //
  //   io packet:  [type u8][car key u8][payload ...]   type 1 = write (host -> helper)
  //                                                    type 2 = notify (helper -> host)

  const HD_RELAY_STILL_MS = 1200;
  const HD_RELAY_PING_MS = 400;
  const HD_RELAY_ID = 'relay-';           // prefix of a helper car's device id on the host

  const hdRelay = {
    rolle: null,          // null | 'host' | 'helper'
    pc: null, ctl: null, io: null,
    offen: false,         // both channels open
    zuletztGehoert: 0,    // performance.now() of the last message from the other side
    status: '',
    fremd: new Map(),     // host: car key -> stand-in device
    eigen: new Map(),     // helper: car key -> { dev, rx, tx, name, id, pending, schreibt, n }
    naechsterKey: 1,
    pingUhr: null, wachUhr: null,
    gesendet: 0, empfangen: 0,
  };

  // ---- pairing codes ----------------------------------------------------------------------
  // The SDP is deflated and base64url-encoded, so a code is a few hundred characters.
  async function hdCodeAus(art, beschreibung) {
    const roh = new TextEncoder().encode(JSON.stringify({ t: beschreibung.type, s: beschreibung.sdp }));
    let bytes = roh;
    if (typeof CompressionStream === 'function') {
      const s = new Blob([roh]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(s).arrayBuffer());
    }
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'HD' + art + (typeof CompressionStream === 'function' ? 'z' : 'r') + '.' + b64;
  }
  async function hdCodeEin(code, art) {
    const s = String(code || '').trim().replace(/\s+/g, '');
    const m = /^HD([AB])([zr])\.([A-Za-z0-9_-]+)$/.exec(s);
    if (!m) throw new Error('That is not a HybridDash pairing code.');
    if (m[1] !== art) throw new Error(art === 'A' ? 'This is a helper answer code - paste it on the HOST.' : 'This is a host code - paste it on the HELPER.');
    const b64 = m[3].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (m[2] === 'z') {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(st).arrayBuffer());
    }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return { type: o.t, sdp: o.s };
  }
  function hdIceFertig(pc) {
    return new Promise((fertig) => {
      if (pc.iceGatheringState === 'complete') return fertig();
      const uhr = setTimeout(fertig, 3000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(uhr); fertig(); }
      });
    });
  }

  // ---- the connection ---------------------------------------------------------------------
  function hdRelayNeu() {
    hdRelaySchliessen(true);
    const pc = new RTCPeerConnection({ iceServers: [] });
    hdRelay.pc = pc;
    pc.addEventListener('connectionstatechange', () => {
      if (pc !== hdRelay.pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        hdRelayZu(pc.connectionState === 'disconnected' ? 'Link interrupted.' : 'Link closed.');
      }
    });
    return pc;
  }
  function hdKanalAnbinden(kanal) {
    kanal.binaryType = 'arraybuffer';
    if (kanal.label === 'hd-ctl') hdRelay.ctl = kanal; else hdRelay.io = kanal;
    kanal.addEventListener('open', hdRelayOffenPruefen);
    kanal.addEventListener('close', () => { if (hdRelay.ctl === kanal || hdRelay.io === kanal) hdRelayZu('Link closed.'); });
    kanal.addEventListener('message', (e) => {
      hdRelay.zuletztGehoert = performance.now();
      if (kanal.label === 'hd-ctl') hdCtlEmpfangen(JSON.parse(e.data));
      else hdIoEmpfangen(new Uint8Array(e.data));
    });
  }
  function hdRelayOffenPruefen() {
    if (!hdRelay.ctl || !hdRelay.io || hdRelay.ctl.readyState !== 'open' || hdRelay.io.readyState !== 'open') return;
    if (hdRelay.offen) return;
    hdRelay.offen = true;
    hdRelay.zuletztGehoert = performance.now();
    hdStatus(hdRelay.rolle === 'host' ? 'Linked to helper laptop.' : 'Linked to host laptop.');
    log('HybridDash two-laptop mode: link open (' + hdRelay.rolle + ').', 'info');
    if (hdRelay.rolle === 'host') {
      hdCtl({ t: 'hallo', v: 1 });
      clearInterval(hdRelay.pingUhr);
      hdRelay.pingUhr = setInterval(() => hdCtl({ t: 'ping' }), HD_RELAY_PING_MS);
    } else {
      hdCtl({ t: 'hallo', v: 1 });
      hdRelay.eigen.forEach((e, k) => hdCtl({ t: 'auto', k, id: e.id, name: e.name }));
    }
    hdRelayMalen();
  }
  function hdRelayZu(grund) {
    const war = hdRelay.offen;
    hdRelay.offen = false;
    clearInterval(hdRelay.pingUhr); hdRelay.pingUhr = null;
    if (hdRelay.rolle === 'helper') hdAlleAnhalten();
    if (hdRelay.rolle === 'host') hdRelay.fremd.forEach((d) => d._weg());
    if (war) {
      const auto = typeof hdPaar !== 'undefined' && hdPaar.aktiv;
      hdStatus(grund + (auto ? ' Reconnecting automatically …' : ' Pair again to continue.'));
      log('HybridDash two-laptop mode: ' + grund, 'warn');
    }
    hdRelayMalen();
  }
  function hdRelaySchliessen(still) {
    const pc = hdRelay.pc;
    hdRelay.pc = null;
    try { if (hdRelay.ctl) hdRelay.ctl.close(); } catch (e) { /* closed */ }
    try { if (hdRelay.io) hdRelay.io.close(); } catch (e) { /* closed */ }
    hdRelay.ctl = null; hdRelay.io = null;
    try { if (pc) pc.close(); } catch (e) { /* closed */ }
    if (!still) hdRelayZu('Link closed.');
  }
  function hdCtl(o) {
    if (hdRelay.ctl && hdRelay.ctl.readyState === 'open') hdRelay.ctl.send(JSON.stringify(o));
  }
  function hdIo(typ, k, daten) {
    const io = hdRelay.io;
    if (!io || io.readyState !== 'open') return false;
    const quelle = daten instanceof ArrayBuffer ? new Uint8Array(daten)
      : new Uint8Array(daten.buffer, daten.byteOffset || 0, daten.byteLength);
    const p = new Uint8Array(quelle.length + 2);
    p[0] = typ; p[1] = k; p.set(quelle, 2);
    io.send(p.buffer);
    hdRelay.gesendet++;
    return true;
  }

  // HOST step 1: make the code for the helper.
  async function hdHostStart() {
    hdRelay.rolle = 'host';
    const pc = hdRelayNeu();
    hdKanalAnbinden(pc.createDataChannel('hd-ctl', { ordered: true }));
    hdKanalAnbinden(pc.createDataChannel('hd-io', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await hdIceFertig(pc);
    hdStatus('Step 2: paste this code on the helper laptop, then paste its answer below.');
    return hdCodeAus('A', pc.localDescription);
  }
  // HOST step 2: take the helper's answer.
  async function hdHostAntwort(code) {
    if (!hdRelay.pc || hdRelay.rolle !== 'host') throw new Error('Create a host code first.');
    await hdRelay.pc.setRemoteDescription(await hdCodeEin(code, 'B'));
    hdStatus('Connecting …');
  }
  // HELPER: take the host code, make the answer.
  async function hdHelperStart(code) {
    hdRelay.rolle = 'helper';
    const angebot = await hdCodeEin(code, 'A');
    const pc = hdRelayNeu();
    pc.addEventListener('datachannel', (e) => hdKanalAnbinden(e.channel));
    await pc.setRemoteDescription(angebot);
    await pc.setLocalDescription(await pc.createAnswer());
    await hdIceFertig(pc);
    hdStatus('Paste this answer code on the host laptop.');
    hdWachhundStarten();
    return hdCodeAus('B', pc.localDescription);
  }

  function hdCtlEmpfangen(m) {
    if (!m || typeof m !== 'object') return;
    if (hdRelay.rolle === 'host') {
      if (m.t === 'auto') hdFremdesAuto(m.k, m.id, m.name);
      else if (m.t === 'weg') { const d = hdRelay.fremd.get(m.k); if (d) d._weg(); }
    } else if (hdRelay.rolle === 'helper') {
      if (m.t === 'trennen') { /* the host removed the car from its garage: stay connected, stop it */ hdAnhalten(m.k); }
    }
    hdRelayMalen();
  }
  function hdIoEmpfangen(p) {
    if (p.length < 2) return;
    hdRelay.empfangen++;
    const typ = p[0], k = p[1], daten = p.subarray(2);
    if (typ === 1 && hdRelay.rolle === 'helper') hdHelperSchreiben(k, daten.slice());
    else if (typ === 2 && hdRelay.rolle === 'host') {
      const d = hdRelay.fremd.get(k);
      if (d) d._meldung(daten.slice());
    }
  }

  // ---- HOST: the stand-in device ----------------------------------------------------------
  class HdFremdMerkmal extends EventTarget {
    constructor(dev, schreibbar) {
      super();
      this.device = dev; this.value = null; this.uuid = schreibbar ? '6e400002-b5a3-f393-e0a9-e50e24dcca9e' : '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
      this.properties = schreibbar ? { writeWithoutResponse: true, write: false, notify: false }
                                   : { writeWithoutResponse: false, write: false, notify: true };
    }
    writeValueWithoutResponse(daten) {
      if (!this.device.gatt.connected) return Promise.reject(new Error('Helper car not connected'));
      if (!hdIo(1, this.device._k, daten)) return Promise.reject(new Error('Two-laptop link is down'));
      return Promise.resolve();
    }
    writeValueWithResponse(daten) { return this.writeValueWithoutResponse(daten); }
    writeValue(daten) { return this.writeValueWithoutResponse(daten); }
    startNotifications() { return Promise.resolve(this); }
    stopNotifications() { return Promise.resolve(this); }
  }
  class HdFremdGeraet extends EventTarget {
    constructor(k, id, name) {
      super();
      this._k = k;
      this.id = HD_RELAY_ID + id;
      this.name = name || ('HYBRID-helper-' + k);
      this._helper = true;
      this._rx = new HdFremdMerkmal(this, true);
      this._tx = new HdFremdMerkmal(this, false);
      this._da = true;       // the helper reports this car as connected
      const dev = this;
      const dienst = {
        uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', device: dev,
        getCharacteristic: async (u) => {
          const s = String(u).toLowerCase();
          if (s === dev._rx.uuid) return dev._rx;
          if (s === dev._tx.uuid) return dev._tx;
          throw new Error('Characteristic not found');
        },
        getCharacteristics: async () => [dev._rx, dev._tx],
      };
      this.gatt = {
        device: dev, connected: false,
        connect: async () => {
          if (!hdRelay.offen || !dev._da) throw new Error('Helper car not reachable');
          dev.gatt.connected = true;
          return dev.gatt;
        },
        disconnect: () => {
          const war = dev.gatt.connected;
          dev.gatt.connected = false;
          // removeCar() lands here: tell the helper to stop the car (it stays connected there).
          hdCtl({ t: 'trennen', k: dev._k });
          if (war) setTimeout(() => dev.dispatchEvent(new Event('gattserverdisconnected')), 0);
        },
        getPrimaryService: async (u) => {
          if (String(u).toLowerCase() !== dienst.uuid) throw new Error('Service not found');
          return dienst;
        },
        getPrimaryServices: async () => [dienst],
      };
    }
    _meldung(bytes) {
      if (!this.gatt.connected) return;
      this._tx.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this._tx.dispatchEvent(new Event('characteristicvaluechanged'));
    }
    _weg() {
      this._da = false;
      if (this.gatt.connected) {
        this.gatt.connected = false;
        this.dispatchEvent(new Event('gattserverdisconnected'));
      }
    }
    watchAdvertisements() { return Promise.resolve(); }
  }
  function hdFremdesAuto(k, id, name) {
    k = Number(k) & 0xff;
    let dev = hdRelay.fremd.get(k);
    if (dev && dev.id !== HD_RELAY_ID + id) dev = null;
    if (!dev) { dev = new HdFremdGeraet(k, id, name); hdRelay.fremd.set(k, dev); }
    dev._da = true;
    const imGarage = garage.find((c) => c.device === dev);
    if (imGarage) {
      // Reconnected on the helper: let the app's own reconnect pick it up, or do it now.
      if (!dev.gatt.connected && !imGarage.reconnectLaeuft) {
        verbindeGattSicher(imGarage).then(() => {
          imGarage.reconnectVersuche = 0;
          log(garageLabel(imGarage) + ' back via helper laptop.', 'info');
        }).catch(() => {});
      }
      return;
    }
    garageGeraetAufnehmen(dev).then(() => {
      hdRelayMalen();
      if (typeof showHudToast === 'function') showHudToast('Car via helper laptop: ' + dev.name);
    });
  }

  // ---- HELPER: real cars on this laptop's Bluetooth ---------------------------------------
  async function hdHelperAutoVerbinden() {
    if (!navigator.bluetooth) throw new Error('This browser has no Web Bluetooth. Use Chrome or Edge.');
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'HYBRID' }, { services: [NUS_SERVICE] }],
      optionalServices: [NUS_SERVICE],
    });
    return hdHelperGeraet(dev);
  }
  async function hdHelperGeraet(dev) {
    for (const [k, e] of hdRelay.eigen) if (e.id === String(dev.id)) return k;
    const k = hdRelay.naechsterKey++ & 0xff;
    const e = { dev, id: String(dev.id), name: dev.name || 'HYBRID', rx: null, tx: null,
                pending: null, schreibt: false, n: 0, verbunden: false };
    hdRelay.eigen.set(k, e);
    await hdHelperGatt(k, e);
    dev.addEventListener('gattserverdisconnected', () => {
      if (!hdRelay.eigen.has(k)) return;
      e.verbunden = false;
      hdCtl({ t: 'weg', k });
      hdRelayMalen();
      // Try to get it back a few times, like the garage does.
      let versuch = 0;
      const nochmal = () => {
        if (!hdRelay.eigen.has(k) || e.verbunden || ++versuch > 5) return;
        setTimeout(() => hdHelperGatt(k, e).catch(nochmal), 1000 * versuch);
      };
      nochmal();
    });
    return k;
  }
  async function hdHelperGatt(k, e) {
    const srv = await e.dev.gatt.connect();
    const nus = await srv.getPrimaryService(NUS_SERVICE);
    e.rx = await nus.getCharacteristic(NUS_RX);
    e.tx = await nus.getCharacteristic(NUS_TX);
    await e.tx.startNotifications();
    if (!e.horcht) {
      e.horcht = (ev) => { e.n++; hdIo(2, k, ev.target.value); };
    }
    e.tx.removeEventListener('characteristicvaluechanged', e.horcht);
    e.tx.addEventListener('characteristicvaluechanged', e.horcht);
    e.verbunden = true;
    hdCtl({ t: 'auto', k, id: e.id, name: e.name });
    log('Helper: ' + e.name + ' connected.', 'info');
    hdRelayMalen();
  }
  // Latest wins: while a write is in flight, only the newest packet waits.
  function hdHelperSchreiben(k, bytes) {
    const e = hdRelay.eigen.get(k);
    if (!e || !e.rx || !e.verbunden) return;
    if (e.schreibt) { e.pending = bytes; return; }
    e.schreibt = true;
    (async () => {
      let auf = bytes;
      while (auf) {
        try {
          if (e.rx.properties && e.rx.properties.writeWithoutResponse === false && e.rx.writeValueWithResponse) await e.rx.writeValueWithResponse(auf);
          else await e.rx.writeValueWithoutResponse(auf);
        } catch (err) { /* the next packet follows in ~45 ms */ }
        auf = e.pending; e.pending = null;
      }
      e.schreibt = false;
    })();
  }
  function hdAnhalten(k) {
    const stopp = buildCommandPacket(0, 0, TRACK_BIT_ON);
    hdHelperSchreiben(k, stopp);
  }
  function hdAlleAnhalten() { hdRelay.eigen.forEach((e, k) => hdAnhalten(k)); }
  function hdHelperTrennen(k) {
    const e = hdRelay.eigen.get(k);
    if (!e) return;
    hdAnhalten(k);
    hdRelay.eigen.delete(k);
    hdCtl({ t: 'weg', k });
    setTimeout(() => { try { e.dev.gatt.disconnect(); } catch (err) { /* gone */ } }, 150);
    hdRelayMalen();
  }
  function hdWachhundStarten() {
    clearInterval(hdRelay.wachUhr);
    hdRelay.wachUhr = setInterval(() => {
      if (hdRelay.rolle !== 'helper' || !hdRelay.eigen.size) return;
      const still = !hdRelay.offen || performance.now() - hdRelay.zuletztGehoert > HD_RELAY_STILL_MS;
      if (still) hdAlleAnhalten();
      if (still !== hdRelay.warStill) { hdRelay.warStill = still; hdRelayMalen(); }
    }, 300);
  }

  // ---- UI ---------------------------------------------------------------------------------
  function hdStatus(s) { hdRelay.status = s; const el = $('hdr-status'); if (el) el.textContent = s; }
  function hdRelayMalen() {
    const box = $('hd-relay');
    if (!box) return;
    box.dataset.rolle = hdRelay.rolle || '';
    const lamp = $('hdr-lampe');
    if (lamp) {
      lamp.className = 'hdr-lampe ' + (hdRelay.offen ? (hdRelay.warStill ? 'gelb' : 'gruen') : 'rot');
      lamp.textContent = hdRelay.offen ? 'LINKED' : 'NOT LINKED';
    }
    const knopf = $('gar-hd-relay');
    if (knopf) {
      const n = hdRelay.rolle === 'host' ? [...hdRelay.fremd.values()].filter((d) => d.gatt.connected).length : 0;
      knopf.textContent = hdRelay.offen ? 'Two laptops · ' + (hdRelay.rolle === 'host' ? n + ' via helper' : 'helper') : 'Two laptops…';
      knopf.classList.toggle('hd-an', hdRelay.offen);
    }
    const liste = $('hdr-autos');
    if (liste) {
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      if (hdRelay.rolle === 'helper') {
        liste.innerHTML = hdRelay.eigen.size ? [...hdRelay.eigen].map(([k, e]) =>
          `<li><b>${esc(e.name)}</b> <span class="muted">${e.verbunden ? 'connected' : 'reconnecting …'}</span>`
          + ` <button type="button" data-hdr-trennen="${k}">Disconnect</button></li>`).join('')
          : '<li class="muted">No cars yet. Connect the cars this laptop should carry.</li>';
        liste.querySelectorAll('[data-hdr-trennen]').forEach((b) => { b.onclick = () => hdHelperTrennen(Number(b.dataset.hdrTrennen)); });
      } else if (hdRelay.rolle === 'host') {
        liste.innerHTML = hdRelay.fremd.size ? [...hdRelay.fremd.values()].map((d) => {
          const car = garage.find((c) => c.device === d);
          return `<li><b>${esc(car ? garageLabel(car) : d.name)}</b> <span class="muted">${d.gatt.connected ? 'in garage' : d._da ? 'removed from garage' : 'offline'}</span>`
            + (!car && d._da && hdRelay.offen ? ` <button type="button" data-hdr-dazu="${d._k}">Add to garage</button>` : '') + '</li>';
        }).join('') : '<li class="muted">Helper cars appear here and in the Garage.</li>';
        liste.querySelectorAll('[data-hdr-dazu]').forEach((b) => { b.onclick = () => { const d = hdRelay.fremd.get(Number(b.dataset.hdrDazu)); if (d) hdFremdesAuto(d._k, d.id.slice(HD_RELAY_ID.length), d.name); }; });
      } else liste.innerHTML = '';
    }
    hdChipAuffrischen();
    const z = $('hdr-zahlen');
    if (z) z.textContent = hdRelay.offen ? hdRelay.gesendet + ' sent · ' + hdRelay.empfangen + ' received' : '';
  }
  // v2.1: a chip in the header (top right, next to the car count) reopens the panel from any
  // screen. REPORTED: "have a tab or button to prompt the Helper window". Closing the panel
  // never closes the link - only "Unlink" or closing the browser tab does.
  function hdRelayChip(st) {
    try { if (!hdRelay) return; } catch (e) { return; }   // called before this file ran (start-up)
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'hd-relay-chip';
    b.className = 'hd-relay-chip' + (hdRelay.offen ? (hdRelay.warStill ? ' gelb' : ' an') : hdRelay.rolle ? ' rot' : '');
    const n = hdRelay.rolle === 'host' ? [...hdRelay.fremd.values()].filter((d) => d.gatt.connected).length : hdRelay.eigen.size;
    // v2.1 REQUESTED: bigger, icon only. The colour says the state; the tooltip says the rest.
    b.innerHTML = '<svg viewBox="0 0 28 20" width="26" height="18" aria-hidden="true"><rect x="1" y="3" width="11" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M0 13.5 H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="16" y="3" width="11" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 13.5 H28" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 17.5 H18 M16 15.8 L18 17.5 L16 19.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    b.title = 'Two-laptop mode' + (hdRelay.offen ? ' – linked' + (hdRelay.rolle === 'host' ? ', ' + n + ' car(s) via helper' : ' (helper)') : hdRelay.rolle ? ' – not linked' : '');
    b.setAttribute('aria-label', b.title);
    b.classList.add('hd-top-knopf');
    b.setAttribute('data-i18n-skip', '');
    b.addEventListener('click', (e) => { e.stopPropagation(); hdRelayOeffnen(); });
    st.appendChild(b);
  }
  function hdChipAuffrischen() {
    const st = $('k-status'), alt = $('hd-relay-chip');
    if (!st) return;
    if (alt) alt.remove();
    hdRelayChip(st);
  }
  function hdRelayOeffnen(rolle) {
    const box = $('hd-relay');
    if (!box) return;
    box.hidden = false;
    if (rolle && !hdRelay.rolle) box.dataset.zeige = rolle;
    hdRelayMalen();
  }
  async function hdKopieren(id, knopf) {
    const el = $(id);
    if (!el) return;
    try { await navigator.clipboard.writeText(el.value); }
    catch (e) { el.select(); try { document.execCommand('copy'); } catch (e2) { /* manual */ } }
    if (knopf) { const alt = knopf.textContent; knopf.textContent = 'Copied'; setTimeout(() => { knopf.textContent = alt; }, 1200); }
  }
  (function hdRelayAnbinden() {
    const an = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    const fehler = (e) => { hdStatus('⚠ ' + ((e && e.message) || e)); };
    an('gar-hd-relay', () => hdRelayOeffnen());
    an('hdr-zu', () => { $('hd-relay').hidden = true; });
    an('hdr-wahl-host', () => { $('hd-relay').dataset.zeige = 'host'; hdRelayMalen(); });
    an('hdr-wahl-helper', () => { $('hd-relay').dataset.zeige = 'helper'; hdRelayMalen(); });
    an('hdr-host-code', async () => {
      try { $('hdr-host-code-text').value = 'Creating …'; $('hdr-host-code-text').value = await hdHostStart(); }
      catch (e) { fehler(e); }
    });
    an('hdr-host-kopieren', (ev) => hdKopieren('hdr-host-code-text', ev.currentTarget));
    an('hdr-host-verbinden', async () => { try { await hdHostAntwort($('hdr-host-antwort').value); } catch (e) { fehler(e); } });
    an('hdr-helper-antwort', async () => {
      try { $('hdr-helper-code-text').value = 'Creating …'; $('hdr-helper-code-text').value = await hdHelperStart($('hdr-helper-angebot').value); }
      catch (e) { $('hdr-helper-code-text').value = ''; fehler(e); }
    });
    an('hdr-helper-kopieren', (ev) => hdKopieren('hdr-helper-code-text', ev.currentTarget));
    an('hdr-helper-auto', async () => {
      try { await hdHelperAutoVerbinden(); }
      catch (e) { if (!(e && e.name === 'NotFoundError')) fehler(e); }
    });
    an('hdr-trennen', () => { hdRelaySchliessen(false); hdStatus('Link closed.'); });
    // ?helper in the address (or helper.html, which forwards here) is the DEDICATED HELPER
    // PAGE: the panel fills the screen, cannot be closed, and nothing else of the app shows -
    // so it cannot be closed by accident in the middle of a race.
    let helperSeite = false;
    try { helperSeite = new URLSearchParams(location.search).has('helper'); } catch (e) { /* no URL */ }
    if (helperSeite) {
      document.body.classList.add('hd-helper-seite');
      document.title = 'HybridDash Helper';
      hdRelayOeffnen('helper');
    }
    // While linked, closing or reloading the tab asks first (it would drop the link and stop
    // the helper's cars).
    window.addEventListener('beforeunload', (e) => {
      if (!hdRelay.offen && !(hdRelay.rolle === 'helper' && hdRelay.eigen.size)) return;
      e.preventDefault(); e.returnValue = '';
    });
    an('hdr-helper-seite', () => { window.open(location.pathname + '?helper', '_blank', 'noopener'); });
    setInterval(() => { if ($('hd-relay') && !$('hd-relay').hidden) hdRelayMalen(); }, 1000);
    hdRelayMalen();
  })();

  // Diagnostics / tests.
  window.HYBRIDDASH_RELAY = Object.freeze({
    hostStart: hdHostStart, hostAntwort: hdHostAntwort, helperStart: hdHelperStart,
    helperGeraet: hdHelperGeraet,
    status: () => ({ rolle: hdRelay.rolle, offen: hdRelay.offen, status: hdRelay.status,
      fremd: [...hdRelay.fremd.values()].map((d) => ({ id: d.id, name: d.name, verbunden: d.gatt.connected })),
      eigen: [...hdRelay.eigen.values()].map((e) => ({ id: e.id, name: e.name, verbunden: e.verbunden, meldungen: e.n })),
      gesendet: hdRelay.gesendet, empfangen: hdRelay.empfangen,
      garage: garage.map((c) => ({ id: String(c.device.id), name: garageLabel(c), role: c.role, tileCount: c.tileCount })) }),
    schliessen: () => hdRelaySchliessen(false),
    garageRolle: (id, role) => { const c = garage.find((x) => String(x.device.id) === id); if (c) setCarRole(c, role); },
    garageSchreiben: (id, steer, gas) => { const c = garage.find((x) => String(x.device.id) === id); if (c) return writeToCar(c, steer, gas, TRACK_BIT_ON); },
    stoppPaket: () => Array.from(buildCommandPacket(0, 0, TRACK_BIT_ON)),
    paket: (steer, gas) => Array.from(buildCommandPacket(steer, gas, TRACK_BIT_ON)),
  });
