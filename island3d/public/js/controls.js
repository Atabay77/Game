/* ==========================================================================
   Birinci şahıs kontrol: fare kilidi, yürüme, zıplama, yüzme, çarpışma.
   ========================================================================== */

import * as THREE from 'three';
import { heightAt } from '/shared/terrain.js';
import { MAP_SIZE } from '/shared/constants.js';

const EYE = 1.72;
const GRAVITY = 24;
const JUMP = 8.2;

export class Controls {
    constructor(camera, canvas, seed) {
        this.cam = camera;
        this.canvas = canvas;
        this.seed = seed;

        this.pos = new THREE.Vector3(0, 5, 0);
        this.vel = new THREE.Vector3();
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = false;
        this.inWater = false;
        this.swimming = false;
        this.sensitivity = 1;
        this.locked = false;
        this.enabled = true;
        this.sprinting = false;
        this.moving = false;
        this.stamina = 100;
        this.stepAcc = 0;
        this.onStep = null;
        this.onSplash = null;
        this.blockers = [];      // {x,z,r} — ağaç, kaya, yapı

        this.keys = Object.create(null);
        this.bind();
    }

    bind() {
        const c = this.canvas;
        c.addEventListener('click', () => {
            if (this.enabled && !this.locked) c.requestPointerLock();
        });
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === c;
            if (this.onLockChange) this.onLockChange(this.locked);
        });
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;
            const s = 0.0022 * this.sensitivity;
            this.yaw -= e.movementX * s;
            this.pitch -= e.movementY * s;
            this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
        });
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });
        window.addEventListener('blur', () => { this.keys = Object.create(null); });
    }

    ground(x, z) { return heightAt(x, z, this.seed); }

    /** Ağaç/kaya/yapı çarpışması — basit daire itmesi. */
    resolve(x, z) {
        for (const b of this.blockers) {
            const dx = x - b.x, dz = z - b.z;
            const d = Math.hypot(dx, dz);
            const min = b.r + 0.45;
            if (d < min && d > 0.0001) {
                x = b.x + (dx / d) * min;
                z = b.z + (dz / d) * min;
            }
        }
        return [x, z];
    }

    update(dt) {
        const k = this.keys;
        let fwd = 0, side = 0;
        if (this.locked && this.enabled) {
            if (k['KeyW'] || k['ArrowUp']) fwd += 1;
            if (k['KeyS'] || k['ArrowDown']) fwd -= 1;
            if (k['KeyA'] || k['ArrowLeft']) side -= 1;
            if (k['KeyD'] || k['ArrowRight']) side += 1;
        }
        const len = Math.hypot(fwd, side);
        if (len > 0) { fwd /= len; side /= len; }
        this.moving = len > 0;

        const wantSprint = (k['ShiftLeft'] || k['ShiftRight']) && this.moving && this.stamina > 2;
        this.sprinting = wantSprint;

        const groundY = this.ground(this.pos.x, this.pos.z);
        this.inWater = groundY < -0.4 && this.pos.y < 1.2;
        const wasSwimming = this.swimming;
        this.swimming = this.inWater && this.pos.y < 0.9;
        if (this.swimming !== wasSwimming && this.onSplash) this.onSplash();

        let speed = this.swimming ? 3.4 : (wantSprint ? 8.6 : 5.2);
        if (this.stamina < 5 && !this.swimming) speed = 4.2;

        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const dx = (-sin * fwd + cos * side) * speed;
        const dz = (-cos * fwd - sin * side) * speed;

        this.vel.x = dx;
        this.vel.z = dz;

        // Dikey hareket
        if (this.swimming) {
            let up = -1.5;
            if (k['Space']) up = 3.4;
            if (k['ControlLeft'] || k['KeyC']) up = -3.4;
            this.vel.y = up;
            if (this.pos.y > 0.55 && this.vel.y > 0) this.vel.y = 0.4;
        } else {
            this.vel.y -= GRAVITY * dt;
            if (this.onGround && k['Space'] && this.enabled && this.locked) {
                this.vel.y = JUMP;
                this.onGround = false;
            }
        }

        // Konum
        let nx = this.pos.x + this.vel.x * dt;
        let nz = this.pos.z + this.vel.z * dt;
        [nx, nz] = this.resolve(nx, nz);
        const lim = MAP_SIZE * 0.48;
        this.pos.x = Math.max(-lim, Math.min(lim, nx));
        this.pos.z = Math.max(-lim, Math.min(lim, nz));
        this.pos.y += this.vel.y * dt;

        const gy = this.ground(this.pos.x, this.pos.z);
        const floor = Math.max(gy, this.swimming ? -99 : gy);
        if (this.pos.y <= floor) {
            this.pos.y = floor;
            this.vel.y = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        if (this.swimming && this.pos.y < gy) { this.pos.y = gy; }

        // Adım sesi
        if (this.moving && this.onGround && !this.swimming) {
            this.stepAcc += dt * (wantSprint ? 2.4 : 1.6);
            if (this.stepAcc > 1) { this.stepAcc = 0; this.onStep && this.onStep(); }
        }

        // Kamera
        this.cam.position.set(this.pos.x, this.pos.y + (this.swimming ? 0.55 : EYE), this.pos.z);
        this.cam.rotation.set(0, 0, 0);
        this.cam.rotateY(this.yaw);
        this.cam.rotateX(this.pitch);

        // Hafif baş sallanması
        if (this.moving && this.onGround) {
            const bob = Math.sin(performance.now() / (wantSprint ? 95 : 145)) * (wantSprint ? 0.075 : 0.045);
            this.cam.position.y += bob;
        }
    }

    forward() {
        return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
}
