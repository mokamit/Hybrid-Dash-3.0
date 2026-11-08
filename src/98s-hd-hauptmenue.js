  // =====================================================================================
  // Hybrid-Dash 3.0: THE MAIN MENU AS IN THE "CRIMSON PADDOCK" MOCK-UP
  // =====================================================================================
  //
  // BESTELLT (with the mock-up): "I want the main menu to look like this, follow the menu tab style and everything.
  // With a cars and drivers card on the right side. I like that feature/look."
  //
  // The cards stay the same elements (ids, handlers, menu navigation, the quad switching left / right): this only
  //   - gathers each card's label, title and details into one bar at the bottom (span.hdhm-bar) with a round icon,
  //   - builds the driver panel of the Cars & Drivers card: the player's portrait, "PLAYER 1", number and name, the
  //     other cars as small portraits and a "+" that connects one more,
  //   - moves the banner's links (Wiki, Tutorial, Controls, Android app, install) into the footer line.
  // The grid itself (START tall on the left, RACE OPTIONS wide, TRACK and CHAMPIONSHIP under it, CARS & DRIVERS tall
  // on the right) is CSS: #hd3-crimson, "main menu".

  const HD_HM_ICON = {
    'fa-renn': '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    'fa-strecke': '<path d="M4 18c0-8 16-4 16-12"/><path d="M8 20c0-8 14-4 14-12" opacity=".5"/>',
    'fa-profil': '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M12 13v4M8 21h8"/>',
    'fa-auto': '<path d="M5 16h14l-2-6H7z"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>',
    'fa-start': '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  };
  function hdHmIcon(id) {
    return '<span class="hdhm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
      + (HD_HM_ICON[id] || '') + '</svg></span>';
  }
  function hdHmBalken() {
    for (const id of ['fa-renn', 'fa-strecke', 'fa-profil', 'fa-auto']) {
      const k = $(id);
      if (!k || k.querySelector('.hdhm-bar')) continue;
      const bar = document.createElement('span');
      bar.className = 'hdhm-bar';
      bar.insertAdjacentHTML('afterbegin', hdHmIcon(id));
      const text = document.createElement('span'); text.className = 'hdhm-text';
      const kk = k.querySelector(':scope > .k-kk'), kopf = k.querySelector(':scope > .k-kopf') || k.querySelector(':scope > .k-kt');
      const ki = k.querySelector(':scope > .k-ki');
      if (kk) text.appendChild(kk);
      if (kopf) text.appendChild(kopf);
      bar.appendChild(text);
      if (ki && id !== 'fa-auto') { ki.classList.add('hdhm-ki'); bar.appendChild(ki); }
      k.appendChild(bar);
    }
    const st = $('fa-start');
    if (st && !st.querySelector('.hdhm-icon')) {
      const innen = st.querySelector('.k-start-innen');
      if (innen) {
        const text = document.createElement('span'); text.className = 'hdhm-text';
        while (innen.firstChild) text.appendChild(innen.firstChild);
        innen.appendChild(text);
        innen.insertAdjacentHTML('afterbegin', hdHmIcon('fa-start'));
      }
    }
  }
  // ---- ‹ › arrows on the cards that switch (Race options: race type, Track: on the rail / free) -------------------
  // BESTELLT: "For Race Options and Track cards, make it obvious you can change sub tabs, maybe with some arrows."
  function hdHmPfeile() {
    for (const k of document.querySelectorAll('#tab-fahren .k-kachel[data-quad]')) {
      const kopf = k.querySelector('.k-kopf');
      if (!kopf || kopf.querySelector('.hdhm-pfeil')) continue;
      const pfeil = (dir) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'k-arrow hdhm-pfeil'; b.dataset.quad = k.dataset.quad; b.dataset.dir = String(dir);
        b.setAttribute('aria-label', dir < 0 ? t('Vorherige') : t('Nächste'));
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="' + (dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        b.addEventListener('click', (e) => { e.stopPropagation(); konsoleQuadWechsel(k.dataset.quad, dir); });
        return b;
      };
      kopf.insertBefore(pfeil(-1), kopf.firstChild);
      kopf.appendChild(pfeil(1));
    }
  }
  // ---- Cars & Drivers: the driver panel ----------------------------------------------------------------------------
  let hdHmSchluessel = '';
  function hdHmFahrer() {
    const k = $('fa-auto');
    if (!k) return;
    let box = k.querySelector('.hdhm-fahrer');
    if (!box) {
      box = document.createElement('span');
      box.className = 'hdhm-fahrer';
      const bild = k.querySelector(':scope > .k-kb');
      k.insertBefore(box, bild ? bild.nextSibling : k.firstChild);
      box.addEventListener('click', (e) => {
        const plus = e.target.closest('[data-hdhm="plus"]');
        if (!plus) return;
        e.stopPropagation();
        if (typeof hdGepaartOeffnen === 'function') hdGepaartOeffnen(); else if ($('fa-verbinden')) $('fa-verbinden').click();
      });
    }
    let autos = [];
    try { autos = garage.filter((c) => c && c.device && c.role !== 'safetycar' && c.role !== 'reinig'); } catch (e) { autos = []; }
    let ich = null;
    try { ich = playerCar && autos.includes(playerCar) ? playerCar : (autos[0] || null); } catch (e) { ich = autos[0] || null; }
    // every other car (GEMELDET: "I have 6 cars connected, but it only shows 4 avatars"); smaller when many
    const andere = autos.filter((c) => c !== ich);
    const schl = [lang, ich ? [ich.device.id, ich.alias, ich.colorId, ich.modellId, ich.role, typeof hdNummer === 'function' ? hdNummer(ich) : '', typeof hdLand === 'function' ? hdLand(ich) : ''].join(':') : '-',
      andere.map((c) => c.device.id + ':' + c.colorId + ':' + c.alias).join(',')].join('|');
    if (schl === hdHmSchluessel && box.firstChild) return;
    hdHmSchluessel = schl;
    const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const portrait = (car, px) => (typeof hdAvatarFuerAuto === 'function' ? hdAvatarFuerAuto(car, px) : '');
    let html = '';
    if (ich) {
      const rolle = ich.role === 'player' ? t('Spieler 1') : /^player([2-9])$/.test(ich.role || '') ? t('Spieler') + ' ' + ich.role.slice(6) : t('Auto');
      const nr = typeof hdNummer === 'function' ? hdNummer(ich) : (ich.nummer || '');
      const name = ich.alias || ich.tag || garageLabel(ich);
      html += '<span class="hdhm-portrait" style="--f:' + esc(carColor(ich).hex) + '">' + portrait(ich, 330) + '</span>'
        + '<span class="hdhm-rolle">' + esc(rolle) + '</span>'
        + '<span class="hdhm-name">' + (nr ? '<b>#' + esc(nr) + '</b>' : '') + '<span>' + esc(name) + '</span>' + (typeof hdLandFlaggeFuer === 'function' ? hdLandFlaggeFuer(ich, 20) : '') + '</span>';
    } else {
      html += '<span class="hdhm-portrait hdhm-leer"><svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true"><path d="M50 14c-20 0-34 14-34 34v14c0 6 4 10 10 10h48c6 0 10-4 10-10V48c0-20-14-34-34-34z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M22 48h56v10H22z" fill="currentColor" opacity=".5"/><path d="M28 86h44" stroke="currentColor" stroke-width="4"/></svg></span>'
        + '<span class="hdhm-rolle">' + esc(t('Kein Auto verbunden')) + '</span>';
    }
    html += '<span class="hdhm-reihe' + (andere.length > 4 ? ' viele' : '') + '">' + andere.map((c) => '<span class="hdhm-mini" title="' + esc(c.alias || garageLabel(c)) + '" style="--f:' + esc(carColor(c).hex) + '">' + portrait(c, 52) + '</span>').join('')
      + '<button type="button" class="hdhm-plus" data-hdhm="plus" title="' + esc(t('Auto verbinden')) + '" aria-label="' + esc(t('Auto verbinden')) + '">+</button></span>';
    box.innerHTML = html;
  }
  // ---- banner links into the footer ----------------------------------------------------------------------------------
  function hdHmFuss() {
    const fuss = $('hd-fuss'), knoepfe = document.querySelector('#hd-banner .hd-banner-knoepfe');
    if (!fuss || !knoepfe || fuss.querySelector('.hd-banner-knoepfe')) return;
    knoepfe.classList.add('hdhm-links');
    fuss.appendChild(knoepfe);
  }
  function hdHauptmenue() {
    const g = document.querySelector('#tab-fahren .k-fahren');
    if (!g) return;
    g.classList.add('hdhm');
    hdHmBalken();
    hdHmPfeile();
    hdHmFuss();
    hdHmFahrer();
  }
  setTimeout(hdHauptmenue, 0);
  setInterval(() => { try { if (kAktiverTab() === 'fahren') hdHmFahrer(); } catch (e) { /* not ready */ } }, 1000);
  if (typeof i18nOnLangChange === 'function') i18nOnLangChange(() => { hdHmSchluessel = ''; hdHmFahrer(); });
  window.HYBRIDDASH_HAUPTMENUE = Object.freeze({ malen: () => { hdHmSchluessel = ''; hdHauptmenue(); } });
