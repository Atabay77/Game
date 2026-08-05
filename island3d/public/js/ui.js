/* ==========================================================================
   Arayüz: HUD, çanta, üretim, sandık, sohbet, mini harita, ekranlar.
   ========================================================================== */

import { ITEMS, RECIPES, TOOLS } from '/shared/constants.js';
import { islandRadius } from '/shared/terrain.js';

const $ = id => document.getElementById(id);

export const ui = {
    cb: {},
    inv: {},
    tools: [],
    equipped: null,
    nearBench: false,
    chestOpen: false,

    init(cb) {
        this.cb = cb;

        document.querySelectorAll('[data-close]').forEach(x => {
            x.addEventListener('click', () => $(x.dataset.close).classList.add('hidden'));
        });

        $('joinBtn').addEventListener('click', () => {
            const name = $('nameInput').value.trim() || ('Kaşif' + Math.floor(Math.random() * 90 + 10));
            cb.join(name);
        });
        $('nameInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') $('joinBtn').click();
        });
        $('respawnBtn').addEventListener('click', () => cb.respawn());
        $('winBtn').addEventListener('click', () => $('winScreen').classList.add('hidden'));
        $('resumeBtn').addEventListener('click', () => cb.resume());

        $('setShadows').addEventListener('change', e => cb.setting('shadows', e.target.checked));
        $('setFog').addEventListener('change', e => cb.setting('fog', e.target.checked));
        $('setSound').addEventListener('change', e => cb.setting('sound', e.target.checked));
        $('setView').addEventListener('input', e => cb.setting('view', +e.target.value));
        $('setSens').addEventListener('input', e => cb.setting('sens', +e.target.value / 100));

        const ci = $('chatInput');
        ci.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const t = ci.value.trim();
                ci.value = '';
                ci.classList.remove('on');
                ci.blur();
                if (t) cb.chat(t);
                cb.chatClosed();
            } else if (e.key === 'Escape') {
                ci.value = '';
                ci.classList.remove('on');
                ci.blur();
                cb.chatClosed();
            }
        });
        // Telefonda Esc yok — başka yere dokununca sohbet kapansın
        ci.addEventListener('blur', () => {
            if (!ci.classList.contains('on')) return;
            ci.classList.remove('on');
            cb.chatClosed();
        });

        this.mm = $('minimap').getContext('2d');
    },

    /* ------------------------- Genel ------------------------- */

    showHud(on) { $('hud').classList.toggle('hidden', !on); },
    hideLogin() { $('loginScreen').classList.add('hidden'); },
    conn(text) { $('connState').textContent = text; },

    openChat() {
        const ci = $('chatInput');
        ci.classList.add('on');
        ci.focus();
    },
    chatIsOpen() { return $('chatInput').classList.contains('on'); },

    anyPanelOpen() {
        return ['craftPanel', 'bagPanel', 'chestPanel', 'pauseScreen']
            .some(id => !$(id).classList.contains('hidden'));
    },
    closePanels() {
        ['craftPanel', 'bagPanel', 'chestPanel'].forEach(id => $(id).classList.add('hidden'));
        this.chestOpen = false;
    },

    /* ------------------------- Değerler ------------------------- */

    vitals(me) {
        $('hpFill').style.width = me.hp + '%';
        $('foodFill').style.width = me.food + '%';
        $('waterFill').style.width = me.water + '%';
        $('staFill').style.width = me.sta + '%';

        const list = [];
        if (me.food < 20) list.push(['Açsın', '']);
        if (me.water < 20) list.push(['Susadın', '']);
        if (me.hp < 35) list.push(['Ağır yaralısın', '']);
        $('alerts').innerHTML = list.map(a => `<div class="alert ${a[1]}">${a[0]}</div>`).join('');
    },

    extraAlert(text, kind) {
        const box = $('alerts');
        const d = document.createElement('div');
        d.className = 'alert ' + (kind || 'info');
        d.textContent = text;
        box.appendChild(d);
    },

    clock(day, time, weather) {
        const h = time * 24;
        $('dayTxt').textContent = day + '. Gün';
        $('timeTxt').textContent = String(Math.floor(h)).padStart(2, '0') + ':' +
                                   String(Math.floor((h % 1) * 60)).padStart(2, '0');
        $('weatherTxt').textContent = {
            clear: '☀️ Açık', cloudy: '☁️ Bulutlu', rain: '🌧️ Yağmurlu', storm: '⛈️ Fırtına',
        }[weather] || '';
    },

    players(list, myId) {
        $('playerList').innerHTML = list.map(p =>
            `<div class="pl"><span>${p.name}${p.id === myId ? ' (sen)' : ''}${p.sleeping ? ' 😴' : ''}${p.alive ? '' : ' 💀'}</span>
             <span class="dot" style="background:${p.color}"></span></div>`).join('');
    },

    /* ------------------------- Bildirimler ------------------------- */

    center(text, ms = 1800) {
        const el = $('centerMsg');
        el.textContent = text;
        el.classList.add('on');
        clearTimeout(this._ct);
        this._ct = setTimeout(() => el.classList.remove('on'), ms);
    },

    loot(got) {
        const box = $('lootFeed');
        for (const k in got) {
            const it = ITEMS[k];
            if (!it) continue;
            const d = document.createElement('div');
            d.className = 'loot';
            d.textContent = `${it.icon} +${got[k]} ${it.name}`;
            box.appendChild(d);
            setTimeout(() => {
                d.style.transition = 'opacity .4s';
                d.style.opacity = '0';
                setTimeout(() => d.remove(), 400);
            }, 2200);
        }
        while (box.children.length > 6) box.firstChild.remove();
    },

    chatLine(from, text, color) {
        const log = $('chatLog');
        const d = document.createElement('div');
        d.innerHTML = from
            ? `<span class="who" style="color:${color || '#ffd98a'}">${from}:</span> ${escapeHtml(text)}`
            : `<span style="color:${color || '#9fd0ff'}">${escapeHtml(text)}</span>`;
        log.appendChild(d);
        while (log.children.length > 9) log.firstChild.remove();
        setTimeout(() => {
            d.style.transition = 'opacity .6s';
            d.style.opacity = '0.35';
        }, 12000);
    },

    prog(v) {
        $('progWrap').classList.toggle('on', v > 0.001);
        $('progBar').style.width = (v * 100) + '%';
    },

    lookAt(text) {
        const el = $('lookAt');
        if (!text) { el.classList.remove('on'); return; }
        el.classList.add('on');
        el.innerHTML = text;
    },

    /* ------------------------- Envanter ------------------------- */

    setInv(inv, tools, equipped) {
        this.inv = inv || {};
        this.tools = tools || [];
        this.equipped = equipped;
        this.renderHotbar();
        this.renderQuick();
        if (!$('bagPanel').classList.contains('hidden')) this.renderBag();
        if (!$('craftPanel').classList.contains('hidden')) this.renderRecipes();
        if (this.chestOpen) this.renderChest();
    },

    renderHotbar() {
        const toolIds = RECIPES.filter(r => r.kind === 'tool').map(r => r.id);
        $('hotbar').innerHTML = toolIds.map((id, i) => {
            const owned = this.tools.includes(id);
            const r = RECIPES.find(x => x.id === id);
            return `<div class="hslot ${owned ? '' : 'empty'} ${this.equipped === id ? 'on' : ''}"
                         data-tool="${id}" title="${r.name}">
                        <span class="k">${i + 1}</span>${owned ? r.icon : '·'}
                    </div>`;
        }).join('');
    },

    renderQuick() {
        const box = $('quickBag');
        const keys = Object.keys(this.inv).filter(k => this.inv[k] > 0);
        box.innerHTML = keys.map(k => {
            const it = ITEMS[k];
            if (!it) return '';
            const eat = it.food || it.water || it.hp;
            return `<div class="qs ${eat ? 'eat' : ''}" data-eat="${eat ? k : ''}" title="${it.name}">
                        <span>${it.icon}</span><span>${this.inv[k]}</span></div>`;
        }).join('');
        box.querySelectorAll('[data-eat]').forEach(el => {
            if (!el.dataset.eat) return;
            el.addEventListener('click', () => this.cb.eat(el.dataset.eat));
        });
    },

    renderBag() {
        const grid = $('bagGrid');
        const keys = Object.keys(this.inv).filter(k => this.inv[k] > 0);
        grid.innerHTML = keys.length ? keys.map(k => {
            const it = ITEMS[k];
            const eat = it.food || it.water || it.hp;
            return `<div class="bslot ${eat ? 'click' : ''}" data-eat="${eat ? k : ''}">
                        <span class="ic">${it.icon}</span><span>${this.inv[k]}</span>
                        <span class="nm">${it.name}</span></div>`;
        }).join('') : '<div class="empty">Çantan boş.</div>';
        grid.querySelectorAll('[data-eat]').forEach(el => {
            if (!el.dataset.eat) return;
            el.addEventListener('click', () => this.cb.eat(el.dataset.eat));
        });

        const tg = $('toolGrid');
        tg.innerHTML = this.tools.length ? this.tools.map(id => {
            const r = RECIPES.find(x => x.id === id);
            const t = TOOLS[id];
            return `<div class="bslot click ${this.equipped === id ? 'on' : ''}" data-tool="${id}">
                        <span class="ic">${r.icon}</span><span class="nm">${t ? t.name : r.name}</span></div>`;
        }).join('') : '<div class="empty">Henüz alet yok.</div>';
        tg.querySelectorAll('[data-tool]').forEach(el => {
            el.addEventListener('click', () => this.cb.equip(el.dataset.tool));
        });
    },

    renderRecipes() {
        $('benchNote').textContent = this.nearBench ? '· tezgâh yakında ✓' : '· bazı tarifler tezgâh ister';
        $('recipeGrid').innerHTML = RECIPES.map(r => {
            const owned = r.kind === 'tool' && this.tools.includes(r.id);
            const blocked = r.bench && !this.nearBench;
            const can = !owned && !blocked &&
                Object.keys(r.cost).every(k => (this.inv[k] || 0) >= r.cost[k]);
            const cost = Object.keys(r.cost).map(k =>
                `<span class="${(this.inv[k] || 0) >= r.cost[k] ? '' : 'miss'}">${ITEMS[k].icon}${this.inv[k] || 0}/${r.cost[k]}</span>`
            ).join('');
            return `<div class="rec ${owned ? 'done' : can ? '' : 'no'}" data-craft="${r.id}">
                        <div class="ic">${r.icon}</div>
                        <div>
                            <div class="nm">${r.name}${owned ? ' ✓' : ''}${r.bench ? ' 🛠️' : ''}</div>
                            <div class="ds">${r.desc}</div>
                            <div class="cost">${owned ? 'Zaten sende' : blocked ? 'Çalışma tezgâhı gerekir' : cost}</div>
                        </div>
                    </div>`;
        }).join('');
        $('recipeGrid').querySelectorAll('[data-craft]').forEach(el => {
            el.addEventListener('click', () => this.cb.craft(el.dataset.craft));
        });
    },

    renderChest() {
        const draw = (target, data, act) => {
            const keys = Object.keys(data).filter(k => data[k] > 0);
            $(target).innerHTML = keys.length ? keys.map(k =>
                `<div class="bslot click" data-item="${k}" data-act="${act}">
                    <span class="ic">${ITEMS[k].icon}</span><span>${data[k]}</span>
                    <span class="nm">${ITEMS[k].name}</span></div>`).join('')
                : '<div class="empty">Boş.</div>';
            $(target).querySelectorAll('[data-item]').forEach(el => {
                el.addEventListener('click', ev => {
                    this.cb.chest(el.dataset.act, el.dataset.item, ev.shiftKey ? 999 : 1);
                });
            });
        };
        draw('chestGrid', this.chest || {}, 'take');
        draw('chestMine', this.inv, 'put');
    },

    openChest(items) {
        this.chest = items;
        this.chestOpen = true;
        $('chestPanel').classList.remove('hidden');
        this.renderChest();
    },
    setChest(items) {
        this.chest = items;
        if (this.chestOpen) this.renderChest();
    },

    toggle(id) {
        const el = $(id);
        const willOpen = el.classList.contains('hidden');
        this.closePanels();
        if (willOpen) {
            el.classList.remove('hidden');
            if (id === 'bagPanel') this.renderBag();
            if (id === 'craftPanel') this.renderRecipes();
        }
        return willOpen;
    },

    /* ------------------------- Ekranlar ------------------------- */

    dead(reason) {
        $('deadReason').textContent = 'Sebep: ' + reason;
        $('deadScreen').classList.remove('hidden');
    },
    alive() { $('deadScreen').classList.add('hidden'); },

    win(names, left, day) {
        $('winText').innerHTML = names.length
            ? `<b>${names.join(', ')}</b> ${day}. günde adadan kurtuldu.` +
              (left.length ? `<br>Adada kalanlar: ${left.join(', ')}` : '')
            : 'Sal boş gitti… kimse zamanında binemedi.';
        $('winScreen').classList.remove('hidden');
    },

    pause(on) { $('pauseScreen').classList.toggle('hidden', !on); },

    flash(kind) {
        const el = $('dmgFlash');
        el.style.opacity = kind === 'big' ? '0.95' : '0.6';
        setTimeout(() => { el.style.opacity = '0'; }, 160);
    },
    underwater(on) { $('waterOverlay').style.opacity = on ? '1' : '0'; },

    /* ------------------------- Mini harita ------------------------- */

    minimap(seed, me, players, builds, myId) {
        const g = this.mm, S = 150, R = S / 2;
        g.clearRect(0, 0, S, S);
        g.save();
        g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#12455e'; g.fillRect(0, 0, S, S);

        const scale = R / 210;
        const cx = R - me.x * scale, cy = R - me.z * scale;

        g.beginPath();
        for (let i = 0; i <= 90; i++) {
            const a = (i / 90) * Math.PI * 2;
            const r = islandRadius(a, seed) * scale;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = '#4e8c3c'; g.fill();
        g.strokeStyle = '#e0cb92'; g.lineWidth = 3; g.stroke();

        const icon = { fire: '#ff9430', shelter: '#c8a25a', chest: '#d8c070',
                       bench: '#a8a29a', still: '#6fd3f0', raft: '#fff0b0' };
        for (const b of builds) {
            g.fillStyle = icon[b.type] || '#fff';
            g.beginPath();
            g.arc(cx + b.x * scale, cy + b.z * scale, b.type === 'raft' ? 4.5 : 3, 0, Math.PI * 2);
            g.fill();
        }
        for (const p of players) {
            if (p.id === myId) continue;
            g.fillStyle = p.color;
            g.beginPath();
            g.arc(cx + p.x * scale, cy + p.z * scale, 3.5, 0, Math.PI * 2);
            g.fill();
        }
        // Kendi konumun ve bakış yönün
        g.save();
        g.translate(R, R);
        g.rotate(-me.ry);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5);
        g.closePath(); g.fill();
        g.restore();
        g.restore();
    },
};

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
