/* ==========================================================================
   Diğer oyuncular, hayvanlar ve küçük efektler.
   ========================================================================== */

import * as THREE from 'three';

const lam = c => new THREE.MeshLambertMaterial({ color: c });

function box(w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
}

/* --------------------------- İsim etiketi --------------------------- */

function nameSprite(text, color) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    g.font = 'bold 34px Trebuchet MS, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.85)';
    g.strokeText(text, 128, 34);
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false,
    }));
    s.scale.set(3.4, 0.85, 1);
    return s;
}

/* --------------------------- Oyuncu modeli --------------------------- */

export function makeAvatar(name, color) {
    const g = new THREE.Group();
    const skin = '#e8b98c';

    const torso = box(0.75, 0.95, 0.42, color, 0, 1.15, 0);
    const head = box(0.5, 0.5, 0.5, skin, 0, 1.9, 0);
    const hair = box(0.54, 0.16, 0.54, '#33240f', 0, 2.12, 0);
    const armL = box(0.2, 0.85, 0.22, skin, -0.5, 1.15, 0);
    const armR = box(0.2, 0.85, 0.22, skin, 0.5, 1.15, 0);
    const legL = box(0.26, 0.8, 0.28, '#3a4a63', -0.19, 0.4, 0);
    const legR = box(0.26, 0.8, 0.28, '#3a4a63', 0.19, 0.4, 0);
    const pack = box(0.5, 0.55, 0.2, '#6b5433', 0, 1.2, -0.3);

    // Elde taşınan alet
    const tool = new THREE.Group();
    tool.position.set(0.55, 1.25, 0.2);
    tool.visible = false;
    const handle = box(0.09, 0.9, 0.09, '#7d5c33', 0, 0, 0);
    const headMesh = box(0.34, 0.22, 0.1, '#b7b3a8', 0.12, 0.42, 0);
    tool.add(handle, headMesh);
    tool.userData.head = headMesh;

    // Meşale alevi
    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.42, 6),
        new THREE.MeshBasicMaterial({ color: 0xff9a30 }));
    flame.position.set(0, 0.62, 0);
    flame.visible = false;
    tool.add(flame);
    const torchLight = new THREE.PointLight(0xffa040, 0, 18, 1.8);
    torchLight.position.set(0, 0.7, 0);
    tool.add(torchLight);

    g.add(torso, head, hair, armL, armR, legL, legR, pack, tool);

    const tag = nameSprite(name, color);
    tag.position.set(0, 2.7, 0);
    g.add(tag);

    g.userData = { armL, armR, legL, legR, head, tool, flame, torchLight, tag, phase: Math.random() * 6, swing: 0 };
    return g;
}

export function animateAvatar(g, dt, moving, t) {
    const u = g.userData;
    u.phase += dt * (moving ? 9 : 2);
    const s = moving ? Math.sin(u.phase) : Math.sin(u.phase) * 0.12;
    u.legL.rotation.x = s * 0.85;
    u.legR.rotation.x = -s * 0.85;
    u.armL.rotation.x = -s * 0.7;
    if (u.swing > 0) {
        u.swing -= dt * 3.2;
        u.armR.rotation.x = -Math.sin(Math.max(0, u.swing) * Math.PI) * 2.1;
        u.tool.rotation.x = u.armR.rotation.x;
    } else {
        u.armR.rotation.x = s * 0.7;
        u.tool.rotation.x = s * 0.7 - 0.3;
    }
    u.head.rotation.y = Math.sin(t * 0.7 + u.phase * 0.1) * 0.12;
}

export function setAvatarTool(g, toolId) {
    const u = g.userData;
    if (!toolId) { u.tool.visible = false; u.torchLight.intensity = 0; return; }
    u.tool.visible = true;
    const isTorch = toolId === 'torch';
    u.flame.visible = isTorch;
    u.torchLight.intensity = isTorch ? 2.4 : 0;
    const head = u.tool.userData.head;
    head.visible = !isTorch;
    if (toolId.startsWith('axe')) head.material.color.set(toolId === 'axeMetal' ? '#c9ccd4' : '#b7b3a8');
    if (toolId.startsWith('pick')) head.material.color.set(toolId === 'pickMetal' ? '#c9ccd4' : '#9a978f');
    if (toolId === 'spear') head.material.color.set('#d8d4c8');
}

/* --------------------------- Hayvan modelleri --------------------------- */

export function makeAnimal(kind) {
    const g = new THREE.Group();
    if (kind === 'boar') {
        const body = box(0.85, 0.85, 1.6, '#4b3524', 0, 0.85, 0);
        const head = box(0.6, 0.6, 0.6, '#3b2a1c', 0, 0.85, 1.0);
        const snout = box(0.3, 0.28, 0.3, '#5a4230', 0, 0.75, 1.35);
        const tuskL = box(0.08, 0.08, 0.3, '#e8e0cc', -0.18, 0.7, 1.45);
        const tuskR = box(0.08, 0.08, 0.3, '#e8e0cc', 0.18, 0.7, 1.45);
        const legs = [];
        for (const [x, z] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
            const l = box(0.2, 0.55, 0.2, '#2e2014', x, 0.28, z);
            legs.push(l); g.add(l);
        }
        g.add(body, head, snout, tuskL, tuskR);
        g.userData = { legs, phase: Math.random() * 6, kind };
    } else if (kind === 'crab') {
        const body = box(0.6, 0.28, 0.5, '#d1483a', 0, 0.22, 0);
        const clawL = box(0.26, 0.18, 0.26, '#e35c4a', -0.42, 0.2, 0.24);
        const clawR = box(0.26, 0.18, 0.26, '#e35c4a', 0.42, 0.2, 0.24);
        const eyeL = box(0.07, 0.16, 0.07, '#2a1008', -0.12, 0.42, 0.16);
        const eyeR = box(0.07, 0.16, 0.07, '#2a1008', 0.12, 0.42, 0.16);
        const legs = [];
        for (let i = 0; i < 3; i++) {
            for (const s of [-1, 1]) {
                const l = box(0.06, 0.06, 0.34, '#b8382c', s * 0.34, 0.13, -0.18 + i * 0.18);
                l.rotation.z = s * 0.5;
                legs.push(l); g.add(l);
            }
        }
        g.add(body, clawL, clawR, eyeL, eyeR);
        g.userData = { legs, phase: Math.random() * 6, kind };
    } else {
        // Köpekbalığı — sadece sırt yüzgeci ve gövdesinin üstü görünür
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.6, 6), lam('#4a6472'));
        body.rotation.x = Math.PI / 2;
        body.position.y = 0.1;
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 4), lam('#3d5460'));
        fin.position.set(0, 0.75, -0.2);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), lam('#3d5460'));
        tail.rotation.z = Math.PI / 2;
        tail.position.set(0, 0.2, -1.9);
        g.add(body, fin, tail);
        g.userData = { legs: [], phase: Math.random() * 6, kind, fin };
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}

export function animateAnimal(g, dt, moving) {
    const u = g.userData;
    u.phase += dt * (moving ? 11 : 2);
    if (u.kind === 'shark') {
        g.rotation.z = Math.sin(u.phase * 0.5) * 0.12;
        return;
    }
    u.legs.forEach((l, i) => {
        l.rotation.x = Math.sin(u.phase + i * 1.7) * (moving ? 0.7 : 0.08);
    });
}

/* --------------------------- Efektler --------------------------- */

export class Fx {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.active = [];
        const geo = new THREE.IcosahedronGeometry(0.12, 0);
        for (let i = 0; i < 120; i++) {
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
            m.visible = false;
            scene.add(m);
            this.pool.push(m);
        }
    }
    burst(x, y, z, color, n = 10, power = 4) {
        for (let i = 0; i < n; i++) {
            const m = this.pool.pop();
            if (!m) return;
            m.visible = true;
            m.position.set(x, y, z);
            m.material.color.set(color);
            m.scale.setScalar(0.6 + Math.random() * 0.9);
            this.active.push({
                m, life: 0.6 + Math.random() * 0.5,
                vx: (Math.random() - 0.5) * power,
                vy: 1.5 + Math.random() * power,
                vz: (Math.random() - 0.5) * power,
            });
        }
    }
    update(dt) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];
            p.life -= dt;
            if (p.life <= 0) {
                p.m.visible = false;
                this.pool.push(p.m);
                this.active.splice(i, 1);
                continue;
            }
            p.vy -= 12 * dt;
            p.m.position.x += p.vx * dt;
            p.m.position.y += p.vy * dt;
            p.m.position.z += p.vz * dt;
            p.m.rotation.x += dt * 6;
            p.m.rotation.y += dt * 4;
        }
    }
}
