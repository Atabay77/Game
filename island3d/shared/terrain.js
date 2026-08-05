/* ==========================================================================
   Ada arazisi — sunucu ve istemci birebir aynı yüzeyi üretsin diye
   tamamen deterministik. Deniz seviyesi y = 0.
   ========================================================================== */

import { MAP_SIZE, NODE_COUNTS, NODES } from './constants.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Basit karma ve değer gürültüsü (kütüphanesiz, her yerde aynı sonuç) */

function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 2246822519;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, seed, oct = 4) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
        sum += valueNoise(x * freq, y * freq, seed + i * 97) * amp;
        norm += amp;
        amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
}

/* ----------------------------- Ada şekli ----------------------------- */

export function islandRadius(ang, seed) {
    const n = fbm(Math.cos(ang) * 1.6 + 10, Math.sin(ang) * 1.6 + 10, seed, 3);
    return 118
        + 24 * Math.sin(3 * ang + 1.2 + seed * 0.001)
        + 13 * Math.sin(5 * ang + 2.7)
        +  7 * Math.sin(8 * ang + 0.4)
        + 26 * (n - 0.5);
}

/** Verilen noktadaki zemin yüksekliği (deniz seviyesi = 0). */
export function heightAt(x, z, seed) {
    const d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const R = islandRadius(ang, seed);

    // Kıyıdan merkeze doğru yükselen kubbe
    const t = clamp(1 - d / R, -0.35, 1);
    if (t <= 0) {
        // Deniz tabanı: kıyıdan uzaklaştıkça derinleşir
        return -1.2 + t * 26;
    }

    const dome = Math.pow(t, 1.45) * 30;
    const hills = (fbm(x * 0.018 + 40, z * 0.018 + 40, seed, 4) - 0.5) * 16 * Math.pow(t, 0.6);
    const detail = (fbm(x * 0.09, z * 0.09, seed + 11, 3) - 0.5) * 2.2 * t;

    // Kumsal bandı: kıyıya yakın yerleri düzleştir
    const beach = clamp(t / 0.10, 0, 1);
    return (dome + hills + detail) * beach - 1.1 * (1 - beach);
}

export function normalAt(x, z, seed, eps = 0.8) {
    const hL = heightAt(x - eps, z, seed), hR = heightAt(x + eps, z, seed);
    const hD = heightAt(x, z - eps, seed), hU = heightAt(x, z + eps, seed);
    const nx = hL - hR, nz = hD - hU, ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz);
    return { x: nx / len, y: ny / len, z: nz / len };
}

export function slopeAt(x, z, seed) {
    return 1 - normalAt(x, z, seed).y;
}

/* ----------------------------- Kaynak dağılımı ----------------------------- */

const PLACEMENT = {
    // [min yükseklik, max yükseklik, max eğim]
    palm:  [0.4, 4.5, 0.28],
    tree:  [3.0, 26,  0.34],
    rock:  [0.6, 28,  0.55],
    bush:  [0.8, 20,  0.36],
    wreck: [0.1, 2.2, 0.30],
};

/** Tohumdan deterministik kaynak listesi üretir. */
export function makeNodes(seed) {
    const out = [];
    let id = 1;
    let n = 0;

    for (const type of Object.keys(NODE_COUNTS)) {
        const want = NODE_COUNTS[type];
        const [minH, maxH, maxS] = PLACEMENT[type];
        let placed = 0, guard = 0;

        while (placed < want && guard < want * 60) {
            guard++;
            const r1 = hash2(n, guard, seed + 5), r2 = hash2(guard, n, seed + 9);
            n++;
            const ang = r1 * Math.PI * 2;
            const rad = Math.sqrt(r2) * (MAP_SIZE * 0.46);
            const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;

            const h = heightAt(x, z, seed);
            if (h < minH || h > maxH) continue;
            if (slopeAt(x, z, seed) > maxS) continue;

            let tooClose = false;
            for (const o of out) {
                const dx = o.x - x, dz = o.z - z;
                if (dx * dx + dz * dz < 25) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const cfg = NODES[type];
            out.push({
                id: id++, type, x, z, y: h,
                ry: hash2(id, 7, seed) * Math.PI * 2,
                s: 0.8 + hash2(id, 13, seed) * 0.55,
                hp: cfg.hp, max: cfg.hp, alive: true, rt: 0,
            });
            placed++;
        }
    }
    return out;
}

/** Kumsalda oyuncu doğuş noktası. */
export function spawnPoint(seed, i = 0) {
    for (let k = 0; k < 200; k++) {
        const ang = (i * 0.7 + k * 0.31) % (Math.PI * 2);
        for (let r = 60; r < 150; r += 2) {
            const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
            const h = heightAt(x, z, seed);
            if (h > 0.6 && h < 2.2) return { x, y: h, z };
        }
    }
    return { x: 0, y: heightAt(0, 0, seed), z: 0 };
}
