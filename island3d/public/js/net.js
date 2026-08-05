/* Sunucuyla WebSocket bağlantısı. */

export const net = {
    ws: null,
    connected: false,
    handlers: {},
    queue: [],

    connect(onOpen, onClose) {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${location.host}`);
        this.ws = ws;

        ws.onopen = () => {
            this.connected = true;
            for (const m of this.queue) ws.send(JSON.stringify(m));
            this.queue.length = 0;
            onOpen && onOpen();
        };
        ws.onmessage = ev => {
            let m;
            try { m = JSON.parse(ev.data); } catch { return; }
            const h = this.handlers[m.t];
            if (h) h(m);
        };
        ws.onclose = () => { this.connected = false; onClose && onClose(); };
        ws.onerror = () => { /* onclose zaten tetiklenir */ };
    },

    on(type, fn) { this.handlers[type] = fn; },

    send(msg) {
        if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
        else this.queue.push(msg);
    },
};
