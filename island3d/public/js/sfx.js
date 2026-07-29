/* Küçük WebAudio sentezleyici — hazır ses dosyası gerekmez. */

let ctx = null;
export const audio = { enabled: true };

function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

function tone({ freq = 440, dur = 0.12, type = 'triangle', gain = 0.05, slide = 0 }) {
    if (!audio.enabled) return;
    try {
        const a = ac();
        const o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, a.currentTime);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
        g.gain.setValueAtTime(gain, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(g); g.connect(a.destination);
        o.start(); o.stop(a.currentTime + dur);
    } catch (e) { /* ses yoksa sessiz geç */ }
}

function noise(dur = 0.2, gain = 0.05, filterHz = 900) {
    if (!audio.enabled) return;
    try {
        const a = ac();
        const n = Math.floor(a.sampleRate * dur);
        const buf = a.createBuffer(1, n, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = a.createBufferSource(); src.buffer = buf;
        const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz;
        const g = a.createGain(); g.gain.value = gain;
        src.connect(f); f.connect(g); g.connect(a.destination);
        src.start();
    } catch (e) { /* yok say */ }
}

export const sfx = {
    unlock() { try { ac(); } catch (e) {} },
    chop()   { tone({ freq: 210, dur: 0.09, type: 'square', gain: 0.035, slide: -80 }); noise(0.09, 0.03, 1400); },
    mine()   { tone({ freq: 150, dur: 0.09, type: 'square', gain: 0.04, slide: -50 }); noise(0.08, 0.04, 700); },
    pick()   { tone({ freq: 720, dur: 0.09, gain: 0.04, slide: 260 }); },
    craft()  { tone({ freq: 520, dur: 0.1, gain: 0.05 }); setTimeout(() => tone({ freq: 780, dur: 0.14, gain: 0.05 }), 90); },
    eat()    { tone({ freq: 340, dur: 0.13, type: 'sine', gain: 0.05, slide: 120 }); },
    hurt()   { tone({ freq: 190, dur: 0.22, type: 'sawtooth', gain: 0.06, slide: -110 }); },
    swing()  { noise(0.13, 0.035, 2200); },
    hit()    { tone({ freq: 120, dur: 0.16, type: 'square', gain: 0.06, slide: -60 }); noise(0.12, 0.05, 500); },
    splash() { noise(0.35, 0.05, 1100); },
    step()   { noise(0.06, 0.014, 420); },
    thunder(){ noise(1.3, 0.09, 260); },
    win()    { [520, 660, 784, 1046].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.28, gain: 0.055 }), i * 130)); },
    die()    { tone({ freq: 260, dur: 0.7, type: 'sawtooth', gain: 0.07, slide: -190 }); },
    chat()   { tone({ freq: 880, dur: 0.06, gain: 0.03 }); },
};
