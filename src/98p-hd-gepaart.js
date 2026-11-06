  // =====================================================================================
  // Hybrid-Dash 3.0: PREVIOUSLY PAIRED CARS - a themed car picker, reconnect, forget
  // =====================================================================================
  //
  // BESTELLT: "In the Garage menu, have somewhere to see previously paired cars, where you can forget pairing and
  // reconnect easily. When you press connect, is it possible to make an app themed pop up instead [of the browser's],
  // where instead of the Bluetooth name it shows the car model and colour?"
  //
  // What the browser allows: a car this site was ALREADY allowed to use (navigator.bluetooth.getDevices(), and the
  // APK's bridge) can be connected without the browser's chooser - so those are listed here with what the app knows
  // about them: number, driver, make / model, colour. A car that was NEVER paired can only be offered by the
  // browser's own chooser (Web Bluetooth does not let a page scan by itself); "Pair a new car" opens it. Forget:
  // BluetoothDevice.forget() takes the site's permission back (Chrome 101+), and the car leaves the list.
  //
  // What the app knows about a car is kept per device id in hybriddash.gepaart.v1 - written whenever a car is in the
  // garage, so the list can show it while the car is off.
  const HD_GEPAART_STORE = 'hybriddash.gepaart.v1';
  function hdGepaartLesen() {
    try { return JSON.parse(localStorage.getItem(HD_GEPAART_STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function hdGepaartSchreiben(o) {
    try { localStorage.setItem(HD_GEPAART_STORE, JSON.stringify(o)); } catch (e) { /* private */ }
  }
  // Called from renderGarage (cheap: only writes when something changed).
  function hdGepaartMerken() {
    let alle;
    try { alle = garage.filter((c) => c && c.device && !c.sim && !c.probe && String(c.device.id).indexOf('relay-') !== 0); } catch (e) { return; }
    if (!alle.length) return;
    const o = hdGepaartLesen();
    let neu = false;
    for (const c of alle) {
      const id = String(c.device.id);
      const e = { bt: c.device.name || '', alias: c.alias || '', colorId: c.colorId || '', modellId: carModellWert(c.modellId) || '',
                  nummer: typeof hdNummer === 'function' ? hdNummer(c) : '', zuletzt: (o[id] && o[id].zuletzt) || Date.now() };
      const alt = o[id];
      if (!alt || alt.bt !== e.bt || alt.alias !== e.alias || alt.colorId !== e.colorId || alt.modellId !== e.modellId || String(alt.nummer) !== String(e.nummer)) {
        e.zuletzt = Date.now(); o[id] = e; neu = true;
      }
    }
    if (neu) hdGepaartSchreiben(o);
  }
  // Every car the app can connect without the browser's chooser (permission kept), with what it knows about it.
  async function hdGepaartListe() {
    const o = hdGepaartLesen();
    let geraete = [];
    try { if (navigator.bluetooth && typeof navigator.bluetooth.getDevices === 'function') geraete = await navigator.bluetooth.getDevices(); } catch (e) { geraete = []; }
    geraete = geraete.filter((d) => /^HYBRID/i.test(d.name || ''));
    const liste = geraete.map((d) => ({ id: String(d.id), dev: d, info: o[String(d.id)] || { bt: d.name || '' } }));
    // Cars the app remembers but the browser no longer lists (permission gone, other browser): shown as "pair again".
    Object.keys(o).forEach((id) => { if (!liste.some((x) => x.id === id)) liste.push({ id, dev: null, info: o[id] }); });
    liste.forEach((x) => { x.verbunden = garage.some((c) => c.device && String(c.device.id) === x.id); });
    liste.sort((a, b) => (b.verbunden - a.verbunden) || ((b.info.zuletzt || 0) - (a.info.zuletzt || 0)));
    return liste;
  }
  function hdGepaartEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function hdGepaartZeile(x) {
    const i = x.info || {};
    const farbe = (typeof CAR_COLORS !== 'undefined' && CAR_COLORS.find((f) => f.id === i.colorId)) || null;
    const hex = farbe ? farbe.hex : '#7a7a7a';
    const modell = i.modellId && typeof carModellName === 'function' ? carModellName(i.modellId) : '';
    const name = i.alias || '';
    const nr = i.nummer ? '#' + i.nummer : '';
    const titel = [nr, name].filter(Boolean).join(' ') || t('Unbenanntes Auto');
    const unter = [modell, farbe ? t(farbe.name) : ''].filter(Boolean).join(' · ') || t('Modell und Farbe noch nicht eingestellt');
    const avatar = typeof hdAvatarSvg === 'function' ? hdAvatarSvg(name || i.bt || x.id, hex, 0, 56, i.modellId || '') : '';
    const status = x.verbunden ? '<span class="hdg-st an">' + t('verbunden') + '</span>'
      : x.dev ? '<span class="hdg-st">' + t('gepaart') + '</span>' : '<span class="hdg-st aus">' + t('neu koppeln') + '</span>';
    return `<div class="hdg-zeile" data-id="${hdGepaartEsc(x.id)}" style="--hdg-farbe:${hex}">`
      + `<span class="hdg-bild">${avatar}</span>`
      + `<span class="hdg-text"><b>${hdGepaartEsc(titel)}</b><span>${hdGepaartEsc(unter)}</span><small>${hdGepaartEsc(i.bt || '')}</small></span>`
      + status
      + `<span class="hdg-knoepfe">`
      + (!x.verbunden && x.dev ? `<button type="button" class="primary" data-hdg="verbinden">${t('Verbinden')}</button>` : '')
      + `<button type="button" data-hdg="vergessen"${x.verbunden ? ' disabled title="' + hdGepaartEsc(t('Erst trennen')) + '"' : ''}>${t('Vergessen')}</button>`
      + `</span></div>`;
  }
  let hdGepaartBox = null;
  async function hdGepaartOeffnen() {
    if (!hdGepaartBox) {
      hdGepaartBox = document.createElement('div');
      hdGepaartBox.id = 'hd-gepaart'; hdGepaartBox.className = 'hd-gepaart'; hdGepaartBox.setAttribute('role', 'dialog');
      hdGepaartBox.setAttribute('aria-modal', 'true'); hdGepaartBox.setAttribute('data-i18n-skip', '');
      document.body.appendChild(hdGepaartBox);
      hdGepaartBox.addEventListener('click', hdGepaartKlick);
    }
    hdGepaartBox.hidden = false;
    hdGepaartBox.innerHTML = '<div class="hdg-karte"><div class="hdg-kopf"><b>' + t('Gepaarte Autos') + '</b>'
      + '<button type="button" class="hdg-zu" data-hdg="zu" aria-label="' + t('Schließen') + '">&#10005;</button></div>'
      + '<p class="hdg-hinweis">' + t('Lädt …') + '</p></div>';
    const liste = await hdGepaartListe();
    const karte = hdGepaartBox.querySelector('.hdg-karte');
    const verbindbar = liste.filter((x) => x.dev && !x.verbunden).length;
    karte.innerHTML = '<div class="hdg-kopf"><b>' + t('Gepaarte Autos') + '</b>'
      + '<button type="button" class="hdg-zu" data-hdg="zu" aria-label="' + t('Schließen') + '">&#10005;</button></div>'
      + (liste.length ? '<div class="hdg-liste">' + liste.map(hdGepaartZeile).join('') + '</div>'
        : '<p class="hdg-hinweis">' + t('Noch keine Autos gepaart.') + '</p>')
      + '<div class="hdg-fuss">'
      + '<button type="button" data-hdg="neu">+ ' + t('Neues Auto koppeln') + '</button>'
      + (verbindbar ? '<button type="button" class="primary" data-hdg="alle">&#10227; ' + t('Alle verbinden') + ' (' + verbindbar + ')</button>' : '')
      + '</div>'
      + '<p class="hdg-hinweis">' + t('Gepaarte Autos verbinden direkt, ohne das Auswahlfenster des Browsers. Ein neues Auto muss der Browser einmal selbst anbieten – danach steht es hier mit Modell und Farbe.') + '</p>';
    hdGepaartBox._liste = liste;
  }
  function hdGepaartZu() { if (hdGepaartBox) hdGepaartBox.hidden = true; }
  async function hdGepaartKlick(e) {
    if (e.target === hdGepaartBox) { hdGepaartZu(); return; }
    const b = e.target.closest('[data-hdg]');
    if (!b) return;
    const was = b.dataset.hdg;
    if (was === 'zu') { hdGepaartZu(); return; }
    if (was === 'neu') { hdGepaartZu(); garageConnect(); return; }
    if (was === 'alle') { hdGepaartZu(); garageBekannteVerbinden($('gar-bekannte')); return; }
    const zeile = b.closest('.hdg-zeile');
    const x = zeile && (hdGepaartBox._liste || []).find((y) => y.id === zeile.dataset.id);
    if (!x) return;
    if (was === 'verbinden' && x.dev) {
      b.disabled = true; b.textContent = t('Suche …');
      const gesehen = await garageGesehen(x.dev, 8000);
      if (!gesehen) { showHudToast(t('Auto nicht gefunden – ist es an und in Reichweite?')); hdGepaartOeffnen(); return; }
      try { await garageGeraetAufnehmen(x.dev); } catch (err) { showHudToast(t('Verbinden fehlgeschlagen')); }
      hdGepaartOeffnen();
    } else if (was === 'vergessen') {
      const name = (x.info && (x.info.alias || x.info.bt)) || x.id;
      if (!window.confirm(t('Kopplung vergessen?') + '\n\n' + name + '\n\n' + t('Zum Verbinden muss das Auto danach wieder im Auswahlfenster des Browsers gewählt werden.'))) return;
      try { if (x.dev && typeof x.dev.forget === 'function') await x.dev.forget(); } catch (err) { /* already gone */ }
      const o = hdGepaartLesen(); delete o[x.id]; hdGepaartSchreiben(o);
      log('Pairing forgotten: ' + name + ' (' + x.id + ').', 'info');
      hdGepaartOeffnen();
      if (typeof renderGarage === 'function') renderGarage();
    }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdGepaartBox && !hdGepaartBox.hidden) { e.preventDefault(); hdGepaartZu(); } }, true);
  window.HYBRIDDASH_GEPAART = Object.freeze({ oeffnen: hdGepaartOeffnen, zu: hdGepaartZu, liste: hdGepaartListe, merken: hdGepaartMerken });
