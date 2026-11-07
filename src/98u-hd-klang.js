  // =====================================================================================
  // Hybrid-Dash 3.0: ENGINE SOUND - presence and exciter stage
  // =====================================================================================
  //
  // GEMELDET: "Can you check the engine sounds too? They don't sound right, they sound muffled."
  // Measured: most engine loops are rendered at 22 kHz / Vorbis q2 and carry almost nothing above 1-3 kHz (the
  // synthetic engines in tools/engine_synth.py roll their partials off fast; the recordings were band-limited when
  // encoded). The ear hears that as "through a wall". A filter cannot bring back what is not there, so this stage
  // does what a studio exciter does with a dull recording:
  //   dry ───────────────────────────────────────────────┐
  //   └─ highpass 150 Hz ─ soft saturation (tanh) ─ highpass 1 kHz ─ 0.4 ─────┴─ peaking +3 dB @ 1.8 kHz
  //                                                                             ─ high shelf ─ limiter ─ out
  // The saturation turns the 1-3 kHz content into its own upper harmonics (3-9 kHz), the highpass after it keeps
  // only those, and they are mixed back under the dry signal: brightness and "rasp" without hiss. Every engine sound
  // (recorded and synthetic, both player cars) passes the extras bus (xBus in 80-sound.js), which ends here.
  // Off in Options > Sound ("Clearer engine sound") for the original sound.
  const HD_KLANG_STORE = 'hybriddash.klang.v1';
  let hdKlangAn = (() => { try { return localStorage.getItem(HD_KLANG_STORE) !== 'aus'; } catch (e) { return true; } })();
  let hdKlangKnoten = null;
  function hdKlangKurve(drive) {
    const n = 2048, c = new Float32Array(n), nt = Math.tanh(drive);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / nt; }
    return c;
  }
  // Builds the stage in ctx (any AudioContext, also an OfflineAudioContext for the self-test) and returns its input.
  const HD_KLANG = { hp1: 150, drive: 7, hp2: 1000, anteil: 0.4, praesenzHz: 1800, praesenzDb: 3, luftHz: 4000, luftDb: 3 };
  function hdKlangKette(ctx, ziel, p) {
    const P = Object.assign({}, HD_KLANG, p || {});
    const aus = ziel || ctx.destination;
    const ein = ctx.createGain();
    const praesenz = ctx.createBiquadFilter(); praesenz.type = 'peaking'; praesenz.frequency.value = P.praesenzHz; praesenz.Q.value = 0.8;
    const luft = ctx.createBiquadFilter(); luft.type = 'highshelf'; luft.frequency.value = P.luftHz;
    const hp1 = ctx.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = P.hp1; hp1.Q.value = 0.7;
    const form = ctx.createWaveShaper(); form.curve = hdKlangKurve(P.drive); form.oversample = '2x';
    const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = P.hp2; hp2.Q.value = 0.7;
    const anteil = ctx.createGain();
    ein.connect(praesenz);
    ein.connect(hp1).connect(form).connect(hp2).connect(anteil).connect(praesenz);
    // Safety limiter: the added harmonics may push peaks over full scale; this holds them at about -1 dBFS.
    const grenze = ctx.createDynamicsCompressor();
    grenze.threshold.value = -2; grenze.knee.value = 1; grenze.ratio.value = 20; grenze.attack.value = 0.002; grenze.release.value = 0.08;
    praesenz.connect(luft).connect(grenze).connect(aus);
    const k = { ein, praesenz, luft, anteil, P };
    hdKlangSetzen(k, hdKlangAn);
    if (ctx === (typeof audioCtx !== 'undefined' ? audioCtx : null)) hdKlangKnoten = k;
    return ein;
  }
  function hdKlangSetzen(k, an) {
    if (!k) return;
    k.praesenz.gain.value = an ? k.P.praesenzDb : 0;
    k.luft.gain.value = an ? k.P.luftDb : 0;
    k.anteil.gain.value = an ? k.P.anteil : 0;
  }
  // The switch in Options > Sound, next to the engine-sound settings.
  (function hdKlangSchalter() {
    const nach = document.getElementById('setting-engine-extras');
    const zeile = nach && nach.closest('.opt-row');
    if (!zeile || document.getElementById('hd-klang-an')) return;
    const r = document.createElement('div');
    r.className = 'opt-row hd-row';
    r.innerHTML = '<span class="opt-label">Klarerer Motorklang</span>'
      + '<label class="tgl"><input type="checkbox" id="hd-klang-an"' + (hdKlangAn ? ' checked' : '') + '><span></span></label>';
    zeile.parentNode.insertBefore(r, zeile.nextSibling);
    r.querySelector('input').addEventListener('change', (e) => {
      hdKlangAn = e.target.checked;
      try { localStorage.setItem(HD_KLANG_STORE, hdKlangAn ? 'an' : 'aus'); } catch (err) { /* private */ }
      hdKlangSetzen(hdKlangKnoten, hdKlangAn);
    });
  })();
  window.HYBRIDDASH_KLANG = Object.freeze({ kette: hdKlangKette, an: () => hdKlangAn });
