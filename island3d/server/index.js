/* ==========================================================================
   Issız Ada 3B — oyun sunucusu
   Dünyanın tek doğru kaynağı burasıdır: kaynaklar, yapılar, hayvanlar,
   envanterler, hava ve zaman sunucuda simüle edilir, istemcilere yayınlanır.
   ========================================================================== */

import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';

import {
    TICK_HZ, NET_HZ, DAY_SECONDS, MAP_SIZE, ITEMS, NODES, TOOLS,
    RECIPES, TUNING, BUILD_INFO, PLAYER_COLORS, WEATHER,
    GATHER_BASE, GATHER_RIGHT,
} from '../shared/constants.js';
import { heightAt, makeNodes, spawnPoint } from '../shared/terrain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SAVE_FILE = path.join(ROOT, 'world.save.json');
const PORT = process.env.PORT || 3000;

/* --------------------------- HTTP --------------------------- */

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/vendor', express.static(path.join(ROOT, 'node_modules/three/build')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* --------------------------- Yardımcılar --------------------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const d2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const p of players.values()) {
        if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s);
    }
}
function sys(text, kind = 'info') { broadcast({ t: 'sys', text, kind }); }

/* --------------------------- Dünya --------------------------- */

const world = {
    seed: Math.floor(Math.random() * 100000),
    nodes: [],
    builds: [],
    animals: [],
    chest: {},
    time: 0.32,          // 0..1 gün oranı (0 = gece yarısı)
    day: 1,
    weather: 'clear',
    weatherT: 0,
    nextId: 1,
    raft: null,          // { id, boardT }
    over: false,
};

const players = new Map();   // ws -> player
let profiles = {};           // isim -> { inv, tools, equipped } (yeniden bağlanınca geri yüklenir)

function newWorld() {
    world.nodes = makeNodes(world.seed);
    world.builds = [];
    world.animals = [];
    world.chest = {};
    world.time = 0.32;
    world.day = 1;
    world.weather = 'clear';
    world.weatherT = rand(80, 160);
    world.nextId = 100000;
    world.raft = null;
    world.over = false;
    for (let i = 0; i < 10; i++) spawnAnimal('boar');
    for (let i = 0; i < 8; i++) spawnAnimal('crab');
    for (let i = 0; i < 3; i++) spawnAnimal('shark');
}

function saveWorld() {
    try {
        const data = {
            seed: world.seed,
            nodes: world.nodes.map(n => ({ id: n.id, hp: n.hp, alive: n.alive, rt: n.rt })),
            builds: world.builds,
            chest: world.chest,
            time: world.time, day: world.day, nextId: world.nextId,
            raft: world.raft, profiles,
        };
        fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
    } catch (e) {
        console.warn('Kayıt başarısız:', e.message);
    }
}

function loadWorld() {
    if (!fs.existsSync(SAVE_FILE)) return false;
    try {
        const d = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
        world.seed = d.seed;
        world.nodes = makeNodes(world.seed);
        const byId = new Map(world.nodes.map(n => [n.id, n]));
        for (const s of d.nodes || []) {
            const n = byId.get(s.id);
            if (n) { n.hp = s.hp; n.alive = s.alive; n.rt = s.rt; }
        }
        world.builds = d.builds || [];
        world.chest = d.chest || {};
        world.time = d.time ?? 0.32;
        world.day = d.day ?? 1;
        world.nextId = d.nextId ?? 100000;
        world.raft = d.raft || null;
        profiles = d.profiles || {};
        world.animals = [];
        for (let i = 0; i < 10; i++) spawnAnimal('boar');
        for (let i = 0; i < 8; i++) spawnAnimal('crab');
        for (let i = 0; i < 3; i++) spawnAnimal('shark');
        console.log('Kayıtlı dünya yüklendi (gün ' + world.day + ').');
        return true;
    } catch (e) {
        console.warn('Kayıt okunamadı, yeni dünya kuruluyor:', e.message);
        return false;
    }
}

if (!loadWorld()) newWorld();

/* --------------------------- Hayvanlar --------------------------- */

function spawnAnimal(kind) {
    for (let i = 0; i < 300; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * MAP_SIZE * 0.46;
        const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        const h = heightAt(x, z, world.seed);
        const ok = kind === 'shark' ? h < -3
                 : kind === 'crab'  ? (h > 0.1 && h < 2.0)
                 : (h > 1.5 && h < 26);
        if (!ok) continue;
        world.animals.push({
            id: world.nextId++, kind, x, z, y: Math.max(h, kind === 'shark' ? -1 : h),
            ry: Math.random() * Math.PI * 2,
            hp: kind === 'boar' ? 60 : kind === 'shark' ? 90 : 12,
            vx: 0, vz: 0, cd: 0, wander: rand(1, 4), target: null, state: 'idle',
        });
        return;
    }
}

/* --------------------------- Oyuncu --------------------------- */

function makePlayer(ws, name) {
    const idx = players.size;
    const sp = spawnPoint(world.seed, idx);
    const prof = profiles[name] || {};
    return {
        ws,
        id: world.nextId++,
        name: name.slice(0, 14) || ('Kaşif' + randi(10, 99)),
        color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
        x: sp.x, y: sp.y, z: sp.z, ry: 0, anim: 'idle',
        hp: 100, food: 100, water: 100, sta: 100,
        alive: true, sleeping: false, inWater: false,
        inv: prof.inv ? { ...prof.inv } : {},
        tools: new Set(prof.tools || []),
        equipped: prof.equipped || null,
        gatherId: null, gatherProg: 0, fishing: false, fishProg: 0,
        hitCd: 0, home: { ...sp }, deaths: prof.deaths || 0, gathered: prof.gathered || 0,
    };
}

function saveProfile(p) {
    profiles[p.name] = {
        inv: p.inv, tools: [...p.tools], equipped: p.equipped,
        deaths: p.deaths, gathered: p.gathered,
    };
}

const give = (p, item, n) => { if (n > 0) { p.inv[item] = (p.inv[item] || 0) + n; } };
const count = (p, item) => p.inv[item] || 0;
function takeItem(p, item, n) {
    if (count(p, item) < n) return false;
    p.inv[item] -= n;
    if (p.inv[item] <= 0) delete p.inv[item];
    return true;
}

function sendInv(p) {
    send(p.ws, { t: 'inv', inv: p.inv, tools: [...p.tools], equipped: p.equipped });
}
function sendChest() {
    broadcast({ t: 'chest', items: world.chest });
}
function sendBuilds() {
    broadcast({ t: 'builds', list: world.builds });
}
function sendNodeUpdate(n) {
    broadcast({ t: 'nodes', list: [{ id: n.id, hp: n.hp, alive: n.alive }] });
}

/* --------------------------- Bağlantı --------------------------- */

wss.on('connection', ws => {
    let p = null;

    ws.on('message', raw => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }

        if (!p) {
            if (m.t !== 'join') return;
            p = makePlayer(ws, String(m.name || '').trim());
            players.set(ws, p);
            send(ws, {
                t: 'init',
                seed: world.seed,
                id: p.id,
                you: { name: p.name, color: p.color, x: p.x, y: p.y, z: p.z },
                nodes: world.nodes.map(n => ({
                    id: n.id, type: n.type, x: n.x, y: n.y, z: n.z, ry: n.ry, s: n.s,
                    hp: n.hp, alive: n.alive,
                })),
                builds: world.builds,
                chest: world.chest,
                time: world.time, day: world.day, weather: world.weather,
                recipes: RECIPES.map(r => r.id),
            });
            sendInv(p);
            sys(`${p.name} adaya çıktı`, 'join');
            console.log(`+ ${p.name} bağlandı (${players.size} oyuncu)`);
            return;
        }

        handle(p, m);
    });

    ws.on('close', () => {
        if (p) {
            saveProfile(p);
            players.delete(ws);
            sys(`${p.name} ayrıldı`, 'leave');
            console.log(`- ${p.name} ayrıldı (${players.size} oyuncu)`);
            saveWorld();
        }
    });

    ws.on('error', () => { /* yok say */ });
});

/* --------------------------- Mesaj işleyici --------------------------- */

function handle(p, m) {
    switch (m.t) {
        case 'move':
            if (!p.alive) break;
            p.x = clamp(+m.x || 0, -MAP_SIZE / 2, MAP_SIZE / 2);
            p.y = +m.y || 0;
            p.z = clamp(+m.z || 0, -MAP_SIZE / 2, MAP_SIZE / 2);
            p.ry = +m.ry || 0;
            p.anim = m.anim || 'idle';
            p.inWater = !!m.inWater;
            break;

        case 'gather': {
            const n = world.nodes.find(x => x.id === m.id);
            if (!n || !n.alive || !p.alive) break;
            if (d2(p, n) > 36) break;
            if (p.gatherId !== n.id) { p.gatherId = n.id; p.gatherProg = 0; }
            break;
        }
        case 'gatherStop':
            p.gatherId = null; p.gatherProg = 0;
            send(p.ws, { t: 'prog', v: 0 });
            break;

        case 'fish':
            if (!p.alive) break;
            p.fishing = true;
            break;
        case 'fishStop':
            p.fishing = false; p.fishProg = 0;
            send(p.ws, { t: 'prog', v: 0 });
            break;

        case 'equip':
            if (m.tool === null || p.tools.has(m.tool)) { p.equipped = m.tool; sendInv(p); }
            break;

        case 'hit': {
            if (!p.alive || p.hitCd > 0) break;
            p.hitCd = 0.55;
            const tool = TOOLS[p.equipped];
            const dmg = tool ? tool.dmg : 7;
            let hitSomething = false;
            for (const a of world.animals) {
                if (d2(p, a) > 9) continue;
                const ang = Math.atan2(a.x - p.x, a.z - p.z);
                let diff = Math.abs(((ang - p.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                if (diff > 1.1) continue;
                a.hp -= dmg;
                a.state = 'hurt';
                a.target = p.id;
                hitSomething = true;
                broadcast({ t: 'fx', kind: 'hit', x: a.x, y: a.y + 1, z: a.z });
                if (a.hp <= 0) killAnimal(a, p);
                break;
            }
            send(p.ws, { t: 'swing', hit: hitSomething });
            break;
        }

        // Test/geliştirme kolaylığı: DEV_CHEATS=1 ile sunucuyu başlatınca açılır
        case 'give':
            if (process.env.DEV_CHEATS !== '1') break;
            for (const k in (m.items || {})) if (ITEMS[k]) give(p, k, m.items[k]);
            sendInv(p);
            break;

        case 'craft': craft(p, m.id); break;
        case 'place': place(p, m.id, m.x, m.z, m.ry); break;
        case 'use':   useBuild(p, m.id); break;

        case 'chest': {
            const b = world.builds.find(x => x.id === m.id && x.type === 'chest');
            if (!b || d2(p, b) > 25) break;
            const item = m.item, n = clamp(+m.n || 1, 1, 999);
            if (!ITEMS[item]) break;
            if (m.act === 'put') {
                const have = Math.min(count(p, item), n);
                if (have > 0) { takeItem(p, item, have); world.chest[item] = (world.chest[item] || 0) + have; }
            } else {
                const have = Math.min(world.chest[item] || 0, n);
                if (have > 0) {
                    world.chest[item] -= have;
                    if (world.chest[item] <= 0) delete world.chest[item];
                    give(p, item, have);
                }
            }
            sendInv(p); sendChest();
            break;
        }

        case 'eat': {
            const it = ITEMS[m.item];
            if (!it || !p.alive) break;
            if (!(it.food || it.water || it.hp)) break;
            if (!takeItem(p, m.item, 1)) break;
            if (it.food)  p.food  = clamp(p.food + it.food, 0, 100);
            if (it.water) p.water = clamp(p.water + it.water, 0, 100);
            if (it.hp)    p.hp    = clamp(p.hp + it.hp, 0, 100);
            send(p.ws, { t: 'sys', text: `${it.icon} ${it.name} kullanıldı`, kind: it.hp < 0 ? 'bad' : 'good' });
            sendInv(p);
            break;
        }

        case 'sleep':
            p.sleeping = !!m.on && p.alive;
            checkSleep();
            break;

        case 'chat': {
            const text = String(m.text || '').slice(0, 160).trim();
            if (text) broadcast({ t: 'chat', from: p.name, color: p.color, text });
            break;
        }

        case 'respawn':
            if (p.alive) break;
            respawn(p);
            break;

        case 'board':
            if (!world.raft || !p.alive) break;
            if (world.raft.boardT === null) {
                world.raft.boardT = 30;
                sys('🛶 Sal hazır! 30 saniye içinde herkes salın yanına gelsin!', 'good');
            }
            break;
    }
}

/* --------------------------- Üretim --------------------------- */

function nearBuild(p, type, range = 8) {
    return world.builds.some(b => b.type === type && d2(p, b) < range * range);
}

function craft(p, id) {
    const r = RECIPES.find(x => x.id === id);
    if (!r || !p.alive) return;
    if (r.kind === 'tool' && p.tools.has(id)) {
        send(p.ws, { t: 'sys', text: 'Bu alet zaten sende var', kind: 'bad' });
        return;
    }
    if (r.bench && !nearBuild(p, 'bench')) {
        send(p.ws, { t: 'sys', text: 'Çalışma tezgâhının yanında olmalısın', kind: 'bad' });
        return;
    }
    for (const k in r.cost) {
        if (count(p, k) < r.cost[k]) {
            send(p.ws, { t: 'sys', text: 'Malzemen yetmiyor', kind: 'bad' });
            return;
        }
    }
    if (r.id === 'raft' && world.raft) {
        send(p.ws, { t: 'sys', text: 'Sal zaten yapıldı', kind: 'bad' });
        return;
    }

    // Yapılarda malzeme yerleştirme anında düşer; iptal edersen kaybolmaz
    if (r.kind === 'build') {
        send(p.ws, { t: 'ghost', id: r.id });
        return;
    }

    for (const k in r.cost) takeItem(p, k, r.cost[k]);

    if (r.kind === 'tool') {
        p.tools.add(id);
        if (!p.equipped) p.equipped = id;
        send(p.ws, { t: 'sys', text: `${r.icon} ${r.name} yapıldı`, kind: 'good' });
        sendInv(p);
    } else if (r.kind === 'item') {
        give(p, id, 1);
        send(p.ws, { t: 'sys', text: `${r.icon} ${r.name} yapıldı`, kind: 'good' });
        sendInv(p);
    }
}

function place(p, id, x, z, ry) {
    const r = RECIPES.find(v => v.id === id);
    if (!r || r.kind !== 'build' || !p.alive) return;
    x = +x; z = +z;
    if (!isFinite(x) || !isFinite(z)) return;
    if (d2(p, { x, z }) > 100) { send(p.ws, { t: 'sys', text: 'Çok uzak', kind: 'bad' }); return; }

    // Malzeme ve şartlar yerleştirme anında yeniden doğrulanır
    if (r.bench && !nearBuild(p, 'bench')) {
        send(p.ws, { t: 'sys', text: 'Çalışma tezgâhının yanında olmalısın', kind: 'bad' });
        return;
    }
    if (id === 'raft' && world.raft) {
        send(p.ws, { t: 'sys', text: 'Sal zaten yapıldı', kind: 'bad' });
        return;
    }
    for (const k in r.cost) {
        if (count(p, k) < r.cost[k]) {
            send(p.ws, { t: 'sys', text: 'Malzemen yetmiyor', kind: 'bad' });
            return;
        }
    }

    const h = heightAt(x, z, world.seed);
    if (id === 'raft') {
        if (h > 1.6 || h < -2.5) { send(p.ws, { t: 'sys', text: 'Sal ancak su kenarına kurulur', kind: 'bad' }); return; }
    } else if (h < 0.5) {
        send(p.ws, { t: 'sys', text: 'Burası su, kuru zemine kur', kind: 'bad' });
        return;
    }

    for (const k in r.cost) takeItem(p, k, r.cost[k]);
    sendInv(p);

    const b = {
        id: world.nextId++, type: id, x, y: h, z, ry: +ry || 0,
        owner: p.name, fuel: id === 'fire' ? 90 : 0, water: 0, tick: 0,
    };
    world.builds.push(b);
    if (id === 'raft') {
        world.raft = { id: b.id, boardT: null };
        sys(`🛶 ${p.name} KAÇIŞ SALINI kurdu! Salı kullanıp geri sayımı başlatın.`, 'good');
    } else {
        send(p.ws, { t: 'sys', text: `${r.icon} ${r.name} kuruldu`, kind: 'good' });
    }
    if (id === 'shelter') p.home = { x, y: h, z };
    sendBuilds();
    saveWorld();
}

function useBuild(p, id) {
    const b = world.builds.find(x => x.id === id);
    if (!b || !p.alive || d2(p, b) > 36) return;

    if (b.type === 'fire') {
        if (count(p, 'et') > 0)     { takeItem(p, 'et', 1);    give(p, 'etP', 1);    send(p.ws, { t: 'sys', text: '🍖 Et pişti', kind: 'good' }); }
        else if (count(p, 'balik') > 0) { takeItem(p, 'balik', 1); give(p, 'balikP', 1); send(p.ws, { t: 'sys', text: '🍤 Balık pişti', kind: 'good' }); }
        else if (count(p, 'odun') > 0)  { takeItem(p, 'odun', 1);  b.fuel = Math.min(300, b.fuel + TUNING.fireFuelPerWood); send(p.ws, { t: 'sys', text: '🔥 Ateşe odun attın', kind: 'good' }); sendBuilds(); }
        else send(p.ws, { t: 'sys', text: 'Pişirecek bir şeyin yok', kind: 'bad' });
        sendInv(p);
        return;
    }
    if (b.type === 'still') {
        if (b.water >= 1) { b.water--; give(p, 'su', 1); send(p.ws, { t: 'sys', text: '💧 Temiz su aldın', kind: 'good' }); sendInv(p); sendBuilds(); }
        else send(p.ws, { t: 'sys', text: 'Damıtıcı hâlâ çalışıyor', kind: 'bad' });
        return;
    }
    if (b.type === 'shelter') {
        p.home = { x: b.x, y: b.y, z: b.z };
        p.sleeping = !p.sleeping;
        send(p.ws, { t: 'sys', text: p.sleeping ? '😴 Uyuyorsun — herkes uyursa sabah olur' : 'Uyanıksın', kind: 'good' });
        send(p.ws, { t: 'sleepState', on: p.sleeping });
        checkSleep();
        return;
    }
    if (b.type === 'chest') { send(p.ws, { t: 'openChest', id: b.id, items: world.chest }); return; }
    if (b.type === 'bench') { send(p.ws, { t: 'openCraft', bench: true }); return; }
    if (b.type === 'raft')  { handle(p, { t: 'board' }); return; }
}

/* --------------------------- Uyku --------------------------- */

function checkSleep() {
    const alive = [...players.values()].filter(p => p.alive);
    if (!alive.length) return;
    if (alive.every(p => p.sleeping)) {
        world.time = 0.27;
        world.day++;
        for (const p of alive) {
            p.sleeping = false;
            p.sta = 100;
            p.hp = clamp(p.hp + 20, 0, 100);
            p.food = clamp(p.food - 12, 0, 100);
            p.water = clamp(p.water - 16, 0, 100);
            send(p.ws, { t: 'sleepState', on: false });
        }
        sys('🌅 Ekip uyudu — yeni bir gün başladı', 'good');
    }
}

/* --------------------------- Ölüm --------------------------- */

function killPlayer(p, reason) {
    if (!p.alive) return;
    p.alive = false;
    p.sleeping = false;
    p.deaths++;
    p.gatherId = null; p.fishing = false;

    // Eşyaların bir kısmı kaybolur
    for (const k of Object.keys(p.inv)) {
        const keep = Math.floor(p.inv[k] * (1 - TUNING.respawnPenalty));
        if (keep > 0) p.inv[k] = keep; else delete p.inv[k];
    }
    send(p.ws, { t: 'dead', reason });
    sendInv(p);
    sys(`💀 ${p.name} öldü — ${reason}`, 'bad');
}

function respawn(p) {
    const home = p.home || spawnPoint(world.seed, 0);
    p.x = home.x; p.z = home.z;
    p.y = heightAt(p.x, p.z, world.seed);
    p.hp = 65; p.food = 55; p.water = 55; p.sta = 100;
    p.alive = true;
    send(p.ws, { t: 'respawned', x: p.x, y: p.y, z: p.z });
    sendInv(p);
}

function killAnimal(a, byPlayer) {
    const drops = a.kind === 'boar' ? { et: randi(2, 4), lif: 1 }
                : a.kind === 'shark' ? { et: randi(3, 5) }
                : { et: 1 };
    for (const k in drops) give(byPlayer, k, drops[k]);
    sendInv(byPlayer);
    send(byPlayer.ws, { t: 'sys', text: `🥩 ${a.kind === 'crab' ? 'Yengeç' : a.kind === 'shark' ? 'Köpekbalığı' : 'Domuz'} avladın`, kind: 'good' });
    broadcast({ t: 'fx', kind: 'death', x: a.x, y: a.y + 1, z: a.z });
    world.animals.splice(world.animals.indexOf(a), 1);
}

/* --------------------------- Simülasyon --------------------------- */

let lastTick = Date.now();
let netAcc = 0;
let saveAcc = 0;

function tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;

    const prevTime = world.time;
    world.time = (world.time + dt / DAY_SECONDS) % 1;
    if (world.time < prevTime) world.day++;

    const hour = world.time * 24;
    const night = hour < 6 || hour > 20;
    const dark = night ? 1 : (hour > 18.5 ? (hour - 18.5) / 1.5 : 0);

    /* --- Hava --- */
    world.weatherT -= dt;
    if (world.weatherT <= 0) {
        const next = WEATHER[randi(0, WEATHER.length - 1)];
        if (next !== world.weather) {
            world.weather = next;
            const label = { clear: '☀️ Hava açıldı', cloudy: '☁️ Bulutlar toplanıyor',
                            rain: '🌧️ Yağmur başladı', storm: '⛈️ Fırtına geliyor!' }[next];
            sys(label, next === 'storm' ? 'bad' : 'info');
        }
        world.weatherT = rand(100, 220);
    }
    const raining = world.weather === 'rain' || world.weather === 'storm';

    /* --- Kaynak yenilenmesi --- */
    for (const n of world.nodes) {
        if (!n.alive) {
            n.rt -= dt;
            if (n.rt <= 0) {
                n.alive = true;
                n.hp = NODES[n.type].hp;
                sendNodeUpdate(n);
            }
        }
    }

    /* --- Yapılar --- */
    let buildsDirty = false;
    for (const b of world.builds) {
        if (b.type === 'fire' && b.fuel > 0) {
            b.fuel = Math.max(0, b.fuel - dt * (raining ? 1.8 : 1));
            if (b.fuel === 0) buildsDirty = true;
        }
        if (b.type === 'still') {
            b.tick += dt;
            if (b.tick > TUNING.stillPeriod && b.water < 5) { b.tick = 0; b.water++; buildsDirty = true; }
        }
    }

    /* --- Oyuncular --- */
    for (const p of players.values()) {
        if (!p.alive) continue;

        p.hitCd = Math.max(0, p.hitCd - dt);
        p.food  = clamp(p.food  - TUNING.foodDrain  * dt, 0, 100);
        p.water = clamp(p.water - TUNING.waterDrain * dt * (raining ? 0.7 : 1), 0, 100);

        const working = p.gatherId || p.fishing;
        p.sta = clamp(p.sta + (working ? -6 : TUNING.staRegen) * dt, 0, 100);

        let dmg = 0;
        if (p.food <= 0)  dmg += TUNING.starveDmg;
        if (p.water <= 0) dmg += TUNING.starveDmg * 1.2;

        const warm = world.builds.some(b =>
            b.type === 'fire' && b.fuel > 0 && d2(p, b) < TUNING.fireRadius * TUNING.fireRadius);
        const cold = dark > 0.6 && !warm;
        if (cold) dmg += TUNING.coldDmg * (raining ? 1 + TUNING.rainCold : 1);
        if (p.inWater && dark > 0.6) dmg += 0.4;

        if (dmg > 0) p.hp = clamp(p.hp - dmg * dt, 0, 100);
        else if (p.food > 40 && p.water > 40) p.hp = clamp(p.hp + TUNING.regen * dt, 0, 100);

        // Yağmurda susuzluk yavaş yavaş azalır (ağzını açık tut)
        if (raining && !p.inWater) p.water = clamp(p.water + 1.2 * dt, 0, 100);

        if (p.hp <= 0) {
            killPlayer(p, p.food <= 0 ? 'açlık' : p.water <= 0 ? 'susuzluk' : cold ? 'soğuk' : 'yaralar');
            continue;
        }

        /* Toplama ilerlemesi */
        if (p.gatherId) {
            const n = world.nodes.find(x => x.id === p.gatherId);
            if (!n || !n.alive || d2(p, n) > 42 || p.sta < 2) {
                p.gatherId = null; p.gatherProg = 0;
                send(p.ws, { t: 'prog', v: 0 });
            } else {
                const cfg = NODES[n.type];
                const tool = TOOLS[p.equipped];
                let rate = GATHER_BASE;
                if (cfg.tool === null) rate = 1.4;
                else if (tool && tool.kind === cfg.tool) rate = GATHER_RIGHT * tool.power;
                p.gatherProg += rate * dt;
                send(p.ws, { t: 'prog', v: Math.min(1, p.gatherProg) });

                if (p.gatherProg >= 1) {
                    p.gatherProg = 0;
                    n.hp--;
                    p.gathered++;
                    const got = {};
                    for (const [item, lo, hi] of cfg.yields) {
                        const amount = randi(lo, hi);
                        if (amount > 0) { give(p, item, amount); got[item] = (got[item] || 0) + amount; }
                    }
                    if (cfg.bonus && Math.random() < cfg.bonus[1]) {
                        give(p, cfg.bonus[0], 1);
                        got[cfg.bonus[0]] = (got[cfg.bonus[0]] || 0) + 1;
                    }
                    if (n.hp <= 0) {
                        n.alive = false;
                        n.rt = rand(cfg.respawn[0], cfg.respawn[1]);
                    }
                    sendNodeUpdate(n);
                    sendInv(p);
                    send(p.ws, { t: 'loot', got, x: n.x, y: n.y, z: n.z });
                }
            }
        }

        /* Balık tutma */
        if (p.fishing) {
            const h = heightAt(p.x, p.z, world.seed);
            if (h > 2.5) {
                p.fishing = false;
                send(p.ws, { t: 'sys', text: 'Balık tutmak için su kenarına git', kind: 'bad' });
                send(p.ws, { t: 'prog', v: 0 });
            } else {
                const rate = TOOLS[p.equipped]?.kind === 'spear' ? 0.34 : 0.16;
                p.fishProg += rate * dt;
                send(p.ws, { t: 'prog', v: Math.min(1, p.fishProg) });
                if (p.fishProg >= 1) {
                    p.fishProg = 0;
                    give(p, 'balik', 1);
                    sendInv(p);
                    send(p.ws, { t: 'sys', text: '🐟 Balık yakaladın', kind: 'good' });
                }
            }
        }
    }

    /* --- Hayvanlar --- */
    const alivePlayers = [...players.values()].filter(p => p.alive);
    const wantBoar = 8 + (dark > 0.5 ? 6 : 0);
    let nBoar = 0, nCrab = 0, nShark = 0;
    for (const a of world.animals) {
        if (a.kind === 'boar') nBoar++; else if (a.kind === 'crab') nCrab++; else nShark++;
    }
    if (nBoar < wantBoar && Math.random() < dt * 0.6) spawnAnimal('boar');
    if (nCrab < 8 && Math.random() < dt * 0.4) spawnAnimal('crab');
    if (nShark < 3 && Math.random() < dt * 0.25) spawnAnimal('shark');

    for (const a of world.animals) {
        a.cd = Math.max(0, a.cd - dt);

        // En yakın oyuncu
        let target = null, best = Infinity;
        for (const p of alivePlayers) {
            if (a.kind === 'shark' && !p.inWater) continue;
            const d = d2(p, a);
            if (d < best) { best = d; target = p; }
        }

        const range = a.kind === 'shark' ? 900 : 625;
        const aggressive = a.kind === 'shark'
            || (a.kind === 'boar' && (dark > 0.35 || a.state === 'hurt' || best < 100));

        if (target && aggressive && best < range) {
            const dx = target.x - a.x, dz = target.z - a.z;
            const d = Math.max(0.001, Math.hypot(dx, dz));
            const sp = a.kind === 'shark' ? 7.5 : (dark > 0.5 ? 6.2 : 5);
            a.vx = (dx / d) * sp; a.vz = (dz / d) * sp;
            a.ry = Math.atan2(dx, dz);
            a.state = 'chase';

            if (best < 4 && a.cd <= 0) {
                a.cd = 1.4;
                const dmgVal = a.kind === 'shark' ? TUNING.sharkDmg
                    : (dark > 0.5 ? TUNING.boarDmg[1] : TUNING.boarDmg[0]);
                target.hp = clamp(target.hp - dmgVal, 0, 100);
                send(target.ws, { t: 'hurt', amount: dmgVal, from: a.kind });
                broadcast({ t: 'fx', kind: 'hit', x: target.x, y: target.y + 1, z: target.z });
                if (target.hp <= 0) killPlayer(target, a.kind === 'shark' ? 'köpekbalığı saldırısı' : 'yaban domuzu');
            }
        } else if (target && a.kind === 'crab' && best < 64) {
            const dx = a.x - target.x, dz = a.z - target.z;
            const d = Math.max(0.001, Math.hypot(dx, dz));
            a.vx = (dx / d) * 4; a.vz = (dz / d) * 4;
            a.ry = Math.atan2(dx, dz);
        } else {
            a.wander -= dt;
            if (a.wander <= 0) {
                a.wander = rand(2, 6);
                const ang = Math.random() * Math.PI * 2;
                const sp = a.kind === 'shark' ? 3.5 : 2;
                a.vx = Math.cos(ang) * sp; a.vz = Math.sin(ang) * sp;
                a.ry = Math.atan2(a.vx, a.vz);
            }
            if (a.state !== 'hurt') a.state = 'idle';
        }

        // Hareket + arazi kısıtı
        const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
        const nh = heightAt(nx, nz, world.seed);
        const okHeight = a.kind === 'shark' ? nh < -1.5 : nh > 0.4;
        const inBounds = Math.abs(nx) < MAP_SIZE * 0.48 && Math.abs(nz) < MAP_SIZE * 0.48;
        if (okHeight && inBounds) {
            a.x = nx; a.z = nz;
            a.y = a.kind === 'shark' ? -0.6 : nh;
        } else {
            a.vx = -a.vx * 0.6; a.vz = -a.vz * 0.6;
            a.wander = 0.2;
        }
        a.vx *= 0.92; a.vz *= 0.92;
    }

    /* --- Sal geri sayımı --- */
    if (world.raft && world.raft.boardT !== null && !world.over) {
        world.raft.boardT -= dt;
        if (world.raft.boardT <= 0) {
            const raft = world.builds.find(b => b.id === world.raft.id);
            const aboard = alivePlayers.filter(p => raft && d2(p, raft) < 100);
            world.over = true;
            broadcast({
                t: 'win',
                names: aboard.map(p => p.name),
                left: alivePlayers.filter(p => !aboard.includes(p)).map(p => p.name),
                day: world.day,
            });
            sys(aboard.length
                ? `🛶 Sal açıldı! Kurtulanlar: ${aboard.map(p => p.name).join(', ')}`
                : '🛶 Sal boş gitti… kimse binememişti.', 'good');
            setTimeout(() => {
                world.over = false;
                world.raft = null;
                world.builds = world.builds.filter(b => b.type !== 'raft');
                sendBuilds();
            }, 15000);
        }
    }

    /* --- Ağa yayın --- */
    netAcc += dt;
    if (netAcc >= 1 / NET_HZ) {
        netAcc = 0;
        const pub = [...players.values()].map(p => ({
            id: p.id, name: p.name, color: p.color,
            x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim,
            hp: p.hp, alive: p.alive, sleeping: p.sleeping,
            tool: p.equipped, inWater: p.inWater,
        }));
        const anim = world.animals.map(a => ({
            id: a.id, kind: a.kind, x: a.x, y: a.y, z: a.z, ry: a.ry, state: a.state,
        }));
        for (const p of players.values()) {
            send(p.ws, {
                t: 'state', players: pub, animals: anim,
                time: world.time, day: world.day, weather: world.weather,
                raftT: world.raft ? world.raft.boardT : null,
                me: { hp: p.hp, food: p.food, water: p.water, sta: p.sta, alive: p.alive },
            });
        }
    }

    if (buildsDirty) sendBuilds();

    saveAcc += dt;
    if (saveAcc > 30) { saveAcc = 0; for (const p of players.values()) saveProfile(p); saveWorld(); }
}

setInterval(tick, 1000 / TICK_HZ);

/* --------------------------- Başlat --------------------------- */

function localIPs() {
    const out = [];
    const ifs = os.networkInterfaces();
    for (const name in ifs) {
        for (const i of ifs[name] || []) {
            if (i.family === 'IPv4' && !i.internal) out.push(i.address);
        }
    }
    return out;
}

server.listen(PORT, '0.0.0.0', () => {
    const ips = localIPs();
    console.log('\n  🏝️  ISSIZ ADA 3B — sunucu ayakta\n');
    console.log('  Bu bilgisayarda:  http://localhost:' + PORT);
    for (const ip of ips) console.log('  Arkadaşların:     http://' + ip + ':' + PORT);
    console.log('\n  (Aynı Wi-Fi ağındaki herkes yukarıdaki adresi tarayıcıya yazsın.)');
    console.log('  Dünya ' + SAVE_FILE + ' dosyasına otomatik kaydediliyor.\n');
});

process.on('SIGINT', () => {
    console.log('\nKaydediliyor…');
    for (const p of players.values()) saveProfile(p);
    saveWorld();
    process.exit(0);
});
