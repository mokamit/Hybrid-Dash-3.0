  // =====================================================================================
  // Hybrid-Dash 3.0: CONTROLLER MAPS (Xbox and PlayStation) + the controller-hint footer
  // =====================================================================================
  //
  // BESTELLT: "I've attached references for the controller mapping, both Xbox and PS controller." The references
  // are labelled diagrams: the controller in the middle, a line from every button to a label left or right. Here
  // the same, drawn as SVG in Options > Controller, for the controller you choose (Xbox / PlayStation; starts on
  // the detected one). Every label is read from the CURRENT mapping (activeBindings, as padDiagramRender does) -
  // a fixed caption would be a second truth next to the bindings and drift apart at the first re-mapping. The
  // menu functions (select, back, tabs, move) are added in pink under the race function.
  //
  // Footer (#hd-tasten): the mock-ups' "A SELECT · B BACK · LB/RB TABS" line at the bottom of every menu, in the
  // connected controller's own symbols. Only while a controller is connected - on a phone it would be noise.

  const HD_PK_ZEILEN = {
    // [control id, label y] - sorted by the button's height so the leader lines do not cross
    links: ['l2', 'l1', 'select', 'lstick', 'l3', 'dup', 'dleft', 'dright', 'ddown', 'ps'],
    rechts: ['r2', 'r1', 'options', 'tri', 'circ', 'sq', 'cross', 'rstick', 'r3', 'touchpad'],
  };
  // Where each control sits on the drawn controller (viewBox 1000 x 560).
  const HD_PK_ORT = {
    xbox: { l2: [372, 128], r2: [628, 128], l1: [352, 166], r1: [648, 166], select: [466, 236], options: [534, 236], ps: [500, 196],
            touchpad: [500, 270], lstick: [392, 236], l3: [392, 236], rstick: [574, 316], r3: [574, 316],
            dup: [436, 292], ddown: [436, 340], dleft: [412, 316], dright: [460, 316],
            tri: [626, 204], circ: [656, 234], sq: [596, 234], cross: [626, 264] },
    ps:   { l2: [372, 128], r2: [628, 128], l1: [372, 166], r1: [628, 166], select: [410, 196], options: [590, 196], ps: [500, 306],
            touchpad: [500, 214], lstick: [446, 314], l3: [446, 314], rstick: [554, 314], r3: [554, 314],
            dup: [376, 218], ddown: [376, 266], dleft: [352, 242], dright: [400, 242],
            tri: [624, 214], circ: [652, 242], sq: [596, 242], cross: [624, 270] },
  };
  const HD_PK_KURZ = {
    xbox: { cross: 'A', circ: 'B', sq: 'X', tri: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'View', options: 'Menu',
            l3: 'LS ⬇', r3: 'RS ⬇', lstick: 'LS', rstick: 'RS', dup: '↑', ddown: '↓', dleft: '←', dright: '→', ps: 'Xbox', touchpad: 'Share' },
    ps:   { cross: '✕', circ: '○', sq: '□', tri: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'Create', options: 'Options',
            l3: 'L3', r3: 'R3', lstick: 'L', rstick: 'R', dup: '↑', ddown: '↓', dleft: '←', dright: '→', ps: 'PS', touchpad: 'Pad' },
  };
  const HD_PK_FARBE = {
    xbox: { cross: '#35b45a', circ: '#e23b3b', sq: '#3b7fe2', tri: '#e8c72a' },
    ps:   { cross: '#7c9cff', circ: '#ff5d6c', sq: '#ff7ad9', tri: '#3fd6a8' },
  };
  // Menu functions (51-konsole / menuNav): cross = select, circle = back, shoulders = tabs, D-pad = move.
  const HD_PK_MENU = { cross: 'Menü: auswählen', circ: 'Menü: zurück', l1: 'Menü: Reiter wechseln', r1: 'Menü: Reiter wechseln',
                       dup: 'Menü: bewegen', ddown: 'Menü: bewegen', lstick: 'Menü: bewegen' };

  let hdPkStil = null;   // null = follow the controller-layout setting / the detected controller
  function hdPkAktStil() { return hdPkStil || (typeof hdPadStil === 'function' && hdPadStil()) || 'xbox'; }

  function hdPkKoerper(stil) {
    if (stil === 'xbox') {
      return '<path class="hdpk-trig" d="M335 140 q10 -26 50 -26 q22 0 26 20 z M665 140 q-10 -26 -50 -26 q-22 0 -26 20 z"/>'
        + '<path class="hdpk-bump" d="M318 176 q30 -24 80 -26 l14 16 q-56 2 -86 22 z M682 176 q-30 -24 -80 -26 l-14 16 q56 2 86 22 z"/>'
        + '<path class="hdpk-body" d="M330 168 C390 150 610 150 670 168 C735 186 772 252 796 352 C812 424 790 470 748 470 C716 470 694 446 664 404'
        + ' C644 378 624 372 604 372 L396 372 C376 372 356 378 336 404 C306 446 284 470 252 470 C210 470 188 424 204 352 C228 252 265 186 330 168 Z"/>'
        + '<circle class="hdpk-stick" cx="392" cy="236" r="34"/><circle class="hdpk-stick-in" cx="392" cy="236" r="22"/>'
        + '<circle class="hdpk-stick" cx="574" cy="316" r="34"/><circle class="hdpk-stick-in" cx="574" cy="316" r="22"/>'
        + '<path class="hdpk-dpad" d="M424 280 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z"/>'
        + '<circle class="hdpk-klein" cx="466" cy="236" r="9"/><circle class="hdpk-klein" cx="534" cy="236" r="9"/>'
        + '<circle class="hdpk-logo" cx="500" cy="196" r="17"/><rect class="hdpk-klein" x="491" y="263" width="18" height="12" rx="4"/>';
    }
    return '<path class="hdpk-trig" d="M330 140 q4 -28 42 -28 q38 0 42 28 z M586 140 q4 -28 42 -28 q38 0 42 28 z"/>'
      + '<path class="hdpk-bump" d="M332 172 q4 -18 40 -18 q36 0 40 18 z M588 172 q4 -18 40 -18 q36 0 40 18 z"/>'
      + '<path class="hdpk-body" d="M318 178 L682 178 C740 178 772 214 790 300 L812 412 C822 460 796 488 760 488 C728 488 708 466 688 432'
      + ' L660 384 L340 384 L312 432 C292 466 272 488 240 488 C204 488 178 460 188 412 L210 300 C228 214 260 178 318 178 Z"/>'
      + '<rect class="hdpk-pad" x="436" y="182" width="128" height="68" rx="8"/>'
      + '<circle class="hdpk-stick" cx="446" cy="314" r="32"/><circle class="hdpk-stick-in" cx="446" cy="314" r="20"/>'
      + '<circle class="hdpk-stick" cx="554" cy="314" r="32"/><circle class="hdpk-stick-in" cx="554" cy="314" r="20"/>'
      + '<path class="hdpk-dpad" d="M364 206 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z"/>'
      + '<rect class="hdpk-klein" x="404" y="186" width="12" height="20" rx="5"/><rect class="hdpk-klein" x="584" y="186" width="12" height="20" rx="5"/>'
      + '<circle class="hdpk-logo" cx="500" cy="306" r="12"/>';
  }
  function hdPkEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  // A label in at most two lines of ~34 characters.
  function hdPkZeilen(text, max) {
    if (text.length <= max) return [text];
    let i = text.lastIndexOf(' ', max);
    if (i < 12) i = max;
    const rest = text.slice(i).trim();
    return [text.slice(0, i).trim(), rest.length > max ? rest.slice(0, max - 1) + '…' : rest];
  }
  // What lies on each control: assigned actions first, then the hard-wired D-pad function, else "not set".
  function hdPkBelegung() {
    const aus = {};
    let ab = {};
    try { ab = activeBindings(); } catch (e) { ab = {}; }
    for (const c of PAD_CONTROLS) {
      const treffer = Object.keys(BIND_ACTION_LABELS).filter((a) => { const b = ab[a]; return b && b.type === c.typ && b.index === c.index; });
      const fest = PAD_FIXED[c.id];
      aus[c.id] = { text: treffer.length ? treffer.map((a) => t(BIND_ACTION_LABELS[a])).join(' + ') : (fest ? t(fest) : t('nicht belegt')),
                    frei: !treffer.length && !fest };
    }
    return aus;
  }
  function hdPkSvg(stil) {
    const bel = hdPkBelegung();
    const ort = HD_PK_ORT[stil], kurz = HD_PK_KURZ[stil], farbe = HD_PK_FARBE[stil];
    // The drawing is made at full size and shown at 62 % around its centre, so the labels on both sides have room.
    const SK = 0.62, MX = 500, MY = 300, VY = 290;
    const p = ([x, y]) => [Math.round(MX + (x - MX) * SK), Math.round(VY + (y - MY) * SK)];
    let s = '<svg class="hdpk-svg" viewBox="0 0 1000 560" role="img" aria-label="' + hdPkEsc(t('Tastenkarte')) + ' ' + (stil === 'xbox' ? 'Xbox' : 'PlayStation') + '">'
      + '<g class="hdpk-ctrl" transform="translate(' + MX + ' ' + VY + ') scale(' + SK + ') translate(' + (-MX) + ' ' + (-MY) + ')">' + hdPkKoerper(stil);
    // Face buttons, coloured, with their symbol.
    for (const k of ['tri', 'circ', 'sq', 'cross']) {
      const [x, y] = ort[k];
      s += '<circle class="hdpk-face" cx="' + x + '" cy="' + y + '" r="13" style="--f:' + farbe[k] + '"/>'
        + '<text class="hdpk-face-t" x="' + x + '" y="' + (y + 5) + '" fill="' + farbe[k] + '">' + hdPkEsc(kurz[k]) + '</text>';
    }
    s += '</g><g class="hdpk-legende">';
    ['links', 'rechts'].forEach((seite) => {
      const ids = HD_PK_ZEILEN[seite];
      ids.forEach((id, i) => {
        const ly = 40 + i * 52;
        const [bx, by] = p(ort[id]);
        const rechts = seite === 'rechts';
        const knick = rechts ? 690 : 310, anker = rechts ? 716 : 284;
        const b = bel[id] || { text: '', frei: true };
        const menu = HD_PK_MENU[id] ? t(HD_PK_MENU[id]) : '';
        s += '<polyline class="hdpk-linie" points="' + bx + ',' + by + ' ' + knick + ',' + ly + ' ' + anker + ',' + ly + '"/>'
          + '<circle class="hdpk-punkt" cx="' + bx + '" cy="' + by + '" r="4"/><circle class="hdpk-punkt" cx="' + anker + '" cy="' + ly + '" r="4"/>';
        // chip with the button's name, then the action text
        const chipW = Math.max(30, 12 + kurz[id].length * 10);
        const chipX = rechts ? anker + 10 : anker - 10 - chipW;
        const f = farbe[id];
        s += '<rect class="hdpk-chip" x="' + chipX + '" y="' + (ly - 13) + '" width="' + chipW + '" height="26" rx="5"' + (f ? ' style="stroke:' + f + '"' : '') + '/>'
          + '<text class="hdpk-chip-t" x="' + (chipX + chipW / 2) + '" y="' + (ly + 6) + '"' + (f ? ' fill="' + f + '"' : '') + '>' + hdPkEsc(kurz[id]) + '</text>';
        const tx = rechts ? chipX + chipW + 10 : chipX - 10;
        const anc = rechts ? 'start' : 'end';
        const zeilen = hdPkZeilen(b.text, 32);
        const y0 = ly + (menu || zeilen.length > 1 ? -4 : 5);
        s += '<text class="hdpk-text' + (b.frei ? ' frei' : '') + '" x="' + tx + '" y="' + y0 + '" text-anchor="' + anc + '">'
          + zeilen.map((z, j) => '<tspan x="' + tx + '" dy="' + (j ? 17 : 0) + '">' + hdPkEsc(z) + '</tspan>').join('') + '</text>';
        if (menu) s += '<text class="hdpk-menu" x="' + tx + '" y="' + (y0 + (zeilen.length > 1 ? 32 : 16)) + '" text-anchor="' + anc + '">' + hdPkEsc(menu) + '</text>';
      });
    });
    return s + '</g></svg>';
  }
  // The same as a list (narrow screens and screen readers).
  function hdPkListe(stil) {
    const bel = hdPkBelegung(), kurz = HD_PK_KURZ[stil], farbe = HD_PK_FARBE[stil];
    return '<ul class="hdpk-liste">' + HD_PK_ZEILEN.links.concat(HD_PK_ZEILEN.rechts).map((id) => {
      const b = bel[id] || { text: '' };
      const menu = HD_PK_MENU[id] ? ' <small>' + hdPkEsc(t(HD_PK_MENU[id])) + '</small>' : '';
      return '<li' + (b.frei ? ' class="frei"' : '') + '><b' + (farbe[id] ? ' style="color:' + farbe[id] + ';border-color:' + farbe[id] + '"' : '') + '>'
        + hdPkEsc(kurz[id]) + '</b><span>' + hdPkEsc(b.text) + menu + '</span></li>';
    }).join('') + '</ul>';
  }
  function hdPadKarteRender() {
    try { if (!HD_PK_ZEILEN || hdPkStil === undefined) return; } catch (e) { return; }   // called before this file ran (TDZ)
    const sub = document.getElementById('sub-opt-pad');
    if (!sub) return;
    let box = document.getElementById('hd-padkarte');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hd-padkarte'; box.className = 'hd-padkarte'; box.setAttribute('data-i18n-skip', '');
      const vor = sub.querySelector('.bind-table');
      if (!vor) return;
      vor.parentNode.insertBefore(box, vor);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-hdpk]');
        if (!b) return;
        hdPkStil = b.dataset.hdpk;
        hdPadKarteRender();
      });
    }
    const stil = hdPkAktStil();
    box.innerHTML = '<div class="hdpk-kopf"><span class="hdpk-titel">' + hdPkEsc(t('Tastenkarte')) + ' · ' + (stil === 'xbox' ? 'XBOX' : 'PLAYSTATION') + '</span>'
      + '<span class="hdpk-wahl" role="group">'
      + '<button type="button" data-hdpk="xbox"' + (stil === 'xbox' ? ' class="an" aria-pressed="true"' : ' aria-pressed="false"') + '>Xbox</button>'
      + '<button type="button" data-hdpk="ps"' + (stil === 'ps' ? ' class="an" aria-pressed="true"' : ' aria-pressed="false"') + '>PlayStation</button>'
      + '</span></div>' + hdPkSvg(stil) + hdPkListe(stil);
  }
  if (typeof i18nOnLangChange === 'function') i18nOnLangChange(hdPadKarteRender);
  setTimeout(hdPadKarteRender, 0);

  // ---- Footer: controller hints ----------------------------------------------------------------------------------
  function hdTastenLeiste() {
    let el = document.getElementById('hd-tasten');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hd-tasten'; el.setAttribute('aria-hidden', 'true'); el.setAttribute('data-i18n-skip', '');
      document.body.appendChild(el);
    }
    let pad = null;
    try { pad = typeof hdPadErkannt === 'function' ? hdPadErkannt() : null; } catch (e) { pad = null; }
    if (!pad) { try { pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some((p) => p) ? 'ps' : null; } catch (e) { pad = null; } }
    let tab = '';
    try { tab = kAktiverTab(); } catch (e) { tab = ''; }
    const aus = !pad || tab === 'race' || document.body.classList.contains('track-fs');
    el.hidden = aus;
    document.body.classList.toggle('hd-tasten-an', !aus);
    document.body.classList.toggle('hd-pad-ps', (typeof hdPadStil === 'function' && hdPadStil()) === 'ps');
    if (aus) return;
    const stil = (typeof hdPadStil === 'function' && hdPadStil()) || pad;
    const f = HD_PK_FARBE[stil] || HD_PK_FARBE.xbox, k = HD_PK_KURZ[stil] || HD_PK_KURZ.xbox;
    const rund = (id, text) => '<span class="hdt"><i style="background:' + (stil === 'ps' ? 'transparent;border:2px solid ' + f[id] + ';color:' + f[id] : f[id]) + '">' + hdPkEsc(k[id]) + '</i>' + hdPkEsc(t(text)) + '</span>';
    const html = rund('cross', 'Auswählen') + rund('circ', 'Zurückgehen')
      + '<span class="hdt"><i class="sq">' + k.l1 + '</i><i class="sq">' + k.r1 + '</i>' + hdPkEsc(t('Reiter')) + '</span>'
      + '<span class="hdt"><i class="sq">✣</i>' + hdPkEsc(t('Bewegen')) + '</span>';
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  window.addEventListener('gamepadconnected', hdTastenLeiste);
  window.addEventListener('gamepaddisconnected', hdTastenLeiste);
  setInterval(hdTastenLeiste, 1000);
  setTimeout(hdTastenLeiste, 0);
  window.HYBRIDDASH_PADKARTE = Object.freeze({ render: hdPadKarteRender, svg: hdPkSvg, stil: (s) => { hdPkStil = s; hdPadKarteRender(); } });
