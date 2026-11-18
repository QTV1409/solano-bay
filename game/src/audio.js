// Every sound is synthesized with the Web Audio API: no audio files, no network, nothing to
// 404. Three buses (sfx, music, ambience) feed one master gain into a compressor, so a gunshot,
// a crash and the music landing on the same frame do not clip. The context is created lazily
// inside the first user gesture; in screenshot mode the kit stays silent and never creates one.
import { createRandom } from './random.js';

// A minor pentatonic (A C D E G): every note in the bass and lead patterns is in key, so the
// 16-step loop at 116 BPM cannot play a wrong note. 0 = rest. Kick on 0/4/8/12, snare on 4/12.
const BPM = 116;
const BASS = [45, 0, 45, 45, 0, 48, 0, 45, 43, 0, 43, 45, 0, 52, 50, 0];
const LEAD = [69, 0, 0, 64, 0, 67, 0, 0, 64, 0, 0, 69, 0, 67, 64, 62];
const CHASE_BASS = [45, 45, 0, 45, 48, 0, 45, 45, 43, 43, 0, 45, 50, 0, 52, 48];
const CHASE_LEAD = [69, 0, 67, 0, 69, 0, 64, 0, 67, 0, 69, 0, 72, 0, 67, 64];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let ambBus = null;
  let noiseBuffer = null;
  let engineNodes = null;
  let sirenNodes = null;
  let ambientNodes = null;
  let musicTimer = null;
  let musicStep = 0;
  let musicNextTime = 0;
  let voices = 0;
  let muted = false;
  let silent = false;
  let chaseMode = false;
  const rng = createRandom(987654321);

  /** Create (or resume) the context inside a gesture; null when the browser has no Web Audio. */
  function ensure() {
    if (silent) return null;
    try {
      if (!ctx) {
        const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContextClass) return null;
        ctx = new AudioContextClass();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 6;
        master.connect(compressor);
        compressor.connect(ctx.destination);
        sfxBus = ctx.createGain();
        sfxBus.gain.value = 0.9;
        sfxBus.connect(master);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.5;
        musicBus.connect(master);
        ambBus = ctx.createGain();
        ambBus.gain.value = 0.5;
        ambBus.connect(master);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
        startLoops();
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function panNode(pan) {
    if (!ctx.createStereoPanner) return null;
    const node = ctx.createStereoPanner();
    node.pan.value = Math.max(-1, Math.min(1, pan ?? 0));
    return node;
  }

  function connectThrough(node, bus, pan) {
    const panner = panNode(pan);
    if (panner) {
      node.connect(panner);
      panner.connect(bus);
    } else {
      node.connect(bus);
    }
  }

  /** One tone: an oscillator through a gain envelope, with an optional pitch sweep. */
  function tone(bus, options) {
    if (!ctx || voices > 24) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, now);
    if (options.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.freqEnd), now + options.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.vol ?? 0.25), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.dur);
    let head = osc;
    if (options.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType ?? 'lowpass';
      filter.frequency.setValueAtTime(options.filterFreq, now);
      if (options.filterEnd) filter.frequency.exponentialRampToValueAtTime(options.filterEnd, now + options.dur);
      osc.connect(filter);
      head = filter;
    }
    head.connect(gain);
    connectThrough(gain, bus, options.pan);
    osc.start(now);
    osc.stop(now + options.dur + 0.05);
    voices += 1;
    osc.onended = () => {
      voices = Math.max(0, voices - 1);
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** One noise burst through a filter and a gain envelope, from the shared noise buffer. */
  function noise(bus, options) {
    if (!ctx || voices > 24) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type ?? 'lowpass';
    filter.frequency.setValueAtTime(options.freq ?? 2000, now);
    if (options.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.freqEnd), now + options.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.vol ?? 0.3), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.dur);
    source.connect(filter);
    filter.connect(gain);
    connectThrough(gain, bus, options.pan);
    source.start(now);
    source.stop(now + options.dur + 0.05);
    voices += 1;
    source.onended = () => {
      voices = Math.max(0, voices - 1);
      source.disconnect();
    };
  }

  function startLoops() {
    // Engine: two detuned saws plus a sub sine, always on at gain 0 until the player drives.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 300;
    engineFilter.connect(engineGain);
    engineGain.connect(sfxBus);
    const saw1 = ctx.createOscillator();
    saw1.type = 'sawtooth';
    saw1.frequency.value = 45;
    const saw2 = ctx.createOscillator();
    saw2.type = 'sawtooth';
    saw2.frequency.value = 47;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    saw1.connect(engineFilter);
    saw2.connect(engineFilter);
    sub.connect(subGain);
    subGain.connect(engineGain);
    saw1.start();
    saw2.start();
    sub.start();
    engineNodes = { gain: engineGain, filter: engineFilter, saw1, saw2, sub };

    // Siren: a triangle whose pitch a square LFO swings two-tone, always on at gain 0.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenGain.connect(sfxBus);
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 850;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenOsc.start();
    lfo.start();
    sirenNodes = { gain: sirenGain, osc: sirenOsc };

    // Ambience: looping noise through a low, slowly wandering lowpass — the city's bed.
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0;
    ambGain.connect(ambBus);
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 300;
    ambFilter.connect(ambGain);
    const ambSource = ctx.createBufferSource();
    ambSource.buffer = noiseBuffer;
    ambSource.loop = true;
    ambSource.connect(ambFilter);
    ambSource.start();
    const ambLfo = ctx.createOscillator();
    ambLfo.type = 'sine';
    ambLfo.frequency.value = 0.07;
    const ambLfoGain = ctx.createGain();
    ambLfoGain.gain.value = 90;
    ambLfo.connect(ambLfoGain);
    ambLfoGain.connect(ambFilter.frequency);
    ambLfo.start();
    ambientNodes = { gain: ambGain };
  }

  function scheduleStep(step, when) {
    const bass = chaseMode ? CHASE_BASS[step] : BASS[step];
    const lead = chaseMode ? CHASE_LEAD[step] : LEAD[step];
    if (bass) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(bass);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.5, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(musicBus);
      osc.start(when);
      osc.stop(when + 0.3);
    }
    if (lead) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(lead);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.22, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(when);
      osc.stop(when + 0.25);
    }
    if (step % 4 === 0) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.7, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(when);
      osc.stop(when + 0.15);
    }
    if (step % 8 === 4) {
      noise(musicBus, { dur: 0.09, vol: 0.18, type: 'bandpass', freq: 1800 });
    }
    if (step % 2 === 1) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 6000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.06, when + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(when);
      osc.stop(when + 0.06);
    }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    musicStep = 0;
    musicNextTime = ctx.currentTime + 0.05;
    musicTimer = window.setInterval(() => {
      while (musicNextTime < ctx.currentTime + 0.12) {
        scheduleStep(musicStep, musicNextTime);
        musicNextTime += 60 / BPM / 4;
        musicStep = (musicStep + 1) % 16;
      }
    }, 25);
  }

  return {
    ensure,
    setSilent(value) {
      silent = value;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(value ? 0 : 0.9, ctx.currentTime, 0.05);
    },
    isMuted() {
      return muted;
    },
    setChase(value) {
      chaseMode = value;
    },
    startMusic,
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    engine: {
      start() {
        if (ctx && engineNodes) engineNodes.gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.1);
      },
      stop() {
        if (ctx && engineNodes) engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      },
      setSpeed(ratio) {
        if (!ctx || !engineNodes) return;
        const speed = Math.max(0, Math.min(1, ratio));
        const freq = 45 + speed * 95;
        engineNodes.saw1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
        engineNodes.saw2.frequency.setTargetAtTime(freq * 1.02, ctx.currentTime, 0.08);
        engineNodes.sub.frequency.setTargetAtTime(30 + speed * 22, ctx.currentTime, 0.08);
        engineNodes.filter.frequency.setTargetAtTime(300 + speed * 1400, ctx.currentTime, 0.08);
      },
    },
    siren: {
      start() {
        if (ctx && sirenNodes) sirenNodes.gain.gain.setTargetAtTime(0.1, ctx.currentTime, 0.15);
      },
      stop() {
        if (ctx && sirenNodes) sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      },
    },
    ambient: {
      start() {
        if (ctx && ambientNodes) ambientNodes.gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.3);
      },
      stop() {
        if (ctx && ambientNodes) ambientNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      },
    },
    sfx: {
      click() {
        if (!ctx) return;
        tone(sfxBus, { type: 'square', freq: 880, dur: 0.06, vol: 0.18 });
      },
      pickup() {
        if (!ctx) return;
        tone(sfxBus, { type: 'sine', freq: 659, dur: 0.09, vol: 0.3 });
        window.setTimeout(() => tone(sfxBus, { type: 'sine', freq: 880, dur: 0.14, vol: 0.3 }), 90);
      },
      gunshot(pan) {
        if (!ctx) return;
        noise(sfxBus, { dur: 0.14, vol: 0.8, type: 'lowpass', freq: 3200, freqEnd: 400, pan });
        tone(sfxBus, { type: 'sine', freq: 150, freqEnd: 42, dur: 0.14, vol: 0.7, pan });
      },
      crash(pan) {
        if (!ctx) return;
        noise(sfxBus, { dur: 0.45, vol: 0.9, type: 'lowpass', freq: 2400, freqEnd: 140, pan });
        tone(sfxBus, { type: 'sine', freq: 95, freqEnd: 34, dur: 0.4, vol: 0.8, pan });
      },
      footstep(pan) {
        if (!ctx) return;
        noise(sfxBus, { dur: 0.09, vol: 0.25, type: 'bandpass', freq: 320 + rng() * 220, pan });
      },
    },
  };
}
