// Phone access on your home network (off unless "lan": true in olympia.config.json).
// Olympia then listens on the network, but anything not coming from this PC must pair first: the phone opens
// http://<pc-ip>:3110 and types the 6-digit code shown on the PC. After that a cookie on the phone lets it in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

export function loadKey(file) {
  try { const k = fs.readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{32,}$/.test(k)) return k; } catch {}
  const k = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(file, k, { mode: 0o600 });
  return k;
}

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./];
// Host names a phone on the home network may use: a private IPv4 address or this PC's own name.
// Anything else is refused, so a web page can't point its own domain at the PC (DNS rebinding).
export function lanHostOk(host, hostname = os.hostname()) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (PRIVATE.some((r) => r.test(h)) && /^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  const me = String(hostname).toLowerCase();
  return h === me || h === `${me}.local` || h === `${me}.lan`;
}

export const isLoopback = (addr) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(addr || ''));

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cookieKey = (header) => /(?:^|;\s*)olympia_key=([a-f0-9]+)/.exec(String(header || ''))?.[1] || null;

// does this request carry the paired-device cookie?
export function lanAccess({ key, cookie }) {
  const c = cookieKey(cookie);
  return key && c && same(c, key) ? 'ok' : 'denied';
}

// The code a phone types once to pair: 6 digits, kept until every phone is unpaired.
export function loadCode(file) {
  try { const c = fs.readFileSync(file, 'utf8').trim(); if (/^\d{6}$/.test(c)) return c; } catch {}
  const c = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  fs.writeFileSync(file, c, { mode: 0o600 });
  return c;
}
export const codeMatches = (given, code) => Boolean(code) && same(String(given ?? '').replace(/\D/g, ''), code);
export const showCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

// Guessing limits: 5 wrong codes lock that device out for 10 minutes, and 20 wrong codes from anywhere
// within an hour stop all pairing for an hour. At that pace a million codes can't be worked through.
export class PairGuard {
  constructor({ perDevice = 5, deviceLock = 10 * 60e3, total = 20, window = 60 * 60e3, now = Date.now } = {}) {
    Object.assign(this, { perDevice, deviceLock, total, window, now });
    this.devices = new Map(); this.fails = [];
  }
  blocked(ip) {
    const t = this.now(), d = this.devices.get(ip);
    this.fails = this.fails.filter((f) => t - f < this.window);
    return this.fails.length >= this.total || Boolean(d && d.until > t);
  }
  fail(ip) {
    const t = this.now(), d = this.devices.get(ip) || { n: 0, until: 0 };
    this.fails.push(t);
    d.n += 1; if (d.n >= this.perDevice) { d.n = 0; d.until = t + this.deviceLock; }
    this.devices.set(ip, d);
  }
  ok(ip) { this.devices.delete(ip); }
}

// What a device sees before it has paired: one box for the code.
export const pairPage = (realm = 'Olympia') => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${String(realm).replace(/[<>&"]/g, '')} · pair</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10182e;color:#eef1f8;font:16px/1.4 system-ui,sans-serif}
main{width:min(320px,88vw);text-align:center}h1{color:#f0cf7e;font-size:22px;margin:0 0 6px}p{color:#c3cadc;margin:6px 0 18px}
input{width:100%;box-sizing:border-box;font:600 30px ui-monospace,monospace;letter-spacing:.3em;text-align:center;padding:12px;border-radius:12px;border:2px solid #3a4770;background:#0b1124;color:#fff}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:12px;background:#ecbe5c;color:#1b1a14;font:600 17px system-ui}
#msg{min-height:1.4em;color:#f08c7e;margin-top:12px}</style></head>
<body><main><h1>Pair this device</h1><p>Type the code Olympia shows on your PC (the Phone button, or the tray menu).</p>
<form id="f"><input id="c" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" autofocus><button>Pair</button></form><div id="msg"></div></main>
<script>document.getElementById('f').onsubmit=async(e)=>{e.preventDefault();const m=document.getElementById('msg');m.textContent='';
const r=await fetch('/api/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:document.getElementById('c').value})}).catch(()=>null);
if(r&&r.ok)location.reload();else m.textContent=r&&r.status===429?'Too many tries. Wait a few minutes, then try again.':'That code did not match.';};</script></body></html>`;

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && PRIVATE.some((r) => r.test(a.address))) out.push(a.address);
  return out;
}
