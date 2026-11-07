  // =====================================================================================
  // Hybrid-Dash 3.0: SKIP THE START-OF-SESSION ANNOUNCEMENTS
  // =====================================================================================
  //
  // BESTELLT: "When session is starting, have an option to skip the announcements." While the race intro is
  // playing (welcome, mode, distance, weather, the starting grid car by car - 80d-rennintro.js), a button sits above
  // the cockpit: "Skip announcements". It, Enter, or the controller's confirmation button (bindings.confirm, else A /
  // Cross) end the intro at once; the start then goes on to the lights exactly as when the intro finishes by itself
  // (rennintroAbbrechen resolves the waiting start with false, and the start continues).
  let hdSkipKnopf = null, hdSkipVorher = false;
  function hdIntroSkip() {
    if (typeof rennintroAktiv === 'undefined' || !rennintroAktiv) return;
    log('Race intro skipped.', 'info');
    try { rennintroAbbrechen(); } catch (e) { /* already over */ }
    hdIntroSkipMalen();
  }
  function hdIntroSkipMalen() {
    let an = false;
    try { an = !!rennintroAktiv; } catch (e) { an = false; }
    if (!hdSkipKnopf && !an) return;
    if (!hdSkipKnopf) {
      hdSkipKnopf = document.createElement('button');
      hdSkipKnopf.type = 'button'; hdSkipKnopf.id = 'hd-intro-skip'; hdSkipKnopf.className = 'hd-intro-skip';
      hdSkipKnopf.setAttribute('data-i18n-skip', '');
      hdSkipKnopf.addEventListener('click', (e) => { e.stopPropagation(); hdIntroSkip(); });
      document.body.appendChild(hdSkipKnopf);
    }
    hdSkipKnopf.hidden = !an;
    if (an) hdSkipKnopf.innerHTML = '<span aria-hidden="true">&#x23ED;</span> ' + t('Ansagen überspringen') + ' <kbd>Enter</kbd>';
  }
  // Enter skips while the intro plays (not while typing).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !hdSkipKnopf || hdSkipKnopf.hidden) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.preventDefault(); e.stopPropagation(); hdIntroSkip();
  }, true);
  // Watch the intro and the controller's confirmation button (edge: pressed now, not before).
  setInterval(() => {
    hdIntroSkipMalen();
    if (!hdSkipKnopf || hdSkipKnopf.hidden) { hdSkipVorher = false; return; }
    let gedrueckt = false;
    try {
      const b = (typeof bindings !== 'undefined' && bindings.confirm && bindings.confirm.type !== 'none') ? bindings.confirm : { type: 'button', index: 0 };
      for (const pad of (navigator.getGamepads ? navigator.getGamepads() : [])) {
        if (pad && readBindingValue(pad, b) > BUTTON_CAPTURE_THRESHOLD) { gedrueckt = true; break; }
      }
    } catch (e) { gedrueckt = false; }
    if (gedrueckt && !hdSkipVorher) hdIntroSkip();
    hdSkipVorher = gedrueckt;
  }, 100);
  window.HYBRIDDASH_INTRO = Object.freeze({ skip: hdIntroSkip });
