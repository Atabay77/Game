/* ==========================================================================
   Dünya görselleştirmesi: arazi, deniz, gökyüzü, hava, kaynaklar, yapılar.
   ========================================================================== */

import * as THREE from 'three';
import { heightAt } from '/shared/terrain.js';
import { MAP_SIZE } from '/shared/constants.js';

/* --------------------- Geometri yardımcıları --------------------- */

function tinted(geo, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
}

/** Birden çok parçayı tek geometriye birleştirir (vertex renkleriyle). */
function mergeGeos(list) {
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const g of list) {
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
}

const partMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });

/* --------------------- Kaynak modelleri --------------------- */

function palmGeo() {
    const parts = [];
    // İnce, hafif eğik gövde
    const SEG = 7, segH = 1.15;
    let bx = 0;
    for (let i = 0; i < SEG; i++) {
        const t = i / SEG;
        const g = new THREE.CylinderGeometry(0.20 - t * 0.07, 0.25 - t * 0.07, segH * 1.02, 7);
        bx = Math.sin(t * 1.35) * 0.9;
        g.translate(bx, segH * 0.5 + i * segH, 0);
        parts.push(tinted(g, i % 2 ? '#8a6b42' : '#7d6039'));
    }
    const topX = Math.sin(1.35) * 0.9, topY = SEG * segH;

    // Sarkan geniş yapraklar
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        const droop = i % 2 ? -0.42 : -0.62;
        const len = i % 2 ? 4.6 : 3.9;
        const g = new THREE.ConeGeometry(0.75, len, 4, 1, false);
        g.rotateX(Math.PI / 2);        // ucu +Z yönüne bak
        g.scale(1, 0.1, 1);            // yassı yaprak
        g.translate(0, 0, len * 0.42);
        g.rotateX(droop);              // aşağı sark
        g.rotateY(a);
        g.translate(topX, topY - 0.1, 0);
        parts.push(tinted(g, i % 2 ? '#3f8a36' : '#4f9c40'));
    }
    // Taç ve hindistan cevizleri
    const crown = new THREE.IcosahedronGeometry(0.42, 0);
    crown.translate(topX, topY - 0.05, 0);
    parts.push(tinted(crown, '#5f7a34'));
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const g = new THREE.IcosahedronGeometry(0.27, 0);
        g.translate(topX + Math.cos(a) * 0.45, topY - 0.55, Math.sin(a) * 0.45);
        parts.push(tinted(g, '#6b4a24'));
    }
    return mergeGeos(parts);
}

function treeGeo() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6);
    trunk.translate(0, 1.7, 0);
    parts.push(tinted(trunk, '#6b4f2f'));
    const canopy = [[0, 4.4, 2.3], [0, 6.0, 1.7], [0, 7.2, 1.1]];
    canopy.forEach((c, i) => {
        const g = new THREE.IcosahedronGeometry(c[2], 0);
        g.scale(1, 0.85, 1);
        g.translate(c[0], c[1], 0);
        parts.push(tinted(g, i === 0 ? '#2f6b2c' : i === 1 ? '#367a31' : '#3f8a37'));
    });
    return mergeGeos(parts);
}

function rockGeo() {
    const parts = [];
    const a = new THREE.DodecahedronGeometry(1.25, 0);
    a.scale(1.15, 0.8, 1);
    a.translate(0, 0.7, 0);
    parts.push(tinted(a, '#8d8a83'));
    const b = new THREE.DodecahedronGeometry(0.7, 0);
    b.translate(0.9, 0.4, 0.5);
    parts.push(tinted(b, '#7c7a74'));
    const c = new THREE.DodecahedronGeometry(0.5, 0);
    c.translate(-0.85, 0.35, -0.4);
    parts.push(tinted(c, '#9a978f'));
    return mergeGeos(parts);
}

function bushGeo() {
    const parts = [];
    const spots = [[0, 0.62, 0, 0.72], [0.55, 0.5, 0.2, 0.5], [-0.45, 0.52, -0.3, 0.55]];
    spots.forEach((s, i) => {
        const g = new THREE.IcosahedronGeometry(s[3], 0);
        g.translate(s[0], s[1], s[2]);
        parts.push(tinted(g, i === 0 ? '#3d7a33' : '#468a3a'));
    });
    for (let i = 0; i < 5; i++) {
        const g = new THREE.IcosahedronGeometry(0.11, 0);
        const a = (i / 5) * Math.PI * 2;
        g.translate(Math.cos(a) * 0.6, 0.75, Math.sin(a) * 0.5);
        parts.push(tinted(g, '#7a3fa8'));
    }
    return mergeGeos(parts);
}

function wreckGeo() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const g = new THREE.BoxGeometry(0.35, 2.4, 3.4);
        g.rotateX(-0.35 + i * 0.06);
        g.rotateZ(0.45);
        g.translate(i * 0.55 - 1.1, 0.9 + i * 0.16, 0);
        parts.push(tinted(g, i % 2 ? '#5b4224' : '#6a4d2b'));
    }
    const mast = new THREE.CylinderGeometry(0.14, 0.18, 4.2, 5);
    mast.rotateZ(0.7);
    mast.translate(-1.4, 2.1, 0.6);
    parts.push(tinted(mast, '#7d5c33'));
    const sail = new THREE.BoxGeometry(0.08, 1.8, 2.2);
    sail.rotateZ(0.7);
    sail.translate(-2.1, 2.6, 0.6);
    parts.push(tinted(sail, '#cfc3a4'));
    return mergeGeos(parts);
}

function stumpGeo() {
    const g = new THREE.CylinderGeometry(0.45, 0.55, 0.7, 6);
    g.translate(0, 0.35, 0);
    return mergeGeos([tinted(g, '#5e4527')]);
}

const NODE_GEO = {
    palm: palmGeo, tree: treeGeo, rock: rockGeo, bush: bushGeo, wreck: wreckGeo,
};

/* --------------------- Yapı modelleri --------------------- */

export function buildMesh(type) {
    const g = new THREE.Group();
    const add = (geo, color, x = 0, y = 0, z = 0, ry = 0) => {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
        m.position.set(x, y, z); m.rotation.y = ry;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        return m;
    };

    if (type === 'fire') {
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            add(new THREE.DodecahedronGeometry(0.3, 0), '#8d8a83',
                Math.cos(a) * 1.1, 0.15, Math.sin(a) * 1.1);
        }
        for (let i = 0; i < 4; i++) {
            const log = add(new THREE.CylinderGeometry(0.12, 0.14, 1.5, 5), '#5e4527', 0, 0.3, 0);
            log.rotation.set(Math.PI / 2.6, (i / 4) * Math.PI * 2, 0);
        }
        const flame = add(new THREE.ConeGeometry(0.42, 1.25, 6), '#ff8a2a', 0, 0.95, 0);
        flame.material = new THREE.MeshBasicMaterial({ color: '#ff9430', transparent: true, opacity: 0.92 });
        flame.castShadow = false;
        g.userData.flame = flame;
        const light = new THREE.PointLight(0xff9a40, 3.2, 26, 1.6);
        light.position.set(0, 1.4, 0);
        g.add(light);
        g.userData.light = light;
    }
    else if (type === 'bench') {
        add(new THREE.BoxGeometry(2.4, 0.18, 1.3), '#7d5c33', 0, 1.05, 0);
        for (const [x, z] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) {
            add(new THREE.BoxGeometry(0.18, 1.05, 0.18), '#6b4f2f', x, 0.52, z);
        }
        add(new THREE.BoxGeometry(0.5, 0.2, 0.5), '#9a978f', -0.7, 1.24, 0);
        add(new THREE.BoxGeometry(0.28, 0.5, 0.12), '#b7b3a8', 0.6, 1.35, 0.2);
    }
    else if (type === 'still') {
        add(new THREE.CylinderGeometry(0.85, 1.0, 0.5, 8), '#8d8a83', 0, 0.25, 0);
        const water = add(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 8), '#3f9fd0', 0, 0.5, 0);
        water.material.transparent = true; water.material.opacity = 0.85;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const s = add(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 4), '#7d5c33',
                Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7);
            s.rotation.z = Math.cos(a) * 0.42; s.rotation.x = -Math.sin(a) * 0.42;
        }
        const cone = add(new THREE.ConeGeometry(0.95, 0.6, 8), '#cfe6f0', 0, 1.55, 0);
        cone.material.transparent = true; cone.material.opacity = 0.6;
    }
    else if (type === 'shelter') {
        for (let i = 0; i < 2; i++) {
            const s = i ? 1 : -1;
            const roof = add(new THREE.BoxGeometry(3.4, 0.16, 2.6), '#4a7c35', 0, 1.15, s * 0.85);
            roof.rotation.x = s * 0.72;
        }
        add(new THREE.CylinderGeometry(0.13, 0.13, 2.3, 5), '#6b4f2f', -1.5, 1.1, 0);
        add(new THREE.CylinderGeometry(0.13, 0.13, 2.3, 5), '#6b4f2f', 1.5, 1.1, 0);
        add(new THREE.BoxGeometry(3.2, 0.12, 0.12), '#6b4f2f', 0, 2.2, 0);
        add(new THREE.BoxGeometry(2.6, 0.22, 1.5), '#8a7a52', 0, 0.12, 0);
    }
    else if (type === 'chest') {
        add(new THREE.BoxGeometry(1.5, 0.85, 1.0), '#7d5c33', 0, 0.42, 0);
        const lid = add(new THREE.BoxGeometry(1.55, 0.3, 1.05), '#6b4f2f', 0, 0.95, 0);
        lid.rotation.x = -0.08;
        add(new THREE.BoxGeometry(0.22, 0.3, 0.12), '#c8b062', 0, 0.72, 0.53);
    }
    else if (type === 'raft') {
        for (let i = 0; i < 7; i++) {
            add(new THREE.BoxGeometry(0.6, 0.35, 5.2), '#7d5c33', -1.8 + i * 0.62, 0.18, 0);
        }
        add(new THREE.BoxGeometry(4.6, 0.14, 0.3), '#5e4527', 0, 0.4, 1.7);
        add(new THREE.BoxGeometry(4.6, 0.14, 0.3), '#5e4527', 0, 0.4, -1.7);
        add(new THREE.CylinderGeometry(0.14, 0.16, 5, 6), '#6b4f2f', 0, 2.6, 0);
        const sail = add(new THREE.BoxGeometry(0.1, 3.2, 2.6), '#e4dcc0', 0.1, 3.1, 0);
        sail.material.side = THREE.DoubleSide;
        add(new THREE.BoxGeometry(0.9, 0.7, 0.9), '#8a7a52', -1.5, 0.6, -1.2);
    }
    return g;
}

/* --------------------- Dünya --------------------- */

export class World {
    constructor(scene, seed) {
        this.scene = scene;
        this.seed = seed;
        this.nodes = [];
        this.nodeById = new Map();
        this.instances = {};
        this.stumps = {};
        this.builds = new Map();
        this.time = 0.35;
        this.weather = 'clear';
        this.lightningT = 0;
        this.onThunder = null;

        this.makeSky();
        this.makeLights();
        this.makeTerrain();
        this.makeWater();
        this.makeRain();
    }

    /* ---------- Gökyüzü ---------- */
    makeSky() {
        const geo = new THREE.SphereGeometry(MAP_SIZE * 1.4, 24, 16);
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false,
            uniforms: {
                top: { value: new THREE.Color('#2a6fb0') },
                bottom: { value: new THREE.Color('#bfe0f0') },
                offset: { value: 40 },
            },
            vertexShader: `varying vec3 vP; void main(){ vP = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float offset;
                varying vec3 vP;
                void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y;
                gl_FragColor = vec4(mix(bottom, top, clamp(h*1.35, 0.0, 1.0)), 1.0); }`,
        });
        this.sky = new THREE.Mesh(geo, mat);
        this.sky.frustumCulled = false;
        this.scene.add(this.sky);

        // Yıldızlar
        const n = 700, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const u = Math.random() * Math.PI * 2, v = Math.random() * 0.75;
            const r = MAP_SIZE * 1.25;
            pos[i * 3] = Math.cos(u) * Math.cos(v) * r;
            pos[i * 3 + 1] = Math.sin(v) * r + 30;
            pos[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r;
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
            color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0,
        }));
        this.stars.frustumCulled = false;
        this.scene.add(this.stars);

        // Güneş ve ay diski
        const mk = (color, size) => {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({
                color, transparent: true, opacity: 0.95, depthWrite: false, fog: false,
            }));
            s.scale.set(size, size, 1);
            this.scene.add(s);
            return s;
        };
        this.sunDisc = mk(0xfff0c0, 34);
        this.moonDisc = mk(0xdde8ff, 20);
    }

    makeLights() {
        this.hemi = new THREE.HemisphereLight(0xbfe0f0, 0x4a6b3a, 1.1);
        this.scene.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        const c = this.sun.shadow.camera;
        c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
        this.sun.shadow.bias = -0.0012;
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);
    }

    /* ---------- Arazi ---------- */
    makeTerrain() {
        const SEG = 190;
        const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEG, SEG);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        const cSand = new THREE.Color('#e0cb92');
        const cWetSand = new THREE.Color('#c0a878');
        const cGrass = new THREE.Color('#4e8c3c');
        const cGrass2 = new THREE.Color('#3f7a33');
        const cRock = new THREE.Color('#8a877f');
        const cDeep = new THREE.Color('#2b5a52');
        const tmp = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const h = heightAt(x, z, this.seed);
            pos.setY(i, h);

            if (h < -0.6) tmp.copy(cDeep).lerp(cWetSand, Math.max(0, 1 + h / 6));
            else if (h < 1.6) tmp.copy(cWetSand).lerp(cSand, (h + 0.6) / 2.2);
            else if (h < 4.5) tmp.copy(cSand).lerp(cGrass, (h - 1.6) / 2.9);
            else if (h < 17) tmp.copy(cGrass).lerp(cGrass2, (h - 4.5) / 12.5);
            else tmp.copy(cGrass2).lerp(cRock, Math.min(1, (h - 17) / 9));

            colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);
    }

    /* ---------- Deniz ---------- */
    makeWater() {
        const geo = new THREE.PlaneGeometry(MAP_SIZE * 1.8, MAP_SIZE * 1.8, 96, 96);
        geo.rotateX(-Math.PI / 2);
        this.waterGeo = geo;
        this.waterBase = Float32Array.from(geo.attributes.position.array);
        const mat = new THREE.MeshLambertMaterial({
            color: '#2b8fa8', transparent: true, opacity: 0.82,
        });
        this.water = new THREE.Mesh(geo, mat);
        this.water.position.y = 0;
        this.scene.add(this.water);
    }

    /* ---------- Yağmur ---------- */
    makeRain() {
        // Her damla kısa bir çizgi — nokta yerine çizgi çok daha inandırıcı duruyor
        const n = 1800;
        const pos = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) {
            const x = (Math.random() - 0.5) * 80;
            const y = Math.random() * 44;
            const z = (Math.random() - 0.5) * 80;
            pos[i * 6] = x;     pos[i * 6 + 1] = y;       pos[i * 6 + 2] = z;
            pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - 0.9; pos[i * 6 + 5] = z;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
            color: 0xbcdcea, transparent: true, opacity: 0.45,
        }));
        this.rain.visible = false;
        this.rain.frustumCulled = false;
        this.scene.add(this.rain);
    }

    /* ---------- Kaynaklar ---------- */
    setNodes(list) {
        this.nodes = list;
        this.nodeById.clear();
        const byType = {};
        for (const n of list) {
            this.nodeById.set(n.id, n);
            (byType[n.type] = byType[n.type] || []).push(n);
        }

        const stumpG = stumpGeo();
        for (const type in byType) {
            const arr = byType[type];
            const geo = NODE_GEO[type]();
            const mesh = new THREE.InstancedMesh(geo, partMat(), arr.length);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            this.scene.add(mesh);
            this.instances[type] = { mesh, list: arr };

            if (type === 'tree' || type === 'palm') {
                const sm = new THREE.InstancedMesh(stumpG, partMat(), arr.length);
                sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false;
                this.scene.add(sm);
                this.stumps[type] = sm;
            }
            arr.forEach((n, i) => { n.idx = i; this.refreshNode(n); });
        }
    }

    refreshNode(n) {
        const inst = this.instances[n.type];
        if (!inst) return;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, n.ry, 0));
        const s = n.alive ? n.s : 0.0001;
        m.compose(new THREE.Vector3(n.x, n.y, n.z), q, new THREE.Vector3(s, s, s));
        inst.mesh.setMatrixAt(n.idx, m);
        inst.mesh.instanceMatrix.needsUpdate = true;

        const stump = this.stumps[n.type];
        if (stump) {
            const ss = n.alive ? 0.0001 : n.s;
            m.compose(new THREE.Vector3(n.x, n.y, n.z), q, new THREE.Vector3(ss, ss, ss));
            stump.setMatrixAt(n.idx, m);
            stump.instanceMatrix.needsUpdate = true;
        }
    }

    updateNodes(updates) {
        for (const u of updates) {
            const n = this.nodeById.get(u.id);
            if (!n) continue;
            n.hp = u.hp;
            if (n.alive !== u.alive) { n.alive = u.alive; this.refreshNode(n); }
        }
    }

    /* ---------- Yapılar ---------- */
    setBuilds(list) {
        const seen = new Set();
        for (const b of list) {
            seen.add(b.id);
            let obj = this.builds.get(b.id);
            if (!obj) {
                obj = buildMesh(b.type);
                obj.position.set(b.x, b.y, b.z);
                obj.rotation.y = b.ry || 0;
                obj.userData.build = b;
                this.scene.add(obj);
                this.builds.set(b.id, obj);
            }
            obj.userData.build = b;
            if (b.type === 'fire') {
                const on = b.fuel > 0;
                if (obj.userData.flame) obj.userData.flame.visible = on;
                if (obj.userData.light) obj.userData.light.intensity = on ? 3.2 : 0;
            }
        }
        for (const [id, obj] of [...this.builds]) {
            if (!seen.has(id)) { this.scene.remove(obj); this.builds.delete(id); }
        }
    }

    buildList() {
        const out = [];
        for (const obj of this.builds.values()) out.push(obj.userData.build);
        return out;
    }

    /* ---------- Her kare ---------- */
    update(dt, t, playerPos) {
        const hour = this.time * 24;

        // Güneş açısı: 6:00 doğar, 18:00 batar
        const sunAng = ((hour - 6) / 12) * Math.PI;
        const sunDir = new THREE.Vector3(Math.cos(sunAng), Math.sin(sunAng), 0.35).normalize();
        const up = Math.max(0, sunDir.y);

        const rainy = this.weather === 'rain' || this.weather === 'storm';
        const cloudy = this.weather === 'cloudy' || rainy;

        // Gökyüzü renkleri
        const dayTop = new THREE.Color('#2a6fb0'), dayBot = new THREE.Color('#cfe8f2');
        const duskTop = new THREE.Color('#1b3a6b'), duskBot = new THREE.Color('#e8834f');
        const nightTop = new THREE.Color('#050b1e'), nightBot = new THREE.Color('#122040');

        let top, bot;
        if (up > 0.28) { top = dayTop.clone(); bot = dayBot.clone(); }
        else if (up > 0) {
            const k = up / 0.28;
            top = duskTop.clone().lerp(dayTop, k); bot = duskBot.clone().lerp(dayBot, k);
        } else {
            const k = Math.min(1, -sunDir.y / 0.25);
            top = duskTop.clone().lerp(nightTop, k); bot = duskBot.clone().lerp(nightBot, k);
        }
        if (cloudy) {
            const g = new THREE.Color('#6b7480');
            top.lerp(g, this.weather === 'storm' ? 0.6 : 0.35);
            bot.lerp(g, this.weather === 'storm' ? 0.55 : 0.3);
        }
        this.sky.material.uniforms.top.value.copy(top);
        this.sky.material.uniforms.bottom.value.copy(bot);
        if (this.scene.fog) this.scene.fog.color.copy(bot);

        // Işıklar
        const dayK = Math.max(0, Math.min(1, up * 2.4));
        this.sun.intensity = (0.25 + dayK * 1.5) * (cloudy ? 0.45 : 1);
        this.sun.color.setHSL(0.11, 0.55, 0.5 + Math.min(0.3, up));
        this.hemi.intensity = 0.28 + dayK * 0.85 * (cloudy ? 0.7 : 1);
        this.hemi.color.copy(bot);

        const px = playerPos.x, pz = playerPos.z;
        this.sun.position.set(px + sunDir.x * 130, playerPos.y + Math.max(18, sunDir.y * 150), pz + sunDir.z * 130);
        this.sun.target.position.set(px, playerPos.y, pz);
        this.sun.target.updateMatrixWorld();

        this.sky.position.set(px, 0, pz);
        this.stars.position.set(px, 0, pz);
        this.stars.material.opacity = Math.max(0, Math.min(0.95, -sunDir.y * 3)) * (cloudy ? 0.25 : 1);

        this.sunDisc.position.set(px + sunDir.x * 380, sunDir.y * 380 + 10, pz + sunDir.z * 380);
        this.sunDisc.material.opacity = up > -0.05 ? 0.95 : 0;
        this.moonDisc.position.set(px - sunDir.x * 380, -sunDir.y * 380 + 10, pz - sunDir.z * 380);
        this.moonDisc.material.opacity = up < 0.05 ? 0.9 : 0;

        // Deniz dalgaları
        const wp = this.waterGeo.attributes.position;
        const base = this.waterBase;
        const amp = this.weather === 'storm' ? 0.9 : rainy ? 0.5 : 0.3;
        for (let i = 0; i < wp.count; i++) {
            const x = base[i * 3], z = base[i * 3 + 2];
            wp.array[i * 3 + 1] = Math.sin(x * 0.05 + t * 1.1) * amp
                                + Math.sin(z * 0.07 - t * 0.9) * amp * 0.7;
        }
        wp.needsUpdate = true;
        this.water.position.set(px, 0, pz);
        this.waterGeo.computeVertexNormals();
        this.water.material.color.setHex(rainy ? 0x24707f : 0x2b8fa8);

        // Yağmur
        this.rain.visible = rainy;
        if (rainy) {
            const rp = this.rain.geometry.attributes.position;
            const a = rp.array;
            const speed = this.weather === 'storm' ? 62 : 38;
            const drop = speed * dt;
            for (let i = 0; i < a.length; i += 6) {
                a[i + 1] -= drop;
                a[i + 4] -= drop;
                if (a[i + 4] < -6) {
                    const x = (Math.random() - 0.5) * 80, z = (Math.random() - 0.5) * 80;
                    a[i] = x;     a[i + 1] = 44;
                    a[i + 3] = x; a[i + 4] = 44 - (this.weather === 'storm' ? 1.6 : 0.9);
                    a[i + 2] = z; a[i + 5] = z;
                }
            }
            rp.needsUpdate = true;
            this.rain.position.set(px, playerPos.y, pz);
        }

        // Şimşek
        if (this.weather === 'storm') {
            this.lightningT -= dt;
            if (this.lightningT <= 0) {
                this.lightningT = 4 + Math.random() * 12;
                this.flash = 0.22;
                if (this.onThunder) this.onThunder();
            }
        }
        if (this.flash > 0) {
            this.flash -= dt;
            this.hemi.intensity += 2.4 * Math.max(0, this.flash / 0.22);
        }

        // Ateş alevi titremesi
        for (const obj of this.builds.values()) {
            const f = obj.userData.flame;
            if (f && f.visible) {
                const k = 0.85 + Math.sin(t * 11 + obj.position.x) * 0.16;
                f.scale.set(k, 1 + Math.sin(t * 9 + obj.position.z) * 0.2, k);
                if (obj.userData.light) obj.userData.light.intensity = 3.0 + Math.sin(t * 13) * 0.5;
            }
        }
    }

    setViewDistance(d) {
        this.scene.fog = new THREE.Fog(0xbfe0f0, d * 0.35, d);
    }
    setFogEnabled(on, d) {
        this.scene.fog = on ? new THREE.Fog(0xbfe0f0, d * 0.35, d) : null;
    }
}
