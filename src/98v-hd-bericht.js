  // =====================================================================================
  // Hybrid-Dash 3.0: RACE SUMMARY after a session - save and export
  // =====================================================================================
  //
  // BESTELLT: "After a race session, can you add a feature that shows the race summary? With the option to save and
  // export that data?"
  //
  // finishRace (70-race.js) calls hdBerichtNachRennen() once per session. It takes a SNAPSHOT right away - classified
  // results (ovDaten, the same order as the standings and the podium), every car's lap times, the session (mode,
  // length, weather, track code, duration, aborted or not), pit stops / penalties of player 1 and the race-control
  // incident log - and shows it a few seconds later, after the podium has had its moment.
  //   Save     keeps it in this browser (hybriddash.berichte.v1, newest first, at most 50); "Saved summaries" lists
  //            them to reopen, export or delete.
  //   CSV      one file a spreadsheet opens directly: results, then every lap of every car, then the session facts.
  //   JSON     everything, for other tools.
  // Not after a challenge (it shows its own result) and not while the self-test suite runs.
  const HD_BERICHT_STORE = 'hybriddash.berichte.v1';
  const HD_BERICHT_MAX = 50;
  const HD_BERICHT_VERZUG_MS = 3500;
  let hdBerichtAktuell = null, hdBerichtBox = null, hdBerichtUhr = null;

  function hdBerichtEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function hdBerichtZeit(ms) {
    if (!(ms > 0)) return '–';
    const s = ms / 1000, m = Math.floor(s / 60);
    return m ? m + ':' + (s - m * 60).toFixed(3).padStart(6, '0') : s.toFixed(3) + ' s';
  }
  function hdBerichteLesen() { try { return JSON.parse(localStorage.getItem(HD_BERICHT_STORE) || '[]') || []; } catch (e) { return []; } }
  function hdBerichteSchreiben(l) { try { localStorage.setItem(HD_BERICHT_STORE, JSON.stringify(l.slice(0, HD_BERICHT_MAX))); return true; } catch (e) { return false; } }

  // ---- the snapshot ------------------------------------------------------------------------------------------------
  function hdBerichtSchnappschuss(abgebrochen) {
    let reihe = [], autos = [];
    try { reihe = ovDaten(); autos = raceAllCars(); } catch (e) { return null; }
    if (!autos.some((c) => c.laps && c.laps.length)) return null;   // nothing driven: no summary
    const runden = new Map(autos.map((c) => [c.id, (c.laps || []).map((l) => l.ms)]));
    const alleBesten = reihe.map((x) => x.beste).filter((x) => x > 0);
    const schnellste = alleBesten.length ? Math.min(...alleBesten) : null;
    const m = RACE_MODES[raceMode] || { label: raceMode, unit: '' };
    let strecke = '', teile = 0;
    try { strecke = typeof kCode === 'function' ? kCode() : ''; teile = (currentTrackTiles || []).length; } catch (e) { /* none */ }
    let dauer = 0;
    try { dauer = raceStartedAt ? Math.max(0, rennZeitJetzt() - raceStartedAt) : 0; } catch (e) { dauer = 0; }
    let meisterName = '';
    try {
      if (typeof meister !== 'undefined' && meister.lauf && meister.lauf.laeuft) {
        const ev = meister.plan.events[meister.lauf.laeuft.idx];
        meisterName = t('Meisterschaft') + ' · ' + ((ev && ev.name) || (t('Event') + ' ' + (meister.lauf.laeuft.idx + 1)));
      }
    } catch (e) { /* no championship */ }
    return {
      id: Date.now().toString(36),
      datum: new Date().toISOString(),
      modus: raceMode, modusName: t(m.label),
      limit: raceLimit, einheit: t(m.unit || ''),
      wetter: raceWxStart, strecke, teile, dauerMs: dauer, abgebrochen: !!abgebrochen, meister: meisterName,
      boxenstopps: typeof racePitDone === 'number' ? racePitDone : 0,
      pflichtstopps: typeof racePitRequired === 'number' ? racePitRequired : 0,
      schnellste,
      ergebnis: reihe.map((x) => ({
        pos: x.pos, name: x.name, farbe: x.farbe, rolle: x.rolle, id: x.id, runden: x.runden, summeMs: x.summe,
        luecke: x.luecke, besteMs: x.beste, dnf: x.dnf, dsq: x.dsq, strafeMs: x.strafeMs,
        zeiten: runden.get(x.id) || [],
      })),
      vorfaelle: (typeof hdRl !== 'undefined' && Array.isArray(hdRl.log) ? hdRl.log.slice().reverse() : []).map((v) => ({ zeit: v.zeit, text: v.text, art: v.art })),
    };
  }
  // Hook from finishRace (70-race.js).
  function hdBerichtNachRennen(auslaufen) {
    try {
      if (hdSuiteLaeuft()) return;
      if (typeof challengeLaeuft === 'function' && challengeLaeuft()) return;
    } catch (e) { /* not ready */ }
    const b = hdBerichtSchnappschuss(auslaufen === false);
    if (!b) return;
    hdBerichtAktuell = b;
    clearTimeout(hdBerichtUhr);
    hdBerichtUhr = setTimeout(() => hdBerichtZeigen(b), HD_BERICHT_VERZUG_MS);
  }

  // ---- export --------------------------------------------------------------------------------------------------------
  function hdBerichtDatei(name, inhalt, typ) {
    const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function hdBerichtDateiname(b, endung) {
    const d = b.datum.slice(0, 16).replace(/[:T]/g, '-');
    return 'hybrid-dash-' + (b.modus || 'session') + '-' + d + '.' + endung;
  }
  function hdBerichtCsv(b) {
    const qq = String.fromCharCode(34);   // the double quote, not written literally (the build's bracket check reads regexes as code)
    const q = (v) => { const s = String(v == null ? '' : v); return (s.includes(';') || s.includes(qq) || s.includes('\n')) ? qq + s.split(qq).join(qq + qq) + qq : s; };
    const sek = (ms) => (ms > 0 ? (ms / 1000).toFixed(3) : '');
    const z = [];
    z.push([t('Pos'), t('Fahrername'), t('Runden'), t('Gesamt (s)'), t('Rückstand'), t('Beste (s)'), t('Strafe (s)'), t('Status')].map(q).join(';'));
    b.ergebnis.forEach((x) => z.push([x.pos, x.name, x.runden, sek(x.summeMs), x.luecke, sek(x.besteMs), x.strafeMs ? (x.strafeMs / 1000).toFixed(1) : '',
      x.dsq ? 'DSQ' : x.dnf ? 'DNF' : ''].map(q).join(';')));
    z.push('');
    z.push([t('Fahrername'), t('Runde'), t('Zeit (s)')].map(q).join(';'));
    b.ergebnis.forEach((x) => x.zeiten.forEach((ms, i) => z.push([x.name, i + 1, sek(ms)].map(q).join(';'))));
    z.push('');
    z.push([t('Sitzung'), t('Wert')].map(q).join(';'));
    [[t('Datum'), new Date(b.datum).toLocaleString()], [t('Modus'), b.modusName], [t('Länge'), b.limit ? b.limit + ' ' + b.einheit : '∞'],
     [t('Wetter'), b.wetter], [t('Strecke'), b.strecke ? b.strecke + ' (' + b.teile + ')' : '–'], [t('Dauer'), hdBerichtZeit(b.dauerMs)],
     [t('Abgebrochen'), b.abgebrochen ? t('ja') : t('nein')], [t('Boxenstopps'), b.boxenstopps + ' / ' + b.pflichtstopps], [t('Schnellste Runde (s)'), sek(b.schnellste)]]
      .concat(b.meister ? [[t('Meisterschaft'), b.meister]] : [])
      .forEach((r) => z.push(r.map(q).join(';')));
    if (b.vorfaelle.length) {
      z.push('');
      z.push([t('Zeit'), t('Vorfall')].map(q).join(';'));
      b.vorfaelle.forEach((v) => z.push([v.zeit, v.text].map(q).join(';')));
    }
    return '﻿' + z.join('\r\n') + '\r\n';
  }

  // ---- the window ----------------------------------------------------------------------------------------------------
  function hdBerichtHtml(b, gespeichert) {
    const sieger = b.ergebnis[0];
    const kopf = '<div class="hdb-kopf"><div><small>' + hdBerichtEsc(t('Rennbericht')) + (b.meister ? ' · ' + hdBerichtEsc(b.meister) : '') + '</small>'
      + '<b>' + hdBerichtEsc(b.modusName) + (b.abgebrochen ? ' <span class="hdb-ab">' + hdBerichtEsc(t('abgebrochen')) + '</span>' : '') + '</b>'
      + '<span>' + hdBerichtEsc(new Date(b.datum).toLocaleString()) + '</span></div>'
      + '<button type="button" class="hdb-zu" data-hdb="zu" aria-label="' + hdBerichtEsc(t('Schließen')) + '">&#10005;</button></div>';
    const fakten = [[t('Sieger'), sieger ? sieger.name : '–'], [t('Schnellste Runde'), hdBerichtZeit(b.schnellste)],
      [t('Dauer'), hdBerichtZeit(b.dauerMs)], [t('Länge'), b.limit ? b.limit + ' ' + b.einheit : '∞'],
      [t('Strecke'), b.strecke ? b.strecke + ' · ' + b.teile + ' ' + t('Teile') : '–'], [t('Boxenstopps'), b.boxenstopps + (b.pflichtstopps ? ' / ' + b.pflichtstopps : '')]];
    const kacheln = '<div class="hdb-fakten">' + fakten.map(([l, w]) => '<div><small>' + hdBerichtEsc(l) + '</small><b>' + hdBerichtEsc(w) + '</b></div>').join('') + '</div>';
    const tabelle = '<table class="hdb-tab"><thead><tr><th>' + hdBerichtEsc(t('Pos')) + '</th><th>' + hdBerichtEsc(t('Fahrername')) + '</th><th>' + hdBerichtEsc(t('Runden'))
      + '</th><th>' + hdBerichtEsc(t('Beste')) + '</th><th>' + hdBerichtEsc(t('Rückstand')) + '</th></tr></thead><tbody>'
      + b.ergebnis.map((x) => '<tr' + (x.besteMs && x.besteMs === b.schnellste ? ' class="fl"' : '') + '><td>' + (x.dsq ? 'DSQ' : x.dnf ? 'DNF' : 'P' + x.pos) + '</td>'
        + '<td><i style="background:' + hdBerichtEsc(x.farbe || '#888') + '"></i>' + hdBerichtEsc(x.name) + '</td><td>' + x.runden + '</td>'
        + '<td>' + hdBerichtZeit(x.besteMs) + '</td><td>' + hdBerichtEsc(x.luecke || '') + (x.strafeMs ? ' <small>+' + Math.round(x.strafeMs / 1000) + 's</small>' : '') + '</td></tr>').join('')
      + '</tbody></table>';
    const vorf = b.vorfaelle.length ? '<div class="hdb-vorf"><small>' + hdBerichtEsc(t('Vorfälle')) + '</small>'
      + b.vorfaelle.slice(-12).map((v) => '<div><b>' + hdBerichtEsc(v.zeit) + '</b> ' + hdBerichtEsc(v.text) + '</div>').join('') + '</div>' : '';
    const fuss = '<div class="hdb-fuss">'
      + '<button type="button" class="primary" data-hdb="speichern"' + (gespeichert ? ' disabled' : '') + '>' + hdBerichtEsc(gespeichert ? t('Gespeichert') : t('Speichern')) + '</button>'
      + '<button type="button" data-hdb="csv">' + hdBerichtEsc(t('Als CSV exportieren')) + '</button>'
      + '<button type="button" data-hdb="json">' + hdBerichtEsc(t('Als JSON exportieren')) + '</button>'
      + '<button type="button" data-hdb="liste">' + hdBerichtEsc(t('Gespeicherte Berichte')) + ' (' + hdBerichteLesen().length + ')</button></div>';
    return '<div class="hdb-karte">' + kopf + kacheln + tabelle + vorf + fuss + '</div>';
  }
  function hdBerichtListeHtml() {
    const l = hdBerichteLesen();
    return '<div class="hdb-karte"><div class="hdb-kopf"><div><small>' + hdBerichtEsc(t('Rennbericht')) + '</small><b>' + hdBerichtEsc(t('Gespeicherte Berichte')) + '</b></div>'
      + '<button type="button" class="hdb-zu" data-hdb="zu" aria-label="' + hdBerichtEsc(t('Schließen')) + '">&#10005;</button></div>'
      + (l.length ? '<div class="hdb-liste">' + l.map((b) => '<div class="hdb-eintrag"><button type="button" data-hdb="oeffnen" data-id="' + hdBerichtEsc(b.id) + '"><b>'
        + hdBerichtEsc(b.modusName) + (b.meister ? ' · ' + hdBerichtEsc(b.meister) : '') + '</b><span>' + hdBerichtEsc(new Date(b.datum).toLocaleString()) + ' · '
        + hdBerichtEsc(t('Sieger')) + ': ' + hdBerichtEsc((b.ergebnis[0] || {}).name || '–') + '</span></button>'
        + '<button type="button" class="hdb-weg" data-hdb="loeschen" data-id="' + hdBerichtEsc(b.id) + '" aria-label="' + hdBerichtEsc(t('Löschen')) + '">&#10005;</button></div>').join('') + '</div>'
        : '<p class="hdb-leer">' + hdBerichtEsc(t('Noch keine Berichte gespeichert.')) + '</p>')
      + '</div>';
  }
  function hdBerichtFenster() {
    if (!hdBerichtBox) {
      hdBerichtBox = document.createElement('div');
      hdBerichtBox.id = 'hd-bericht'; hdBerichtBox.className = 'hd-bericht';
      hdBerichtBox.setAttribute('role', 'dialog'); hdBerichtBox.setAttribute('aria-modal', 'true'); hdBerichtBox.setAttribute('data-i18n-skip', '');
      document.body.appendChild(hdBerichtBox);
      hdBerichtBox.addEventListener('click', hdBerichtKlick);
    }
    hdBerichtBox.hidden = false;
    return hdBerichtBox;
  }
  function hdBerichtZeigen(b) {
    if (!b) return;
    hdBerichtAktuell = b;
    const gespeichert = hdBerichteLesen().some((x) => x.id === b.id);
    hdBerichtFenster().innerHTML = hdBerichtHtml(b, gespeichert);
  }
  function hdBerichtListeZeigen() { hdBerichtFenster().innerHTML = hdBerichtListeHtml(); }
  function hdBerichtZu() { if (hdBerichtBox) hdBerichtBox.hidden = true; }
  function hdBerichtKlick(e) {
    if (e.target === hdBerichtBox) { hdBerichtZu(); return; }
    const k = e.target.closest('[data-hdb]');
    if (!k) return;
    const was = k.dataset.hdb, b = hdBerichtAktuell;
    if (was === 'zu') hdBerichtZu();
    else if (was === 'speichern' && b) {
      const l = hdBerichteLesen().filter((x) => x.id !== b.id);
      l.unshift(b);
      if (hdBerichteSchreiben(l)) { showHudToast(t('Bericht gespeichert')); hdBerichtZeigen(b); }
      else showHudToast(t('Speichern nicht möglich (Speicher voll?)'));
    } else if (was === 'csv' && b) hdBerichtDatei(hdBerichtDateiname(b, 'csv'), hdBerichtCsv(b), 'text/csv;charset=utf-8');
    else if (was === 'json' && b) hdBerichtDatei(hdBerichtDateiname(b, 'json'), JSON.stringify(b, null, 2), 'application/json');
    else if (was === 'liste') hdBerichtListeZeigen();
    else if (was === 'oeffnen') { const x = hdBerichteLesen().find((y) => y.id === k.dataset.id); if (x) hdBerichtZeigen(x); }
    else if (was === 'loeschen') { hdBerichteSchreiben(hdBerichteLesen().filter((y) => y.id !== k.dataset.id)); hdBerichtListeZeigen(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdBerichtBox && !hdBerichtBox.hidden) { e.preventDefault(); e.stopPropagation(); hdBerichtZu(); } }, true);

  // The saved reports are also reachable without a race: a button on the Statistics page.
  (function hdBerichtKnopf() {
    const seite = document.getElementById('sub-opt-stats');
    if (!seite || document.getElementById('hd-bericht-knopf')) return;
    const r = document.createElement('div');
    r.className = 'opt-row opt-breit';
    r.innerHTML = '<button type="button" id="hd-bericht-knopf">Gespeicherte Rennberichte</button>';
    const h = seite.querySelector('h2');
    seite.insertBefore(r, h ? h.nextSibling : seite.firstChild);
    r.querySelector('button').addEventListener('click', hdBerichtListeZeigen);
  })();

  window.HYBRIDDASH_BERICHT = Object.freeze({
    zeigen: () => hdBerichtZeigen(hdBerichtAktuell), liste: hdBerichtListeZeigen, gespeichert: hdBerichteLesen,
    csv: hdBerichtCsv, _schnappschuss: hdBerichtSchnappschuss, _test: (b) => { hdBerichtAktuell = b; hdBerichtZeigen(b); },
  });
