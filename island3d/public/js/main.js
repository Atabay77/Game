/* ==========================================================================
   Issız Ada 3B — istemci ana dosyası
   ========================================================================== */

import * as THREE from 'three';
import { heightAt } from '/shared/terrain.js';
import { ITEMS, RECIPES, NODES, BUILD_INFO, TOOLS } from '/shared/constants.js';
import { World, buildMesh } from './world.js';
import { Controls } from './controls.js';
import { makeAvatar, animateAvatar, setAvatarTool, makeAnimal, animateAnimal, Fx } from './entities.js';
import { net } from './net.js';
import { ui } from './ui.js';
import { sfx, audio } from './sfx.js';

/* --------------------------- Sahne kurulumu --------------------------- */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900);
scene.add(camera);

let world = null;
let controls = null;
let fx = null;

const state = {
    myId: null,
    seed: 0,
    joined: false,
    players: new Map(),      // id -> { data, obj }
    animals: new Map(),
    me: { hp: 100, food: 100, water: 100, sta: 100, alive: true },
    time: 0.35, day: 1, weather: 'clear',
    raftT: null,
    ghost: null,             // { id, obj, ry }
    gathering: null,
    holdMode: null,
    hitTimer: 0,
    viewDist: 320,
    sleeping: false,
};

function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* --------------------------- Elde tutulan alet --------------------------- */

const viewModel = new THREE.Group();
viewModel.position.set(0.34, -0.30, -0.62);
viewModel.rotation.set(0.25, -0.45, 0.35);
viewModel.scale.setScalar(0.42);
camera.add(viewModel);

const vmHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.8, 0.07),
    new THREE.MeshLambertMaterial({ color: '#7d5c33' }));
const vmHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.2, 0.09),
    new THREE.MeshLambertMaterial({ color: '#b7b3a8' }));
vmHead.position.set(0.13, 0.38, 0);
const vmFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.085, 0.24, 6),
    new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.9 }));
vmFlame.position.set(0, 0.5, 0);
const vmLight = new THREE.PointLight(0xffa040, 0, 20, 1.8);
vmLight.position.set(0, 0.6, 0);
viewModel.add(vmHandle, vmHead, vmFlame, vmLight);
viewModel.visible = false;
let vmSwing = 0;

function updateViewModel(toolId) {
    if (!toolId) { viewModel.visible = false; vmLight.intensity = 0; return; }
    viewModel.visible = true;
    const torch = toolId === 'torch';
    vmFlame.visible = torch;
    vmHead.visible = !torch;
    vmLight.intensity = torch ? 2.6 : 0;
    if (toolId === 'axeMetal' || toolId === 'pickMetal') vmHead.material.color.set('#c9ccd4');
    else if (toolId === 'spear') vmHead.material.color.set('#d8d4c8');
    else vmHead.material.color.set('#b7b3a8');
}

/* --------------------------- Yardımcılar --------------------------- */

const V = new THREE.Vector3();

function nearestBuild(range = 6) {
    if (!world) return null;
    let best = null, bestD = range * range;
    for (const b of world.buildList()) {
        const dx = b.x - controls.pos.x, dz = b.z - controls.pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = b; }
    }
    return best;
}

function nearBench() {
    if (!world) return false;
    return world.buildList().some(b => b.type === 'bench' &&
        (b.x - controls.pos.x) ** 2 + (b.z - controls.pos.z) ** 2 < 64);
}

/** Nişangâhın önündeki en uygun hedefi bulur. */
function pick() {
    if (!world) return null;
    const f = controls.forward();
    const px = controls.pos.x, pz = controls.pos.z;
    let best = null, bestScore = Infinity;

    const consider = (kind, ref, x, z, range, minDot) => {
        const dx = x - px, dz = z - pz;
        const d = Math.hypot(dx, dz);
        if (d > range) return;
        const dot = d < 0.4 ? 1 : (dx / d) * f.x + (dz / d) * f.z;
        if (dot < minDot) return;
        const score = d * (2.2 - dot);
        if (score < bestScore) { bestScore = score; best = { kind, ref, dist: d }; }
    };

    for (const n of world.nodes) {
        if (!n.alive) continue;
        if (Math.abs(n.x - px) > 7 || Math.abs(n.z - pz) > 7) continue;
        consider('node', n, n.x, n.z, 6.5, 0.35);
    }
    for (const b of world.buildList()) {
        consider('build', b, b.x, b.z, 6.5, 0.2);
    }
    for (const [, a] of state.animals) {
        consider('animal', a.data, a.data.x, a.data.z, 4.5, 0.4);
    }
    return best;
}

function canFish() {
    if (heightAt(controls.pos.x, controls.pos.z, state.seed) > 2.5) return false;
    const f = controls.forward();
    // Bakış yönünde birkaç mesafede su ara — kumsal geniş olabiliyor
    for (let d = 2.5; d <= 11; d += 1.5) {
        const x = controls.pos.x + f.x * d, z = controls.pos.z + f.z * d;
        if (heightAt(x, z, state.seed) < -0.25) return true;
    }
    return false;
}

function rebuildBlockers() {
    if (!world || !controls) return;
    const out = [];
    for (const n of world.nodes) {
        if (!n.alive || n.type === 'bush') continue;
        out.push({ x: n.x, z: n.z, r: (NODES[n.type]?.r || 1) * n.s });
    }
    for (const b of world.buildList()) {
        if (b.type === 'raft') continue;
        out.push({ x: b.x, z: b.z, r: BUILD_INFO[b.type]?.r || 1 });
    }
    controls.blockers = out;
}

/* --------------------------- Ağ olayları --------------------------- */

net.on('init', m => {
    state.myId = m.id;
    state.seed = m.seed;
    state.time = m.time; state.day = m.day; state.weather = m.weather;

    world = new World(scene, m.seed);
    world.time = m.time;
    world.weather = m.weather;
    world.onThunder = () => sfx.thunder();
    world.setViewDistance(state.viewDist);
    fx = new Fx(scene);

    controls = new Controls(camera, canvas, m.seed);
    controls.pos.set(m.you.x, m.you.y + 1, m.you.z);
    controls.onStep = () => sfx.step();
    controls.onSplash = () => sfx.splash();
    controls.onLockChange = locked => {
        if (!locked && state.joined && !ui.anyPanelOpen() && state.me.alive && !ui.chatIsOpen()) ui.pause(true);
    };

    world.setNodes(m.nodes);
    world.setBuilds(m.builds);
    ui.setChest(m.chest || {});
    rebuildBlockers();

    state.joined = true;
    ui.hideLogin();
    ui.showHud(true);
    ui.center('🏝️ Adaya hoş geldin — sağ üstteki haritayı takip et');
    canvas.requestPointerLock();
});

net.on('state', m => {
    state.time = m.time; state.day = m.day; state.weather = m.weather;
    state.raftT = m.raftT;
    Object.assign(state.me, m.me);
    if (world) { world.time = m.time; world.weather = m.weather; }

    // Oyuncular
    const seen = new Set();
    for (const p of m.players) {
        seen.add(p.id);
        if (p.id === state.myId) continue;
        let e = state.players.get(p.id);
        if (!e) {
            const obj = makeAvatar(p.name, p.color);
            scene.add(obj);
            e = { obj, data: p, tx: p.x, ty: p.y, tz: p.z, tool: null };
            state.players.set(p.id, e);
        }
        e.data = p;
        e.tx = p.x; e.ty = p.y; e.tz = p.z;
        e.obj.visible = p.alive;
        if (e.tool !== p.tool) { e.tool = p.tool; setAvatarTool(e.obj, p.tool); }
    }
    for (const [id, e] of [...state.players]) {
        if (!seen.has(id)) { scene.remove(e.obj); state.players.delete(id); }
    }
    ui.players(m.players, state.myId);

    // Hayvanlar
    const aseen = new Set();
    for (const a of m.animals) {
        aseen.add(a.id);
        let e = state.animals.get(a.id);
        if (!e) {
            const obj = makeAnimal(a.kind);
            scene.add(obj);
            e = { obj, data: a, tx: a.x, ty: a.y, tz: a.z };
            state.animals.set(a.id, e);
        }
        e.data = a;
        e.tx = a.x; e.ty = a.y; e.tz = a.z;
    }
    for (const [id, e] of [...state.animals]) {
        if (!aseen.has(id)) { scene.remove(e.obj); state.animals.delete(id); }
    }
});

net.on('nodes', m => { if (world) { world.updateNodes(m.list); rebuildBlockers(); } });
net.on('builds', m => { if (world) { world.setBuilds(m.list); rebuildBlockers(); } });
net.on('inv', m => { ui.setInv(m.inv, m.tools, m.equipped); updateViewModel(m.equipped); });
net.on('chest', m => ui.setChest(m.items));
net.on('openChest', m => { ui.chestId = m.id; ui.openChest(m.items); document.exitPointerLock(); });
net.on('openCraft', () => { ui.nearBench = true; ui.toggle('craftPanel'); document.exitPointerLock(); });
net.on('prog', m => ui.prog(m.v));

net.on('sys', m => {
    ui.chatLine(null, m.text, m.kind === 'bad' ? '#ff9a8f' : m.kind === 'good' ? '#b6e8a8' : '#9fd0ff');
    if (m.kind === 'bad' || m.kind === 'good') ui.center(m.text, 1400);
});

net.on('chat', m => { ui.chatLine(m.from, m.text, m.color); sfx.chat(); });

net.on('loot', m => {
    ui.loot(m.got);
    sfx.pick();
    if (fx) fx.burst(m.x, m.y + 1.2, m.z, '#ffd98a', 8, 3);
});

net.on('swing', m => {
    vmSwing = 1;
    sfx.swing();
    if (m.hit) sfx.hit();
});

net.on('hurt', m => {
    ui.flash(m.amount > 14 ? 'big' : '');
    sfx.hurt();
    ui.center(m.from === 'shark' ? '🦈 Köpekbalığı!' : '🐗 Saldırı altındasın!', 1200);
});

net.on('fx', m => { if (fx) fx.burst(m.x, m.y, m.z, m.kind === 'death' ? '#c8433a' : '#ffdca8', 12, 4); });

net.on('dead', m => {
    state.me.alive = false;
    ui.dead(m.reason);
    ui.pause(false);
    document.exitPointerLock();
    sfx.die();
});

net.on('respawned', m => {
    state.me.alive = true;
    controls.pos.set(m.x, m.y + 1, m.z);
    controls.vel.set(0, 0, 0);
    ui.alive();
    canvas.requestPointerLock();
});

net.on('ghost', m => startGhost(m.id));

net.on('sleepState', m => {
    state.sleeping = m.on;
    ui.center(m.on ? '😴 Uyuyorsun — herkes uyursa sabah olur' : 'Uyandın', 1600);
});

net.on('win', m => {
    ui.win(m.names, m.left, m.day);
    sfx.win();
    document.exitPointerLock();
});

/* --------------------------- Yapı yerleştirme --------------------------- */

function startGhost(id) {
    cancelGhost();
    const obj = buildMesh(id);
    obj.traverse(o => {
        if (o.isMesh) {
            o.material = o.material.clone();
            o.material.transparent = true;
            o.material.opacity = 0.55;
            o.castShadow = false;
        }
        if (o.isLight) o.intensity = 0;
    });
    scene.add(obj);
    state.ghost = { id, obj, ry: controls ? controls.yaw : 0 };
    ui.center('Yerleştir: sol tık · Döndür: R · İptal: Esc', 3000);
}

function cancelGhost() {
    if (state.ghost) { scene.remove(state.ghost.obj); state.ghost = null; }
}

function updateGhost() {
    if (!state.ghost || !controls) return;
    const f = controls.forward();
    const dist = state.ghost.id === 'raft' ? 5.5 : 3.4;
    const x = controls.pos.x + f.x * dist;
    const z = controls.pos.z + f.z * dist;
    const y = heightAt(x, z, state.seed);
    state.ghost.obj.position.set(x, state.ghost.id === 'raft' ? Math.max(y, -0.1) : y, z);
    state.ghost.obj.rotation.y = state.ghost.ry;

    const ok = state.ghost.id === 'raft' ? (y < 1.6 && y > -2.5) : y > 0.5;
    state.ghost.obj.traverse(o => {
        if (o.isMesh) o.material.color.setHex(ok ? 0xffffff : 0xff5544);
    });
    state.ghost.ok = ok;
    state.ghost.pos = { x, z };
}

function placeGhost() {
    if (!state.ghost) return;
    if (!state.ghost.ok) { ui.center('Buraya kurulmaz', 1200); return; }
    net.send({ t: 'place', id: state.ghost.id, x: state.ghost.pos.x, z: state.ghost.pos.z, ry: state.ghost.ry });
    sfx.craft();
    cancelGhost();
}

/* --------------------------- Girdi --------------------------- */

function startHold() {
    if (!state.joined || !state.me.alive) return;
    if (state.ghost) { placeGhost(); return; }

    const t = pick();
    if (t && t.kind === 'node') {
        state.holdMode = 'gather';
        state.gathering = t.ref.id;
        net.send({ t: 'gather', id: t.ref.id });
        return;
    }
    if (t && t.kind === 'animal') {
        state.holdMode = 'hit';
        state.hitTimer = 0;
        return;
    }
    if (canFish()) {
        state.holdMode = 'fish';
        net.send({ t: 'fish' });
        return;
    }
    state.holdMode = 'hit';
    state.hitTimer = 0;
}

function stopHold() {
    if (state.holdMode === 'gather') net.send({ t: 'gatherStop' });
    if (state.holdMode === 'fish') net.send({ t: 'fishStop' });
    state.holdMode = null;
    state.gathering = null;
    ui.prog(0);
}

canvas.addEventListener('mousedown', e => {
    if (e.button === 0) startHold();
    if (e.button === 2 && state.ghost) { state.ghost.ry += Math.PI / 4; }
});
addEventListener('mouseup', e => { if (e.button === 0) stopHold(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
    if (ui.chatIsOpen()) return;
    if (!state.joined) return;

    switch (e.code) {
        case 'KeyE': {
            const t = pick();
            if (t && t.kind === 'build') {
                net.send({ t: 'use', id: t.ref.id });
                sfx.pick();
            }
            break;
        }
        case 'KeyC':
            ui.nearBench = nearBench();
            if (ui.toggle('craftPanel')) document.exitPointerLock();
            else canvas.requestPointerLock();
            break;
        case 'Tab':
            e.preventDefault();
            if (ui.toggle('bagPanel')) document.exitPointerLock();
            else canvas.requestPointerLock();
            break;
        case 'KeyT':
        case 'Enter':
            e.preventDefault();
            ui.openChat();            // önce aç ki kilit bırakılınca duraklatma ekranı çıkmasın
            document.exitPointerLock();
            break;
        case 'KeyF': {
            const tools = ui.tools;
            if (!tools.includes('torch')) { ui.center('Önce meşale yapmalısın', 1200); break; }
            net.send({ t: 'equip', tool: ui.equipped === 'torch' ? null : 'torch' });
            break;
        }
        case 'KeyR':
            if (state.ghost) state.ghost.ry += Math.PI / 4;
            break;
        case 'Escape':
            if (state.ghost) { cancelGhost(); break; }
            if (ui.anyPanelOpen()) { ui.closePanels(); ui.pause(false); canvas.requestPointerLock(); }
            else ui.pause(true);
            break;
        case 'Digit1': case 'Digit2': case 'Digit3':
        case 'Digit4': case 'Digit5': case 'Digit6': {
            const idx = +e.code.slice(5) - 1;
            const toolIds = RECIPES.filter(r => r.kind === 'tool').map(r => r.id);
            const id = toolIds[idx];
            if (id && ui.tools.includes(id)) net.send({ t: 'equip', tool: ui.equipped === id ? null : id });
            break;
        }
    }
});

document.addEventListener('click', e => {
    const el = e.target.closest('[data-tool]');
    if (el && el.classList.contains('hslot')) {
        const id = el.dataset.tool;
        if (ui.tools.includes(id)) net.send({ t: 'equip', tool: ui.equipped === id ? null : id });
    }
});

/* --------------------------- Arayüz geri çağrıları --------------------------- */

ui.init({
    join(name) {
        sfx.unlock();
        ui.conn('Bağlanılıyor…');
        net.connect(
            () => net.send({ t: 'join', name }),
            () => { ui.conn('Bağlantı koptu — sayfayı yenile'); ui.chatLine(null, '⚠️ Sunucu bağlantısı koptu', '#ff9a8f'); }
        );
    },
    respawn() { net.send({ t: 'respawn' }); },
    resume() { ui.pause(false); canvas.requestPointerLock(); },
    chat(text) { net.send({ t: 'chat', text }); },
    chatClosed() { if (state.me.alive && !ui.anyPanelOpen()) canvas.requestPointerLock(); },
    eat(item) { net.send({ t: 'eat', item }); sfx.eat(); },
    equip(tool) { net.send({ t: 'equip', tool: ui.equipped === tool ? null : tool }); },
    craft(id) {
        const r = RECIPES.find(x => x.id === id);
        net.send({ t: 'craft', id });
        if (r && r.kind !== 'build') sfx.craft();
        if (r && r.kind === 'build') { ui.closePanels(); canvas.requestPointerLock(); }
    },
    chest(act, item, n) { net.send({ t: 'chest', id: ui.chestId, act, item, n }); },
    setting(key, val) {
        if (key === 'shadows') renderer.shadowMap.enabled = val;
        if (key === 'fog' && world) world.setFogEnabled(val, state.viewDist);
        if (key === 'sound') audio.enabled = val;
        if (key === 'view') {
            state.viewDist = val;
            camera.far = val * 2.2;
            camera.updateProjectionMatrix();
            if (world) world.setViewDistance(val);
        }
        if (key === 'sens' && controls) controls.sensitivity = val;
    },
});

/* --------------------------- Ana döngü --------------------------- */

let last = performance.now();
let sendAcc = 0;

function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (!state.joined || !world || !controls) { renderer.render(scene, camera); return; }

    controls.enabled = state.me.alive && !ui.anyPanelOpen() && !ui.chatIsOpen();
    controls.stamina = state.me.sta;
    controls.update(dt);

    // Sürekli saldırı (basılı tutunca)
    if (state.holdMode === 'hit') {
        state.hitTimer -= dt;
        if (state.hitTimer <= 0) { state.hitTimer = 0.6; net.send({ t: 'hit' }); }
    }
    // Toplama sırasında uzaklaşırsan sunucu zaten keser
    if (state.holdMode === 'gather' && state.gathering) {
        const n = world.nodeById.get(state.gathering);
        if (!n || !n.alive) stopHold();
        else if (Math.random() < dt * 7) {
            if (n.type === 'rock' || n.type === 'wreck') sfx.mine(); else sfx.chop();
        }
    }

    updateGhost();

    // Uzak oyuncular
    for (const [, e] of state.players) {
        const o = e.obj;
        const k = Math.min(1, dt * 11);
        const moving = Math.abs(o.position.x - e.tx) + Math.abs(o.position.z - e.tz) > 0.05;
        o.position.x += (e.tx - o.position.x) * k;
        o.position.y += (e.ty - o.position.y) * k;
        o.position.z += (e.tz - o.position.z) * k;
        let d = e.data.ry - o.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        o.rotation.y += d * k;
        animateAvatar(o, dt, moving, t);
        if (e.data.sleeping) o.rotation.z = 1.4; else o.rotation.z = 0;
    }

    // Hayvanlar
    for (const [, e] of state.animals) {
        const o = e.obj;
        const k = Math.min(1, dt * 9);
        const moving = Math.abs(o.position.x - e.tx) + Math.abs(o.position.z - e.tz) > 0.04;
        o.position.x += (e.tx - o.position.x) * k;
        o.position.y += (e.ty - o.position.y) * k;
        o.position.z += (e.tz - o.position.z) * k;
        let d = e.data.ry - o.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        o.rotation.y += d * k;
        animateAnimal(o, dt, moving);
    }

    // Elde tutulan alet salınımı
    if (vmSwing > 0) {
        vmSwing -= dt * 3.4;
        const s = Math.sin(Math.max(0, vmSwing) * Math.PI);
        viewModel.rotation.x = 0.25 - s * 1.6;
        viewModel.position.z = -0.62 - s * 0.18;
    } else if (controls.moving) {
        viewModel.rotation.x = 0.25 + Math.sin(t * (controls.sprinting ? 11 : 7)) * 0.06;
        viewModel.position.y = -0.30 + Math.sin(t * (controls.sprinting ? 22 : 14)) * 0.02;
        viewModel.position.z = -0.62;
    } else {
        viewModel.rotation.x = 0.25;
        viewModel.position.set(0.34, -0.30, -0.62);
    }

    world.update(dt, t, controls.pos);
    if (fx) fx.update(dt);

    // Arayüz
    ui.vitals(state.me);
    ui.clock(state.day, state.time, state.weather);
    ui.underwater(controls.swimming);

    const hour = state.time * 24;
    const dark = hour < 6 || hour > 20;
    const warm = world.buildList().some(b => b.type === 'fire' && b.fuel > 0 &&
        (b.x - controls.pos.x) ** 2 + (b.z - controls.pos.z) ** 2 < 144);
    if (dark && !warm && state.me.alive) ui.extraAlert('Üşüyorsun — ateş yak', 'cold');
    if (state.raftT !== null && state.raftT !== undefined) {
        ui.extraAlert(`🛶 Sal kalkıyor: ${Math.ceil(state.raftT)} sn — salın yanına gel!`, 'good');
    }

    // Nişangâh ipucu
    const target = pick();
    let hint = '';
    if (state.ghost) hint = '<b>Sol tık</b> kur · <b>R</b> döndür · <b>Esc</b> iptal';
    else if (target && target.kind === 'node') {
        const label = { palm: 'Palmiye', tree: 'Ağaç', rock: 'Kaya', bush: 'Çalı', wreck: 'Gemi enkazı' }[target.ref.type];
        const cfg = NODES[target.ref.type];
        const tool = TOOLS[ui.equipped];
        const good = !cfg.tool || (tool && tool.kind === cfg.tool);
        hint = `<b>Sol tık</b> — ${label} topla${good ? '' : ' <span style="opacity:.7">(doğru alet daha hızlı)</span>'}`;
    }
    else if (target && target.kind === 'build') {
        const b = target.ref;
        const label = BUILD_INFO[b.type]?.label || b.type;
        const extra = b.type === 'fire' ? (b.fuel > 0 ? ' (yanıyor)' : ' (sönmüş)')
                    : b.type === 'still' ? ` (${b.water} su hazır)` : '';
        hint = `<b>E</b> — ${label}${extra}`;
    }
    else if (target && target.kind === 'animal') {
        const label = { boar: 'Yaban domuzu', crab: 'Yengeç', shark: 'Köpekbalığı' }[target.ref.kind];
        hint = `<b>Sol tık</b> — ${label}'na saldır`;
    }
    else if (canFish()) hint = '<b>Sol tık</b> — balık tut';
    ui.lookAt(hint);

    ui.minimap(state.seed, { x: controls.pos.x, z: controls.pos.z, ry: controls.yaw },
        [...state.players.values()].map(e => e.data), world.buildList(), state.myId);

    // Konum gönder
    sendAcc += dt;
    if (sendAcc > 0.08) {
        sendAcc = 0;
        net.send({
            t: 'move',
            x: controls.pos.x, y: controls.pos.y, z: controls.pos.z,
            ry: controls.yaw,
            anim: controls.moving ? (controls.sprinting ? 'run' : 'walk') : 'idle',
            inWater: controls.swimming,
        });
    }

    renderer.render(scene, camera);
}

requestAnimationFrame(loop);

/* İlk ekranda sunucuya hazır olduğunu göster */
ui.conn('Sunucu hazır — adını yazıp başla');

/* Tarayıcı konsolundan hata ayıklama için */
window.__dbg = {
    state, ui, net, scene, camera, renderer, pick, startHold, stopHold, canFish,
    get world() { return world; },
    get controls() { return controls; },
};
