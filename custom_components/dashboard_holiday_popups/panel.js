/* Dashboard Holiday Popups settings panel  pja v1.0.8
   Plain web component (no external library). Same dark look as the Advanced Group Sensor panel. */
(() => {
  'use strict';
  const VERSION = '1.0.8'; // pja v1.0.8
  const DOMAIN = 'dashboard_holiday_popups';
  const ELEMENT = 'dashboard-holiday-popups-panel';
  if (customElements.get(ELEMENT)) return;

  const WEATHER = ['clear-night', 'cloudy', 'exceptional', 'fog', 'hail', 'lightning', 'lightning-rainy', 'partlycloudy',
    'pouring', 'rainy', 'snowy', 'snowy-rainy', 'sunny', 'windy', 'windy-variant'];
  const ANCHORS = ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'];
  const TABS = [
    { id: 'dated', label: 'Dated or Manual', icon: '📅' },
    { id: 'scenes', label: 'Scenes', icon: '🎬' },
    { id: 'sensors', label: 'Weather and Sensors', icon: '📡' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];
  const KIND_NAME = { floater: 'character', popup: 'popup', decoration: 'decoration' };
  const KIND_PLURAL = { floater: 'Characters', popup: 'Popups', decoration: 'Decorations' };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Your own uploaded pictures are served to signed-in users only, so <img> cannot load them by address:
  // they get data-asrc and are fetched with the panel's login (see _hydrateImages). Bundled art loads directly.
  const UPLOADS_PREFIX = `/${DOMAIN}_files/`;
  const imgSrc = (url) => (String(url).startsWith(UPLOADS_PREFIX) ? `data-asrc="${esc(url)}"` : `src="${esc(url)}"`);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const keys = p.split('.');
    const last = keys.pop();
    const target = keys.reduce((a, k) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; return a[k]; }, o);
    target[last] = v;
  }
  const uid = () => Math.random().toString(16).slice(2, 10);

  // <recurrence>
  // Repeat rules (start, length, daily/weekly/monthly/yearly, Nth weekday, end). The panel carries an
  // identical copy of this block; a test keeps the two the same. Weekdays: 0 = Sunday ... 6 = Saturday.
  const DAY_MS = 86400000;
  const ymd = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function parseIso(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysBetween = (a, b) =>
    Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m is 0-based

  function dayRuleMatches(r, d) {
    if (r.by === 'weekday') {
      if (d.getDay() !== r.weekday) return false;
      if (r.nth === -1) return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth());
      return Math.ceil(d.getDate() / 7) === r.nth;
    }
    return d.getDate() === Math.min(r.day, daysInMonth(d.getFullYear(), d.getMonth()));
  }

  function isOccurrenceStart(r, start, d) {
    if (d < start) return false;
    const every = r.interval || 1;
    switch (r.repeat) {
      case 'none': return daysBetween(start, d) === 0;
      case 'daily': return daysBetween(start, d) % every === 0;
      case 'weekly': {
        const weeks = Math.floor(daysBetween(addDays(start, -start.getDay()), d) / 7);
        return weeks % every === 0 && (r.weekdays && r.weekdays.length ? r.weekdays : [start.getDay()]).includes(d.getDay());
      }
      case 'monthly': {
        const months = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
        return months % every === 0 && dayRuleMatches(r, d);
      }
      case 'yearly':
        return (d.getFullYear() - start.getFullYear()) % every === 0 && d.getMonth() + 1 === r.month && dayRuleMatches(r, d);
      default: return false;
    }
  }

  function occurrenceNumber(r, start, s) {
    let n = 0, guard = 0;
    for (let d = start; d <= s && guard < 40000; d = addDays(d, 1), guard++) if (isOccurrenceStart(r, start, d)) n++;
    return n;
  }

  function occurrenceAllowed(r, start, s) {
    if (r.ends === 'on') { const until = parseIso(r.until); return !until || s <= until; }
    if (r.ends === 'after') return occurrenceNumber(r, start, s) <= (r.count || 1);
    return true;
  }

  const recurrenceCache = new WeakMap();
  /** Is the rule active on the day of `now`? Returns { active, start } (start = first day of this occurrence). */
  function recurrenceActive(r, now) {
    const key = ymd(now);
    const hit = recurrenceCache.get(r);
    if (hit && hit.key === key) return hit.result;
    let result = { active: false, start: null };
    const start = r && parseIso(r.start);
    if (start) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const length = Math.max(1, Math.min(366, r.length_days || 1));
      for (let k = 0; k < length; k++) {
        const s = addDays(today, -k);
        if (isOccurrenceStart(r, start, s) && occurrenceAllowed(r, start, s)) { result = { active: true, start: s }; break; }
      }
    }
    if (r) recurrenceCache.set(r, { key, result });
    return result;
  }

  /** The current or next occurrence at or after `from`: { start, end } or null (looks about three years ahead). */
  function recurrenceNext(r, from) {
    const first = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 0; i < 1100; i++) {
      const day = addDays(first, i);
      const res = recurrenceActive(r, day);
      if (res.active) return { start: res.start, end: addDays(res.start, Math.max(1, r.length_days || 1) - 1) };
    }
    return null;
  }
  // </recurrence>

  // ---- dates: wording, defaults and overlap ------------------------------------------------
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NTH = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' };
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtDay = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const nthOf = (d) => { const n = Math.ceil(d.getDate() / 7); return n > 4 ? -1 : n; };

  /** A new rule starts on `day`, repeating every year (the picker shows what it means). */
  function newRule(day = new Date()) {
    return {
      start: isoOf(day), length_days: 1, repeat: 'yearly', interval: 1, weekdays: [day.getDay()], by: 'day',
      day: day.getDate(), nth: nthOf(day), weekday: day.getDay(), month: day.getMonth() + 1,
      ends: 'never', until: '', count: 1,
    };
  }

  /** Changing the start date moves the "on day / on the Nth weekday" choices with it, as calendars do. */
  function syncRuleToStart(r) {
    const d = parseIso(r.start);
    if (!d) return;
    Object.assign(r, { day: d.getDate(), month: d.getMonth() + 1, weekday: d.getDay(), nth: nthOf(d) });
    if (!r.weekdays || r.weekdays.length <= 1) r.weekdays = [d.getDay()];
  }

  function describeRule(r) {
    if (!r) return '';
    const start = parseIso(r.start);
    const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.repeat];
    const every = unit ? (r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`) : '';
    const dayPart = r.by === 'weekday' ? `the ${NTH[r.nth]} ${WEEKDAYS[r.weekday]}` : `day ${r.day}`;
    let text;
    if (r.repeat === 'daily') text = every;
    else if (r.repeat === 'weekly') text = `${every} on ${(r.weekdays || []).map((w) => WEEKDAYS[w].slice(0, 3)).join(', ')}`;
    else if (r.repeat === 'monthly') text = `${every} on ${dayPart}${r.by !== 'weekday' && r.day > 28 ? ' (the last day of shorter months)' : ''}`;
    else if (r.repeat === 'yearly') text = `${every} on ${r.by === 'weekday' ? `${dayPart} of ${MONTHS[r.month - 1]}` : `${MONTHS[r.month - 1]} ${r.day}`}`;
    else text = start ? `Once, on ${fmtDay(start)}` : 'Once';
    if (r.length_days > 1) text += `, ${r.repeat === 'none' ? 'for' : 'lasting'} ${r.length_days} days`;
    if (r.ends === 'on' && r.until && parseIso(r.until)) text += `, until ${fmtDay(parseIso(r.until))}`;
    if (r.ends === 'after') text += `, ${r.count} time${r.count > 1 ? 's' : ''}`;
    return text;
  }

  function nextText(r) {
    const nx = r && recurrenceNext(r, new Date());
    if (!nx) return 'No upcoming dates';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const span = nx.end > nx.start ? `${fmtDay(nx.start)} – ${fmtDay(nx.end)}` : fmtDay(nx.start);
    return nx.start <= today ? `On now: ${span}` : `Next: ${span}`;
  }

  /** Do two rules share a day in the next two years or so? */
  function rulesOverlap(a, b) {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    for (let i = 0; i < 800; i++) {
      const day = addDays(first, i);
      if (recurrenceActive(a, day).active && recurrenceActive(b, day).active) return true;
    }
    return false;
  }

  /** Weather and entity items live on the Sensors screen; everything else is dated (or always on). */
  const isSensorItem = (item) => (item.triggers || []).some((t) => t.type === 'weather' || t.type === 'entity');

  // ---- defaults for a new item (suggested defaults by kind and name) -------------------
  function newItem(kind, edge = 'left') {
    const base = {
      kind, name: '', enabled: true, image: { file: '', builtin: false }, image_url: '',
      size_px: kind === 'decoration' ? 300 : 230, dashboards: [], z_index: null, triggers: [],
      message_template: '', label: { enabled: false, position: 'above', font_size: 20, color: '#111111', background: '#ffffff' },
    };
    if (kind === 'floater') Object.assign(base, {
      path: 'bottom_straight', speed: 80, direction: 'both', drag_off: { enabled: true, action: 'delay', away_seconds: 60 },
      motion: 'drift', wave_shape: 'sine', amplitude_px: 60, period_seconds: 4, peaks: 2, anchor: 'center',
    });
    if (kind === 'popup') Object.assign(base, {
      anchor: edge, drawn_for: edge, allowed_edges: ['bottom', 'top', 'left', 'right'], position_along_edge: 'random',
      frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
      banner: { enabled: false, text_template: '' }, drag_off: { enabled: false, action: 'delay', away_seconds: 60 },
    });
    if (kind === 'decoration') Object.assign(base, {
      placements: [{ anchor: 'top_right', offset_px: { x: 0, y: 0 }, flip: true, size_px: null }], opacity: 1,
    });
    return base;
  }

  function applyNameDefaults(d, edge = 'left') {
    const n = d.name.toLowerCase();
    if (d.kind === 'floater') {
      if (/lantern/.test(n)) Object.assign(d, { path: 'free_float', motion: 'sway_horizontal', anchor: 'top', amplitude_px: 40, speed: 20 });
      else if (/candle|dreidel|menorah|lotus|drum|crescent|firework/.test(n)) Object.assign(d, { path: 'free_float', motion: 'bob_vertical', anchor: 'center', amplitude_px: 20, period_seconds: 3 });
      else if (/sleigh|santa|cupid|umbrella|witch|ghost|bat|envelope|fly/.test(n)) Object.assign(d, { path: 'curve_arc', speed: 120, amplitude_px: 90 });
    }
    if (d.kind === 'popup') { d.anchor = edge; d.drawn_for = edge; }
  }

  // ---- animation preview math (mirrors the runtime) ------------------------------------
  const wave = (shape, ph) => (shape === 'zigzag' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph));
  function previewPos(d, t, bw, bh, iw, ih) {
    const scale = Math.min(1, bh / 700);
    const amp = (d.amplitude_px || 0) * Math.max(scale * 2.2, 0.15);
    const sp = (d.speed || 80) * 0.5;
    const span = bw + iw;
    if (d.path === 'bottom_straight' || d.path === 'top_straight' || d.path === 'curve_arc') {
      const lin = (t * sp) % (span * 2);
      const goingRight = lin < span;
      const x = (goingRight ? lin : span * 2 - lin) - iw;
      let y = d.path === 'top_straight' ? 2 : bh - ih - 2;
      if (d.path === 'curve_arc') {
        const prog = (x + iw) / span;
        y = (bh - ih) * 0.4 + Math.min(amp, (bh - ih) * 0.4) * wave(d.wave_shape, 2 * Math.PI * (d.peaks || 2) * prog);
      }
      return { x, y, flip: !goingRight };
    }
    const ph = (2 * Math.PI * t) / (d.period_seconds || 4);
    const cx = (bw - iw) / 2, cy = (bh - ih) / 2;
    if (d.motion === 'bob_vertical') return { x: cx, y: cy + amp * Math.sin(ph), flip: false };
    if (d.motion === 'sway_horizontal') return { x: cx + amp * Math.sin(ph), y: cy, flip: Math.cos(ph) < 0 };
    if (d.motion === 'circle') return { x: cx + amp * Math.cos(ph), y: cy + amp * Math.sin(ph), flip: -Math.sin(ph) < 0 };
    const tri = (v) => (2 / Math.PI) * Math.asin(Math.sin(v));
    return { x: cx + (bw - iw) / 2 * tri(t * 0.7), y: cy + (bh - ih) / 2 * tri(t * 0.45), flip: Math.cos(t * 0.7) < 0 };
  }

  // ---- styles (AGS look) ---------------------------------------------------------------
  const STYLES = `
    :host{display:block;min-height:100vh;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif}
    *{box-sizing:border-box}
    .root{min-height:100vh;background:var(--primary-background-color,#111);display:flex;justify-content:center;padding:24px}
    .dialog{width:640px;max-width:100%;background:var(--primary-background-color,#111);border-radius:16px;
      box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.05);overflow:hidden;display:flex;flex-direction:column;height:fit-content}
    .head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 0}
    .title{font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
    .ver{font-size:.72rem;color:#63b3ed;font-family:monospace}
    .tabs{display:flex;gap:4px;padding:12px 20px 0;border-bottom:2px solid rgba(255,255,255,.08);margin-top:4px;flex-wrap:wrap}
    .tab{height:40px;padding:0 12px;border-radius:8px 8px 0 0;border:1px solid rgba(255,255,255,.08);border-bottom:none;
      background:linear-gradient(180deg,#2a2f38,#1e2228);color:#94a3b8;font:500 .88rem 'DM Sans',sans-serif;cursor:pointer;
      position:relative;bottom:-2px;display:flex;align-items:center;gap:5px;white-space:nowrap;
      box-shadow:-2px -2px 5px rgba(255,255,255,.06),2px -2px 5px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.1)}
    .tab:hover{color:#e2e8f0}
    .tab.active{background:linear-gradient(180deg,#5ab2e8,#2d7ab5);color:#fff;border-color:rgba(99,179,237,.5);font-weight:700}
    .body{padding:18px 20px;display:flex;flex-direction:column;gap:14px}
    .card{background:var(--card-background-color,#2a2f38);border:1px solid rgba(255,255,255,.06);border-radius:12px;
      box-shadow:12px 12px 24px rgba(0,0,0,.5),-4px -4px 8px rgba(255,255,255,.07),inset -4px -4px 8px rgba(0,0,0,.2),inset 4px 4px 8px rgba(255,255,255,.08)}
    .card-h{padding:12px 16px 0;font-weight:700;font-size:1rem}
    .card-b{padding:12px 16px 16px;display:flex;flex-direction:column;gap:12px}
    .item{display:flex;align-items:center;gap:12px;padding:12px 14px}
    .thumb{width:56px;height:56px;border-radius:10px;background:#0d0f18;object-fit:contain;flex:none}
    .grow{flex:1;min-width:0}
    .name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sub{font-size:.8rem;color:#94a3b8;margin-top:2px}
    .btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    button.b{height:34px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,#323840,#252b33);
      color:#e2e8f0;font:500 .85rem 'DM Sans',sans-serif;cursor:pointer}
    button.b:hover{border-color:rgba(99,179,237,.5)}
    button.primary{background:linear-gradient(180deg,#5ab2e8,#2d7ab5);border-color:rgba(99,179,237,.5);color:#fff;font-weight:700}
    button.danger{color:#fc8181}
    button.b.alloff{background:#e02424;border-color:#ff6b6b;color:#fff;font-weight:700}
    button.b.alloff:hover{background:#ff3030;border-color:#fff}
    .field{display:flex;flex-direction:column;gap:5px}
    .field>label,.lab{font-size:.9rem;font-weight:500;color:#cbd5e0}
    input[type=text],input[type=number],select,textarea{width:100%;padding:9px 12px;background:#0d0f18;border:1px solid rgba(255,255,255,.1);
      border-radius:8px;color:#e2e8f0;font:.9rem 'DM Sans',sans-serif;outline:none}
    input:focus,select:focus,textarea:focus{border-color:rgba(99,179,237,.5)}
    textarea{min-height:70px;resize:vertical}
    input[type=color]{width:100%;height:38px;padding:2px;background:#0d0f18;border:1px solid rgba(255,255,255,.1);border-radius:8px}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .hint{font-size:.82rem;color:#94a3b8}.hint::before{content:'ⓘ ';color:#63b3ed}
    .sw{position:relative;display:inline-block;width:46px;height:26px;flex:none}
    .sw input{opacity:0;width:0;height:0}
    .sw span{position:absolute;inset:0;background:#3a4150;border-radius:26px;cursor:pointer;transition:.2s;box-shadow:inset 0 2px 4px rgba(0,0,0,.5)}
    .sw span::before{content:'';position:absolute;height:20px;width:20px;left:3px;top:3px;background:#e2e8f0;border-radius:50%;transition:.2s}
    .sw input:checked+span{background:#2fcf76}
    .sw input:checked+span::before{transform:translateX(20px)}
    .swrow{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .grid9{display:grid;grid-template-columns:repeat(3,38px);gap:6px}
    .grid9 label{width:38px;height:38px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#0d0f18;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .grid9 input{display:none}.grid9 input:checked+i{width:16px;height:16px;border-radius:50%;background:#63b3ed;display:block}
    .grid9 i{width:6px;height:6px;border-radius:50%;background:#475569;display:block}
    .checks{display:flex;flex-wrap:wrap;gap:8px 14px}.checks label{display:flex;align-items:center;gap:5px;font-size:.85rem}
    .trig{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;background:rgba(0,0,0,.15)}
    .mini{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#63b3ed}
    .preview{position:relative;height:120px;background:#0d0f18;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
    .preview img{position:absolute;left:0;top:0;will-change:transform}
    .modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;z-index:50}
    .mbox{width:600px;max-width:100%;background:var(--primary-background-color,#151821);border-radius:16px;border:1px solid rgba(255,255,255,.08);
      box-shadow:0 32px 80px rgba(0,0,0,.7);display:flex;flex-direction:column;max-height:calc(100vh - 40px)}
    .mhead{padding:14px 18px;font-weight:700;border-bottom:1px solid rgba(255,255,255,.08)}
    .mbody{padding:16px 18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
    .mfoot{padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    .msg{padding:10px 14px;border-radius:10px;font-size:.88rem}.msg.err{background:rgba(252,129,129,.15);color:#fc8181}.msg.ok{background:rgba(47,207,118,.15);color:#2fcf76}
    .empty{padding:28px;text-align:center;color:#94a3b8}
    .drow{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.06)}
    .drow:first-of-type{border-top:none}
    .tag{display:inline-block;font-size:.72rem;padding:1px 8px;border-radius:999px;background:rgba(99,179,237,.18);color:#63b3ed;margin-left:6px;vertical-align:middle;font-weight:600}
    .tag.warnt{background:rgba(246,173,85,.18);color:#f6ad55}
    .tag.run{background:rgba(47,207,118,.18);color:#2fcf76}
    .tag.scene{background:rgba(159,122,234,.2);color:#b794f4}
    .tag.sceneon{background:rgba(236,201,75,.2);color:#ecc94b}
    .warn{padding:8px 12px;border-radius:8px;background:rgba(246,173,85,.14);color:#f6ad55;font-size:.84rem}
    .gh{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin:8px 2px 0}
    .pick{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.06)}
    .pick:first-of-type{border-top:none}
    .pick img{width:34px;height:34px;object-fit:contain;background:#0d0f18;border-radius:6px;flex:none}
    .sumline{font-size:.84rem;color:#63b3ed}
    .thumbs{display:flex;gap:4px;margin-top:6px}.thumbs img{width:26px;height:26px;object-fit:contain;background:#0d0f18;border-radius:5px}
    input[type=date]{width:100%;padding:9px 12px;background:#0d0f18;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;font:.9rem 'DM Sans',sans-serif;color-scheme:dark}
    @media(max-width:600px){.root{padding:8px}.row2{grid-template-columns:1fr}.item{flex-wrap:wrap}.btns{width:100%;justify-content:flex-start}}
  `;

  class DashboardHolidayPopupsPanel extends HTMLElement {
    constructor() {
      super();
      this._tab = 'dated';
      this._config = null;
      this._draft = null;   // the item being edited
      this._sdraft = null;  // the scene being edited
      this._entities = [];
      this._msg = null;
      this._unsub = null;
      this._raf = 0;
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
      this.shadowRoot.addEventListener('input', (e) => this._onInput(e));
      this.shadowRoot.addEventListener('change', (e) => this._onChange(e));
    }

    get _open() { return !!(this._draft || this._sdraft); }
    get _d() { return this._sdraft || this._draft; } // whatever the open editor is changing

    set hass(h) {
      const first = !this._hass;
      this._hass = h;
      if (first) this._init();
    }
    set panel(p) { this._panel = p; }
    set narrow(n) { this._narrow = n; }
    connectedCallback() { this._render(); }
    disconnectedCallback() {
      if (this._unsub) { try { this._unsub(); } catch { /* closed */ } this._unsub = null; }
      cancelAnimationFrame(this._raf);
      if (this._blobs) { for (const u of this._blobs.values()) URL.revokeObjectURL(u); this._blobs = null; }
    }

    async _init() {
      try {
        this._unsub = await this._hass.connection.subscribeMessage((m) => {
          if (m.type === 'config') { this._config = m.config; if (!this._open) this._render(); }
        }, { type: `${DOMAIN}/subscribe_config` });
        const res = await this._hass.callWS({ type: `${DOMAIN}/list_entities` });
        this._entities = res.entities;
      } catch (err) {
        this._msg = { kind: 'err', text: 'Could not load: ' + (err.message || err.code || err) };
        this._render();
      }
    }

    // -- websocket helpers --------------------------------------------------------------
    async _ws(msg) { return this._hass.callWS({ ...msg }); }
    _flash(kind, text) { this._msg = { kind, text }; this._render(); setTimeout(() => { this._msg = null; if (!this._open) this._render(); }, 4000); }

    // -- rendering ------------------------------------------------------------------------
    _render() {
      const root = this.shadowRoot;
      const keepScroll = root.querySelector('.mbody') ? root.querySelector('.mbody').scrollTop : 0;
      root.innerHTML = `<style>${STYLES}</style><div class="root"><div class="dialog">
        <div class="head"><span class="title">Dashboard Holiday Popups</span><span class="ver">v${VERSION}</span></div>
        <div class="tabs">${TABS.map((t) => `<button class="tab ${this._tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.icon} ${t.label}</button>`).join('')}</div>
        <div class="body">${this._msg && !this._open ? `<div class="msg ${this._msg.kind}">${esc(this._msg.text)}</div>` : ''}${this._config ? this._tabBody() : '<div class="empty">Loading…</div>'}</div>
      </div></div>${this._draft ? this._editor() : ''}${this._sdraft ? this._sceneEditor() : ''}`;
      if (this._open) {
        const body = root.querySelector('.mbody');
        if (body) body.scrollTop = keepScroll;
        this._startPreview();
      } else cancelAnimationFrame(this._raf);
      this._hydrateImages();
    }

    /** Fill in the uploaded pictures: fetch each once with the signed-in login and keep it as a blob URL. */
    _hydrateImages() {
      const imgs = [...this.shadowRoot.querySelectorAll('img[data-asrc]')];
      if (!imgs.length) return;
      const cache = this._blobs || (this._blobs = new Map());
      const wanted = new Set();
      for (const img of imgs) {
        const hit = cache.get(img.dataset.asrc);
        if (hit) img.src = hit; else wanted.add(img.dataset.asrc);
      }
      if (!wanted.size || !this._hass || typeof this._hass.fetchWithAuth !== 'function') return;
      const loading = this._loading || (this._loading = new Set());
      for (const url of wanted) {
        if (loading.has(url)) continue;
        loading.add(url);
        this._hass.fetchWithAuth(url)
          .then(async (r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const b = await r.blob();
            if (!b.type.startsWith('image')) throw new Error('not an image');
            cache.set(url, URL.createObjectURL(b));
            for (const img of this.shadowRoot.querySelectorAll('img[data-asrc]')) if (img.dataset.asrc === url) img.src = cache.get(url);
          })
          .catch(() => { /* shown again on the next redraw */ })
          .finally(() => loading.delete(url));
      }
    }

    _dashList() {
      const panels = (this._hass && this._hass.panels) || {};
      return Object.values(panels)
        .filter((p) => p.component_name === 'lovelace' && p.url_path)
        .map((p) => ({ path: '/' + p.url_path, title: p.title || p.url_path }))
        .sort((a, b) => a.title.localeCompare(b.title));
    }

    _dashPicker(lines, textareaAttrs) {
      const set = new Set(lines);
      const boxes = this._dashList().map((d) => `<label><input type="checkbox" data-dash="${esc(d.path)}" ${set.has(d.path) ? 'checked' : ''}> ${esc(d.title)} <span class="sub">${esc(d.path)}</span></label>`).join('');
      return `<div class="checks" style="flex-direction:column">${boxes}</div>
        <textarea ${textareaAttrs}>${esc(lines.join('\n'))}</textarea>
        <div class="hint">Tick the dashboards, or type extra paths (one per line). Leave all empty for every dashboard.</div>`;
    }

    _tabBody() {
      if (this._tab === 'settings') return this._settingsTab();
      if (this._tab === 'scenes') return this._scenesTab();
      return this._itemsTab(this._tab === 'sensors');
    }

    /** Pushed away with "turn off" during a scene that is on right now? */
    _mutedNow(item) {
      const now = new Date();
      return this._scenesOf(item.id).some((sc) => {
        const res = sc.enabled ? recurrenceActive(sc.recurrence, now) : { active: false };
        const token = res.active ? isoOf(res.start) : (sc.running ? 'run' : '');
        return !!token && !!item.muted && item.muted[sc.id] === token;
      });
    }

    /** The scenes of this item that are on right now (a date is on, or Run now). */
    _liveScenesOf(itemId) {
      const now = new Date();
      return this._scenesOf(itemId).filter((sc) => (sc.enabled && recurrenceActive(sc.recurrence, now).active) || sc.running);
    }

    _scenesOf(itemId) { return (this._config.scenes || []).filter((sc) => sc.item_ids.includes(itemId)); }
    _anyRunning() { return [...this._config.items, ...(this._config.scenes || [])].some((x) => x.running); }
    _stopAllButton() { return this._anyRunning() ? '<button class="b" data-act="stop-all">Stop all</button>' : ''; }

    /** The Dated and Sensors screens: the same list, split by what triggers the item. */
    _itemsTab(sensors) {
      const all = this._config.items.filter((i) => isSensorItem(i) === sensors).sort((a, b) => a.order - b.order);
      const adds = ['floater', 'popup', 'decoration'].map((k) => `<button class="b primary" data-act="add" data-kind="${k}">Add Custom ${KIND_NAME[k][0].toUpperCase() + KIND_NAME[k].slice(1)}</button>`).join('');
      const off = all.some((i) => i.enabled) ? `<button class="b alloff" data-act="all-off" title="${sensors ? 'Turns off every item on this screen' : 'Turns off every item on this screen, including ones set to run on dates'}">${sensors ? 'Turn all off' : 'Turn all off (includes dated)'}</button>` : '';
      const intro = sensors
        ? '<div class="hint">Items that show when a weather or sensor condition is met. Starter items arrive without a sensor chosen: press Edit and pick the entity.</div>'
        : '<div class="hint">Items that show on dates, or all the time. <b>Run now</b> shows one until you press Stop, whatever its dates.</div>';
      const groups = ['floater', 'popup', 'decoration'].map((k) => {
        const list = all.filter((i) => i.kind === k);
        return list.length ? `<div class="gh">${KIND_PLURAL[k]}</div>${list.map((i) => this._itemCard(i)).join('')}` : '';
      }).join('');
      return `<div class="btns" style="justify-content:flex-start">${adds}${off}${this._stopAllButton()}</div>${intro}
        ${groups || `<div class="card empty">${sensors ? 'No sensor or weather items yet.' : 'Nothing here yet. Add a character, popup or decoration to get started.'}</div>`}`;
    }

    _summary(i) {
      if (i.kind === 'floater') return i.path.replace(/_/g, ' ');
      if (i.kind === 'popup') return `every ${i.frequency.value} ${i.frequency.unit}`;
      const n = (i.placements || []).length;
      return n === 1 ? i.placements[0].anchor.replace(/_/g, ' ') : `${n} positions`;
    }

    _whenLines(i) {
      const scenes = this._scenesOf(i.id);
      const head = scenes.length ? `<div class="sumline">Also shows when a scene is on: ${esc(scenes.map((sc) => sc.name).join(', '))}</div>` : '';
      if (!i.triggers.length) return head + '<div class="sumline">Shows all the time while switched on</div>';
      const lines = i.triggers.slice(0, 2).map((t) => `<div class="sumline">${t.enabled ? '' : '(paused) '}${esc(this._describeTrigger(t))}</div>`);
      if (i.triggers.length > 2) lines.push(`<div class="sub">+ ${i.triggers.length - 2} more</div>`);
      return head + lines.join('');
    }

    _itemCard(i) {
      const scenes = this._scenesOf(i.id);
      const muted = this._mutedNow(i);
      const live = this._liveScenesOf(i.id);
      const toggle = live.length
        ? `<label class="sw" title="Locked while its scene is on"><input type="checkbox" disabled><span style="opacity:.4"></span></label>`
        : `<label class="sw" title="Pause or resume"><input type="checkbox" data-act="toggle-item" data-id="${esc(i.id)}" ${i.enabled ? 'checked' : ''}><span></span></label>`;
      return `<div class="card item" data-id="${esc(i.id)}">
        ${i.image_url ? `<img class="thumb" ${imgSrc(i.image_url)} alt="">` : '<div class="thumb"></div>'}
        <div class="grow"><div class="name">${esc(i.name)}${i.running ? '<span class="tag run">Running</span>' : ''}${live.length ? `<span class="tag sceneon">On via scene: ${esc(live.map((sc) => sc.name).join(', '))}</span>` : (scenes.length ? `<span class="tag scene">In scene: ${esc(scenes.map((sc) => sc.name).join(', '))}</span>` : '')}${muted ? '<span class="tag warnt">Pushed away for now</span>' : ''}</div>
          <div class="sub">${esc(this._summary(i))}</div>${this._whenLines(i)}</div>
        ${toggle}
        <div class="btns"><button class="b ${i.running ? 'primary' : ''}" data-act="run" data-id="${esc(i.id)}">${i.running ? 'Stop' : 'Run now'}</button>
          ${muted ? `<button class="b" data-act="unmute" data-id="${esc(i.id)}">Bring back</button>` : ''}
          <button class="b" data-act="edit" data-id="${esc(i.id)}">Edit</button>
          <button class="b" data-act="dup" data-id="${esc(i.id)}">Duplicate</button>
          <button class="b danger" data-act="delete" data-id="${esc(i.id)}">Delete</button></div></div>`;
    }

    _describeTrigger(t) {
      if (t.type === 'date') return `${describeRule(t.recurrence)} · ${nextText(t.recurrence)}`;
      if (t.type === 'weather') return t.entity_id ? `${t.entity_id} is ${(t.conditions || []).join(' / ') || '(no condition chosen)'}` : '⚠ choose a weather entity';
      if (t.type === 'entity') return t.entity_id ? `${t.entity_id}${t.attribute ? '.' + t.attribute : ''} ${t.operator.replace('_', ' ')} ${t.value}` : '⚠ choose an entity';
      return t.type === 'manual' ? 'Manual only (Run now or the show_popup service)' : 'Always';
    }

    // -- scenes -----------------------------------------------------------------------------
    _scenesTab() {
      const scenes = [...(this._config.scenes || [])].sort((a, b) => a.order - b.order);
      const cards = scenes.map((sc) => {
        const members = sc.item_ids.map((id) => this._config.items.find((i) => i.id === id)).filter(Boolean);
        return `<div class="card item" data-id="${esc(sc.id)}"><div class="grow">
          <div class="name">${esc(sc.name)}${sc.running ? '<span class="tag run">Running</span>' : ''}</div>
          <div class="sumline">${esc(describeRule(sc.recurrence))}</div><div class="sub">${esc(nextText(sc.recurrence))} · ${members.length} item${members.length === 1 ? '' : 's'}</div>
          <div class="thumbs">${members.slice(0, 8).map((m) => (m.image_url ? `<img ${imgSrc(m.image_url)} alt="" title="${esc(m.name)}">` : '')).join('')}</div></div>
          <label class="sw" title="Pause or resume this scene"><input type="checkbox" data-act="toggle-scene" data-id="${esc(sc.id)}" ${sc.enabled ? 'checked' : ''}><span></span></label>
          <div class="btns"><button class="b ${sc.running ? 'primary' : ''}" data-act="run-scene" data-id="${esc(sc.id)}">${sc.running ? 'Stop' : 'Run now'}</button>
            <button class="b" data-act="edit-scene" data-id="${esc(sc.id)}">Edit</button>
            <button class="b" data-act="dup-scene" data-id="${esc(sc.id)}">Duplicate</button>
            <button class="b danger" data-act="delete-scene" data-id="${esc(sc.id)}">Delete</button></div></div>`;
      }).join('');
      return `<div class="btns" style="justify-content:flex-start"><button class="b primary" data-act="add-scene">Add Custom Scene</button>${this._stopAllButton()}</div>
        <div class="hint">A scene turns a group of items on together, on one schedule. While a scene is on, it decides for its items and their own switches are locked. When the scene is off, each item works on its own again. Adding an item to a scene turns its own switch off; switch it back on to use it alone. Use Duplicate to make a scene for the next person or season.</div>
        ${cards || '<div class="card empty">No scenes yet. A scene is handy for a season, such as Halloween with a witch, ghosts and cobwebs.</div>'}`;
    }

    _settingsTab() {
      const s = this._config.settings;
      return `<div class="card"><div class="card-h">General</div><div class="card-b">
        <div class="swrow"><span class="lab">Master switch (everything on or off)</span><label class="sw"><input type="checkbox" data-s="enabled" ${s.enabled ? 'checked' : ''}><span></span></label></div>
        <div class="row2"><div class="field"><label>Most characters or popups at once</label><input type="number" min="1" max="10" data-s="max_simultaneous" value="${esc(s.max_simultaneous)}"></div>
        <div class="field"><label>Default layer (z-index)</label><input type="number" min="1" data-s="z_index" value="${esc(s.z_index)}"></div></div>
        <div class="field"><label>Default dashboards</label>${this._dashPicker(s.default_dashboards, 'data-s="default_dashboards"')}</div>
        <div class="field"><label>Scale (percent, all characters, popups and decorations)</label><input type="number" min="25" max="400" data-s="scale" value="${esc(s.scale)}"><div class="hint">100 is normal. Raise it if pictures look too small on this screen; it applies on every device.</div></div>
        <div class="field"><label>New popups start from</label><select data-s="popup_default_edge">${[['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']].map(([v, t]) => `<option value="${v}" ${s.popup_default_edge === v ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="hint">The edge a new popup comes in from and is drawn for. Popups you already have keep their own.</div></div>
        <div class="swrow"><span class="lab">Hide characters and popups when the device asks for reduced motion</span><label class="sw"><input type="checkbox" data-s="respect_reduced_motion" ${s.respect_reduced_motion ? 'checked' : ''}><span></span></label></div>
        <div class="hint">Decorations still show. Run now and the show_popup service always work.</div>
        <div class="swrow"><span class="lab">Hide everything on small screens (phones)</span><label class="sw"><input type="checkbox" data-s="hide_on_small_screens" ${s.hide_on_small_screens ? 'checked' : ''}><span></span></label></div>
        <div class="hint">Nothing is drawn while the screen is narrower than 600 pixels, including Run now and the show_popup service. A phone turned sideways is wide enough to show them again.</div>
        <div class="btns" style="justify-content:flex-start"><button class="b primary" data-act="save-settings">Save settings</button></div>
        <div class="hint">Automations can use the services <b>${DOMAIN}.show_popup</b>, <b>${DOMAIN}.hide_all</b> and <b>${DOMAIN}.set_enabled</b>. The master switch and each scene have a switch entity. Items you add yourself get one too; the starter items' switches are hidden until you enable them in the entity settings.</div>
      </div></div>`;
    }

    // -- editor ---------------------------------------------------------------------------
    _f(label, path, type, extra = {}) {
      const d = this._d, v = getPath(d, path);
      const attrs = `data-p="${path}" data-t="${extra.num ? 'number' : type === 'date' ? 'text' : type}"`;
      let control;
      if (type === 'bool') control = `<label class="sw"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}><span></span></label>`;
      else if (type === 'select') control = `<select ${attrs}>${extra.options.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
      else if (type === 'date') control = `<input type="date" ${attrs} value="${esc(v ?? '')}">`;
      else if (type === 'lines') control = `<textarea ${attrs}>${esc((v || []).join('\n'))}</textarea>`;
      else if (type === 'color') control = `<input type="color" ${attrs} value="${esc(/^#[0-9a-f]{6}$/i.test(v) ? v : '#111111')}">`;
      else if (type === 'number') control = `<input type="number" ${attrs} value="${esc(v ?? '')}" ${extra.min != null ? `min="${extra.min}"` : ''} ${extra.max != null ? `max="${extra.max}"` : ''} ${extra.step ? `step="${extra.step}"` : ''}>`;
      else control = `<input type="text" ${attrs} value="${esc(v ?? '')}" ${extra.placeholder ? `placeholder="${esc(extra.placeholder)}"` : ''}>`;
      if (type === 'bool') return `<div class="swrow"><span class="lab">${label}</span>${control}</div>${extra.hint ? `<div class="hint">${extra.hint}</div>` : ''}`;
      return `<div class="field"><label>${label}</label>${control}${extra.hint ? `<div class="hint">${extra.hint}</div>` : ''}</div>`;
    }

    _anchorGrid(path, v) {
      return `<div class="grid9">${ANCHORS.map((a) => `<label title="${a.replace('_', ' ')}"><input type="radio" name="grid-${path}" data-p="${path}" data-t="text" value="${a}" ${v === a ? 'checked' : ''}><i></i></label>`).join('')}</div>`;
    }

    _editor() {
      const d = this._draft;
      const kindName = { floater: 'character', popup: 'popup', decoration: 'decoration' }[d.kind];
      const img = d.image_url ? `<img ${imgSrc(d.image_url)} alt="" style="max-height:110px;max-width:100%;object-fit:contain;background:#0d0f18;border-radius:8px;padding:6px">` : '<div class="hint">No image yet.</div>';
      let specific = '';
      if (d.kind === 'floater') specific = this._floaterFields();
      if (d.kind === 'popup') specific = this._popupFields();
      if (d.kind === 'decoration') specific = this._decorationFields();
      return `<div class="modal"><div class="mbox"><div class="mhead">${d.id ? 'Edit' : 'New'} ${kindName}</div><div class="mbody">
        ${this._msg ? `<div class="msg ${this._msg.kind}">${esc(this._msg.text)}</div>` : ''}
        <div class="card"><div class="card-h">Basics</div><div class="card-b">
          ${this._f('Name', 'name', 'text', { placeholder: 'e.g. Flying witch' })}
          ${this._f('Enabled (pause or resume)', 'enabled', 'bool')}
          <div class="field"><label>Image <span class="hint" style="display:inline">GIF, WebP, APNG or PNG with a transparent background, up to 5 MB</span></label>
            ${img}<input type="file" id="file" accept=".gif,.webp,.png,.apng,image/gif,image/webp,image/png"></div>
          ${this._f('Size (height in pixels)', 'size_px', 'number', { min: 20, max: 1600 })}
        </div></div>
        ${specific}
        <div class="card"><div class="card-h">Where</div><div class="card-b">
          <div class="field"><label>Dashboards</label>${this._dashPicker(d.dashboards || [], 'data-p="dashboards" data-t="lines"')}
            <div class="hint">Empty uses the default list from Settings.</div></div>
          ${this._f('Layer (z-index), optional', 'z_index', 'number', { min: 1, hint: 'Higher draws on top of lower. Empty uses the default layer.' })}
        </div></div>
        <div class="card"><div class="card-h">When it shows</div><div class="card-b">${this._triggersEditor()}</div></div>
        <div class="card"><div class="card-h">Text</div><div class="card-b">
          ${this._f('Message', 'message_template', 'text', { placeholder: 'Happy Birthday, {name}!', hint: '{name} is replaced by the name you give a date or entity trigger.' })}
          ${d.kind === 'popup' ? this._f('Show text banner next to the popup', 'banner.enabled', 'bool') + this._f('Banner text (empty uses Message)', 'banner.text_template', 'text') : this._f('Show text label', 'label.enabled', 'bool')}
          <div class="row2">${this._f('Text size', 'label.font_size', 'number', { min: 10, max: 80 })}
            ${d.kind === 'popup' ? '' : this._f('Label position', 'label.position', 'select', { options: [['above', 'Above'], ['below', 'Below']] })}</div>
          <div class="row2">${this._f('Text color', 'label.color', 'color')}${this._f('Background color', 'label.background', 'color')}</div>
        </div></div>
      </div><div class="mfoot"><button class="b" data-act="cancel">Cancel</button>
        ${this._runButton(d.id, this._config.items, 'run')}
        <button class="b primary" data-act="save">Save</button></div></div></div>`;
    }

    _runButton(id, list, act) {
      if (!id) return '';
      const live = list.find((x) => x.id === id);
      const on = !!(live && live.running);
      return `<button class="b ${on ? 'primary' : ''}" data-act="${act}" data-id="${esc(id)}">${on ? 'Stop' : 'Run now'}</button>`;
    }

    _sceneEditor() {
      const d = this._sdraft;
      const scenes = this._config.scenes || [];
      const items = this._config.items.filter((i) => !isSensorItem(i)).sort((a, b) => a.order - b.order);
      const overlapOf = new Map();
      const overlaps = (sc) => {
        if (!overlapOf.has(sc.id)) overlapOf.set(sc.id, rulesOverlap(d.recurrence, sc.recurrence));
        return overlapOf.get(sc.id);
      };
      let clashes = 0;
      const rows = ['floater', 'popup', 'decoration'].map((k) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return '';
        return `<div class="gh">${KIND_PLURAL[k]}</div>` + list.map((i) => {
          const checked = d.item_ids.includes(i.id);
          const notes = scenes.filter((sc) => sc.id !== d.id && sc.item_ids.includes(i.id)).map((sc) => {
            const clash = overlaps(sc);
            if (checked && clash) clashes++;
            return `<div class="warn">⚠ Already in the scene “${esc(sc.name)}”${clash ? ', and its dates overlap with this scene. It will show whenever either scene is on.' : ' (on different dates).'}</div>`;
          }).join('');
          return `<label class="pick"><input type="checkbox" data-sitem="${esc(i.id)}" ${checked ? 'checked' : ''}>${i.image_url ? `<img ${imgSrc(i.image_url)} alt="">` : ''}
            <span class="grow"><span class="name">${esc(i.name)}</span>${notes}</span></label>`;
        }).join('');
      }).join('');
      return `<div class="modal"><div class="mbox"><div class="mhead">${d.id ? 'Edit' : 'New'} scene</div><div class="mbody">
        ${this._msg ? `<div class="msg ${this._msg.kind}">${esc(this._msg.text)}</div>` : ''}
        <div class="card"><div class="card-h">Basics</div><div class="card-b">
          ${this._f('Name', 'name', 'text', { placeholder: 'e.g. Halloween' })}
          ${this._f('Enabled (pause or resume)', 'enabled', 'bool')}
          ${this._f('Name shown in banners (optional)', 'banner_name', 'text', { placeholder: 'e.g. Joe', hint: 'A popup banner can say {name}. While this scene shows an item, {name} becomes this.' })}
        </div></div>
        <div class="card"><div class="card-h">When</div><div class="card-b">${this._recEditor('recurrence', d.recurrence)}</div></div>
        <div class="card"><div class="card-h">Items</div><div class="card-b">
          <div class="hint">Only dated items can join a scene. Items triggered by weather or a sensor stay on the Sensors screen.</div>
          ${clashes ? `<div class="warn">⚠ ${clashes} chosen item${clashes === 1 ? ' is' : 's are'} already in another scene that runs on the same dates.</div>` : ''}
          ${rows || '<div class="hint">There are no dated items yet.</div>'}
        </div></div>
      </div><div class="mfoot"><button class="b" data-act="cancel">Cancel</button>
        ${this._runButton(d.id, scenes, 'run-scene')}
        <button class="b primary" data-act="save-scene">Save</button></div></div></div>`;
    }

    /** The repeat picker, shared by date triggers and scenes. `base` is the path of the rule inside the draft. */
    _recEditor(base, r) {
      const p = (k) => `${base}.${k}`;
      const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[r.repeat];
      const dayControls = (withMonth) => `
        ${this._f('On', p('by'), 'select', { options: [['day', withMonth ? 'A date (like November 14)' : 'A day of the month'], ['weekday', 'A weekday (like the 4th Thursday)']] })}
        ${withMonth ? this._f('Month', p('month'), 'select', { num: true, options: MONTHS.map((m, n) => [n + 1, m]) }) : ''}
        ${r.by === 'weekday'
    ? `<div class="row2">${this._f('Which', p('nth'), 'select', { num: true, options: [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [-1, 'Last']] })}${this._f('Weekday', p('weekday'), 'select', { num: true, options: WEEKDAYS.map((w, n) => [n, w]) })}</div>`
    : this._f('Day of the month', p('day'), 'number', { min: 1, max: 31, hint: r.day > 28 ? 'Shorter months use their last day.' : '' })}`;
      const repeating = r.repeat !== 'none';
      return `<div class="row2">${this._f('Starts', p('start'), 'date')}${this._f('Lasts (days)', p('length_days'), 'number', { min: 1, max: 366 })}</div>
        ${this._f('Repeats', p('repeat'), 'select', { options: [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']] })}
        ${repeating ? this._f(`Every (${unit})`, p('interval'), 'number', { min: 1, max: 99 }) : ''}
        ${r.repeat === 'weekly' ? `<div class="field"><label>On</label><div class="checks">${WEEKDAYS.map((w, n) => `<label><input type="checkbox" data-wd="${n}" data-rule="${esc(base)}" ${(r.weekdays || []).includes(n) ? 'checked' : ''}> ${w.slice(0, 3)}</label>`).join('')}</div></div>` : ''}
        ${r.repeat === 'monthly' ? dayControls(false) : ''}
        ${r.repeat === 'yearly' ? dayControls(true) : ''}
        ${repeating ? this._f('Ends', p('ends'), 'select', { options: [['never', 'Never'], ['on', 'On a date'], ['after', 'After a number of times']] }) : ''}
        ${repeating && r.ends === 'on' ? this._f('Last day', p('until'), 'date') : ''}
        ${repeating && r.ends === 'after' ? this._f('Number of times', p('count'), 'number', { min: 1, max: 9999 }) : ''}
        <div data-recsum="${esc(base)}">${this._recSummary(r)}</div>`;
    }

    _recSummary(r) { return `<div class="sumline">${esc(describeRule(r))}</div><div class="sub">${esc(nextText(r))}</div>`; }

    _refreshRecSummaries() {
      for (const el of this.shadowRoot.querySelectorAll('[data-recsum]')) {
        const r = getPath(this._d, el.dataset.recsum);
        if (r) el.innerHTML = this._recSummary(r);
      }
    }

    /** What a push does, for characters and popups. */
    _pushFields(label) {
      const d = this._draft;
      return this._f(label, 'drag_off.enabled', 'bool')
        + (d.drag_off.enabled ? this._f('When pushed away', 'drag_off.action', 'select', { options: [['delay', 'Come back after a delay'], ['off', 'Turn it off (until you switch it on again)']] })
          + (d.drag_off.action === 'off' ? '' : this._f('Stays away for (seconds)', 'drag_off.away_seconds', 'number', { min: 1, max: 3600 })) : '');
    }

    _floaterFields() {
      const d = this._draft;
      const motionRel = d.path === 'free_float';
      const arc = d.path === 'curve_arc';
      return `<div class="card"><div class="card-h">Movement</div><div class="card-b">
        <div class="preview" id="preview">${d.image_url ? `<img id="pimg" ${imgSrc(d.image_url)} alt="">` : '<div class="hint" style="padding:12px">Add an image to see the movement.</div>'}</div>
        ${this._f('Path', 'path', 'select', { options: [['bottom_straight', 'Walk along the bottom'], ['top_straight', 'Walk along the top'], ['free_float', 'Float freely or stay in place'], ['curve_arc', 'Curved path across the screen']] })}
        ${motionRel ? this._f('Motion', 'motion', 'select', { options: [['drift', 'Drift around (random)'], ['bob_vertical', 'Bob up and down'], ['sway_horizontal', 'Sway side to side'], ['circle', 'Circle']] }) : ''}
        ${arc ? this._f('Wave shape', 'wave_shape', 'select', { options: [['sine', 'Smooth curve'], ['zigzag', 'Zigzag (W / M shape)']] }) + this._f('Peaks across the screen', 'peaks', 'number', { min: 1, max: 10 }) : ''}
        ${(arc || (motionRel && d.motion !== 'drift')) ? this._f('Height of the movement (pixels)', 'amplitude_px', 'number', { min: 0, max: 800 }) : ''}
        ${(motionRel && d.motion !== 'drift') ? this._f('Seconds per cycle', 'period_seconds', 'number', { min: 0.5, max: 120, step: 0.5 })
          + `<div class="field"><label>Stay near (position on screen)</label>${this._anchorGrid('anchor', d.anchor)}</div>` : ''}
        ${!(motionRel && d.motion !== 'drift') ? this._f('Speed (pixels per second)', 'speed', 'number', { min: 5, max: 600 }) : ''}
        ${(d.path !== 'free_float') ? this._f('Direction', 'direction', 'select', { options: [['both', 'Back and forth'], ['left_to_right', 'Left to right only'], ['right_to_left', 'Right to left only']] }) : ''}
        ${this._pushFields('Can be pushed off the screen with a finger')}
        <div class="hint">One image is used for both directions; it is flipped when the character turns around.</div>
      </div></div>`;
    }

    _popupFields() {
      const d = this._draft;
      const edgeBox = ['bottom', 'top', 'left', 'right'].map((e) => `<label><input type="checkbox" data-edge="${e}" ${d.allowed_edges.includes(e) ? 'checked' : ''}> ${e}</label>`).join('');
      const pos = d.position_along_edge;
      return `<div class="card"><div class="card-h">Popup</div><div class="card-b">
        ${this._f('Peeks in from', 'anchor', 'select', { options: [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['left_right', 'Left or right (random)'], ['top_bottom', 'Top or bottom (random)'], ['random', 'Any edge (random)']] })}
        ${this._f('Picture is drawn for', 'drawn_for', 'select', { options: [['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']], hint: 'The edge where the picture is cut off. It is turned from there when the popup comes in from another edge.' })}
        ${d.anchor === 'random' ? `<div class="field"><label class="lab">Edges to choose from</label><div class="checks">${edgeBox}</div></div>` : ''}
        ${this._f('Position along the edge', 'position_along_edge', 'select', { options: [['center', 'Center'], ['random', 'Random'], ['25', 'Quarter way'], ['75', 'Three quarters']].concat(!['center', 'random', '25', '75'].includes(String(pos)) ? [[String(pos), `${pos}%`]] : []) })}
        <div class="row2">${this._f('How often', 'frequency.value', 'number', { min: 1 })}${this._f('Unit', 'frequency.unit', 'select', { options: [['seconds', 'seconds'], ['minutes', 'minutes']] })}</div>
        ${this._f('Stays on screen (seconds)', 'duration_seconds', 'number', { min: 1, max: 600 })}
        ${this._f('When its trigger is active', 'repeat_mode', 'select', { options: [['repeat', 'Repeat every interval'], ['once', 'Show once, until the trigger clears and returns']] })}
        ${this._f('Turn the picture to face into the screen on other edges', 'rotate_for_edge', 'bool', { hint: 'Popup art is drawn for the bottom edge.' })}
        ${this._pushFields('Can be pushed back off the screen with a finger')}
      </div></div>`;
    }

    _decorationFields() {
      const d = this._draft;
      const places = (d.placements || []).map((pl, n) => `<div class="card" style="margin:8px 0"><div class="card-b">
        <div class="field"><label>Position ${n + 1}</label>${this._anchorGrid(`placements.${n}.anchor`, pl.anchor)}</div>
        <div class="row2">${this._f('Move in from the edge, across (px)', `placements.${n}.offset_px.x`, 'number')}${this._f('Move in from the edge, down/up (px)', `placements.${n}.offset_px.y`, 'number')}</div>
        ${this._f('Size for this corner (height in pixels), optional', `placements.${n}.size_px`, 'number', { min: 20, max: 1600, hint: 'Empty uses the size at the top.' })}
        ${this._f('Flip to fit this corner', `placements.${n}.flip`, 'bool', { hint: 'Right positions flip left to right; bottom positions flip top to bottom.' })}
        ${d.placements.length > 1 ? `<div class="btns" style="justify-content:flex-start"><button class="b" data-act="del-placement" data-idx="${n}">Remove this position</button></div>` : ''}
      </div></div>`).join('');
      return `<div class="card"><div class="card-h">Decoration</div><div class="card-b">
        ${places}
        <div class="btns" style="justify-content:flex-start"><button class="b" data-act="add-placement">＋ Add another corner</button></div>
        ${this._f('Opacity (0 to 1)', 'opacity', 'number', { min: 0, max: 1, step: 0.05 })}
        <div class="hint">Decorations are always click-through and are drawn in front of the dashboard, so keep them small.</div>
      </div></div>`;
    }

    _triggersEditor() {
      const d = this._draft;
      const weatherEntities = this._entities.filter((e) => e.domain === 'weather');
      const list = d.triggers.map((t, idx) => {
        const base = `triggers.${idx}`;
        let fields = '';
        const nameField = this._f('Name (used for {name})', `${base}.name`, 'text');
        if (t.type === 'date') {
          fields = this._recEditor(`${base}.recurrence`, t.recurrence);
        } else if (t.type === 'weather') {
          fields = `<div class="field"><label>Weather entity</label><select data-p="${base}.entity_id" data-t="text"><option value="">Choose…</option>${weatherEntities.map((e) => `<option value="${esc(e.entity_id)}" ${t.entity_id === e.entity_id ? 'selected' : ''}>${esc(e.name)} (${esc(e.entity_id)})</option>`).join('')}</select></div>
            <div class="field"><label>Show when the weather is</label><div class="checks">${WEATHER.map((w) => `<label><input type="checkbox" data-cond="${idx}" value="${w}" ${(t.conditions || []).includes(w) ? 'checked' : ''}> ${w}</label>`).join('')}</div></div>`;
        } else if (t.type === 'entity') {
          fields = `<div class="field"><label>Entity</label><input type="text" list="ents" data-p="${base}.entity_id" data-t="text" value="${esc(t.entity_id)}" placeholder="start typing to search"></div>
            ${this._f('Attribute (optional)', `${base}.attribute`, 'text')}
            <div class="row2">${this._f('Is', `${base}.operator`, 'select', { options: [['equals', 'equal to'], ['not_equals', 'not equal to'], ['above', 'above'], ['below', 'below'], ['contains', 'contains']] })}${this._f('Value', `${base}.value`, 'text')}</div>`;
        } else if (t.type === 'manual') fields = '<div class="hint">Only shows when you press Run now or call the show_popup service.</div>';
        else fields = '<div class="hint">Always shows.</div>';
        return `<div class="trig"><div class="swrow"><span class="mini">${esc(t.type)}</span>
          <span style="display:flex;gap:10px;align-items:center"><label class="sw" title="Pause this trigger"><input type="checkbox" data-p="${base}.enabled" data-t="bool" ${t.enabled ? 'checked' : ''}><span></span></label>
          <button class="b danger" data-act="del-trigger" data-idx="${idx}">Remove</button></span></div>${['date', 'entity', 'weather'].includes(t.type) ? nameField : ''}${fields}</div>`;
      }).join('');
      return `<datalist id="ents">${this._entities.map((e) => `<option value="${esc(e.entity_id)}">${esc(e.name)}</option>`).join('')}</datalist>
        ${list || '<div class="hint">No triggers: it shows all the time while enabled.</div>'}
        <div class="row2"><select id="newtrig"><option value="date">Date, or repeating dates</option><option value="weather">Weather</option><option value="entity">Entity state</option><option value="manual">Manual only</option><option value="always">Always</option></select>
        <button class="b" data-act="add-trigger">＋ Add trigger</button></div>
        <div class="hint">It shows when any enabled trigger is satisfied. Paused triggers are ignored.</div>`;
    }

    _startPreview() {
      cancelAnimationFrame(this._raf);
      const d = this._draft;
      const root = this.shadowRoot;
      const box = root.getElementById('preview'), img = root.getElementById('pimg');
      if (!box || !img || d.kind !== 'floater') return;
      const ih = 52;
      const start = performance.now();
      const loop = (now) => {
        const bw = box.clientWidth, bh = box.clientHeight;
        const nat = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
        const iw = ih * nat;
        img.style.height = ih + 'px'; img.style.width = iw + 'px';
        const p = previewPos(this._draft, (now - start) / 1000, bw, bh, iw, ih);
        img.style.transform = `translate(${p.x}px,${p.y}px) ${p.flip ? 'scaleX(-1)' : ''}`;
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    // -- events ---------------------------------------------------------------------------
    _readValue(el) {
      const t = el.dataset.t;
      if (t === 'bool') return el.checked;
      if (t === 'number') return el.value === '' ? null : Number(el.value);
      if (t === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      return el.value;
    }

    _onInput(e) {
      const el = e.target;
      if (el.dataset.p && this._d && el.tagName !== 'SELECT' && el.type !== 'radio' && el.type !== 'checkbox') {
        let v = this._readValue(el);
        if (el.dataset.p === 'position_along_edge') v = isNaN(Number(v)) ? v : Number(v);
        setPath(this._d, el.dataset.p, v);
        if (/(^|\.)recurrence\./.test(el.dataset.p)) this._refreshRecSummaries();
      }
    }

    _onChange(e) {
      const el = e.target;
      if (el.id === 'file') { this._upload(el.files[0]); return; }
      if (el.dataset.act === 'toggle-item') { this._toggleItem(el.dataset.id, el.checked); return; }
      if (el.dataset.act === 'toggle-scene') { this._toggleScene(el.dataset.id, el.checked); return; }
      if (el.dataset.dash !== undefined) {
        const ta = el.closest('.field').querySelector('textarea');
        const lines = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
        const at = lines.indexOf(el.dataset.dash);
        if (el.checked && at < 0) lines.push(el.dataset.dash);
        if (!el.checked && at >= 0) lines.splice(at, 1);
        ta.value = lines.join('\n');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (el.dataset.s !== undefined) return; // settings are read on Save
      if (!this._d) return;
      if (el.dataset.sitem) {
        const set = new Set(this._sdraft.item_ids);
        el.checked ? set.add(el.dataset.sitem) : set.delete(el.dataset.sitem);
        this._sdraft.item_ids = [...set];
        this._render(); // the warnings depend on what is ticked
        return;
      }
      if (el.dataset.wd !== undefined) {
        const rule = getPath(this._d, el.dataset.rule);
        const set = new Set(rule.weekdays || []);
        el.checked ? set.add(Number(el.dataset.wd)) : set.delete(Number(el.dataset.wd));
        rule.weekdays = [...set].sort((a, b) => a - b);
        this._refreshRecSummaries();
        return;
      }
      if (el.dataset.edge) {
        const set = new Set(this._draft.allowed_edges);
        el.checked ? set.add(el.dataset.edge) : set.delete(el.dataset.edge);
        this._draft.allowed_edges = [...set];
        return;
      }
      if (el.dataset.cond !== undefined) {
        const t = this._draft.triggers[Number(el.dataset.cond)];
        const set = new Set(t.conditions || []);
        el.checked ? set.add(el.value) : set.delete(el.value);
        t.conditions = [...set];
        return;
      }
      if (el.dataset.p) {
        const path = el.dataset.p;
        let v = this._readValue(el);
        if (path === 'position_along_edge') v = isNaN(Number(v)) ? v : Number(v);
        setPath(this._d, path, v);
        // Fields that change what else is shown
        if (/^(path|motion|anchor|drag_off\.enabled|drag_off\.action|wave_shape|banner\.enabled|label\.enabled)$/.test(path)) this._render();
        if (/(^|\.)recurrence\.(repeat|by|ends)$/.test(path)) this._render();
        else if (/(^|\.)recurrence\./.test(path)) this._refreshRecSummaries();
        if (/(^|\.)recurrence\.start$/.test(path)) { syncRuleToStart(getPath(this._d, path.replace(/\.start$/, ''))); this._render(); }
        if (path === 'name' && this._draft && !this._draft.id && !this._draft._dup) { applyNameDefaults(this._draft, this._config.settings.popup_default_edge); }
      }
    }

    _onClick(e) {
      const tab = e.target.closest('[data-tab]');
      if (tab) { this._tab = tab.dataset.tab; this._render(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.tagName === 'INPUT') return;
      const act = btn.dataset.act, id = btn.dataset.id;
      if (act === 'add') this._newItem(btn.dataset.kind);
      else if (act === 'edit') { this._draft = clone(this._config.items.find((i) => i.id === id)); this._msg = null; this._render(); }
      else if (act === 'add-scene') { this._sdraft = { name: '', enabled: true, banner_name: '', recurrence: newRule(), item_ids: [] }; this._msg = null; this._render(); }
      else if (act === 'dup') {
        const d = clone(this._config.items.find((x) => x.id === id));
        delete d.id; delete d.order;
        d.name = `${d.name} copy`; d.running = false; d.muted = {}; d._dup = true;
        this._draft = d; this._msg = null; this._render();
      }
      else if (act === 'dup-scene') {
        const d = clone(this._config.scenes.find((x) => x.id === id));
        delete d.id; delete d.order;
        d.name = `${d.name} copy`; d.running = false;
        this._sdraft = d; this._msg = null; this._render();
      }
      else if (act === 'edit-scene') { this._sdraft = clone(this._config.scenes.find((sc) => sc.id === id)); this._msg = null; this._render(); }
      else if (act === 'cancel') { this._draft = null; this._sdraft = null; this._msg = null; this._render(); }
      else if (act === 'save') this._saveDraft();
      else if (act === 'save-scene') this._saveScene();
      else if (act === 'delete') this._delete(id);
      else if (act === 'delete-scene') this._deleteScene(id);
      else if (act === 'run') this._run(id);
      else if (act === 'run-scene') this._runScene(id);
      else if (act === 'unmute') this._unmute(id);
      else if (act === 'stop-all') this._stopAll();
      else if (act === 'add-placement') {
        const last = this._draft.placements[this._draft.placements.length - 1];
        const used = new Set(this._draft.placements.map((pl) => pl.anchor));
        const next = ['top_left', 'bottom_left', 'bottom_right', 'top_right'].find((a) => !used.has(a)) || last.anchor;
        if (this._draft.placements.length < 40) this._draft.placements.push({ anchor: next, offset_px: { x: last.offset_px.x, y: last.offset_px.y }, flip: true, size_px: null });
        this._render();
      }
      else if (act === 'del-placement') { this._draft.placements.splice(Number(btn.dataset.idx), 1); this._render(); }
      else if (act === 'add-trigger') this._addTrigger();
      else if (act === 'del-trigger') { this._draft.triggers.splice(Number(btn.dataset.idx), 1); this._render(); }
      else if (act === 'save-settings') this._saveSettings();
      else if (act === 'all-off') this._allOff();
    }

    /** A new item starts with a trigger that fits the screen it was added from. */
    _newItem(kind) {
      const d = newItem(kind, this._config.settings.popup_default_edge);
      d.triggers = this._tab === 'sensors'
        ? [{ id: uid(), type: 'entity', enabled: true, name: '', entity_id: '', attribute: '', operator: 'equals', value: '' }]
        : [{ id: uid(), type: 'date', enabled: true, name: '', recurrence: newRule() }];
      this._draft = d;
      this._msg = null;
      this._render();
    }

    _addTrigger() {
      const type = this.shadowRoot.getElementById('newtrig').value;
      const t = { id: uid(), type, enabled: true, name: '' };
      if (type === 'date') t.recurrence = newRule();
      if (type === 'weather') Object.assign(t, { entity_id: '', conditions: [] });
      if (type === 'entity') Object.assign(t, { entity_id: '', attribute: '', operator: 'equals', value: '' });
      this._draft.triggers.push(t);
      this._render();
    }

    async _upload(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { this._msg = { kind: 'err', text: 'That file is larger than 5 MB.' }; this._render(); return; }
      try {
        const body = new FormData();
        body.append('file', file, file.name);
        const resp = await this._hass.fetchWithAuth(`/api/${DOMAIN}/upload`, { method: 'POST', body });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.message || `Upload failed (${resp.status})`);
        this._draft.image = { file: data.file, builtin: false };
        this._draft.image_url = data.url;
        this._msg = null;
      } catch (err) {
        this._msg = { kind: 'err', text: err.message || String(err) };
      }
      this._render();
    }

    async _saveDraft() {
      const d = clone(this._draft);
      if (!d.name.trim()) { this._msg = { kind: 'err', text: 'Please give it a name.' }; this._render(); return; }
      if (!d.image.file) { this._msg = { kind: 'err', text: 'Please add an image.' }; this._render(); return; }
      try {
        await this._ws({ type: `${DOMAIN}/save_item`, item: d });
        this._draft = null; this._msg = null;
        this._flash('ok', 'Saved.');
      } catch (err) {
        this._msg = { kind: 'err', text: err.message || String(err) };
        this._render();
      }
    }

    async _toggleItem(id, on) {
      const item = this._config.items.find((i) => i.id === id);
      if (!item) return;
      try { await this._ws({ type: `${DOMAIN}/save_item`, item: { ...clone(item), enabled: on } }); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _toggleScene(id, on) {
      const scene = this._config.scenes.find((sc) => sc.id === id);
      if (!scene) return;
      try { await this._ws({ type: `${DOMAIN}/save_scene`, scene: { ...clone(scene), enabled: on } }); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _delete(id) {
      const item = this._config.items.find((i) => i.id === id);
      if (!item || !window.confirm(`Delete "${item.name}"?`)) return;
      try { await this._ws({ type: `${DOMAIN}/delete_item`, item_id: id }); this._flash('ok', 'Deleted.'); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _saveScene() {
      const d = clone(this._sdraft);
      if (!d.name.trim()) { this._msg = { kind: 'err', text: 'Please give the scene a name.' }; this._render(); return; }
      try {
        await this._ws({ type: `${DOMAIN}/save_scene`, scene: d });
        this._sdraft = null; this._msg = null;
        this._flash('ok', 'Scene saved.');
      } catch (err) {
        this._msg = { kind: 'err', text: err.message || String(err) };
        this._render();
      }
    }

    async _deleteScene(id) {
      const scene = this._config.scenes.find((sc) => sc.id === id);
      if (!scene || !window.confirm(`Delete the scene "${scene.name}"? Its items stay, and go back to their own dates.`)) return;
      try { await this._ws({ type: `${DOMAIN}/delete_scene`, scene_id: id }); this._flash('ok', 'Deleted.'); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }

    /** Run now / Stop. Saved on the server, so it survives a reload and a restart. */
    async _run(id) {
      const item = this._config.items.find((i) => i.id === id);
      if (!item) return;
      const turnOn = !item.running;
      try {
        await this._ws({ type: `${DOMAIN}/run_item`, item_id: id, running: turnOn });
        this._afterRun(turnOn);
      } catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _runScene(id) {
      const scene = this._config.scenes.find((sc) => sc.id === id);
      if (!scene) return;
      const turnOn = !scene.running;
      try {
        await this._ws({ type: `${DOMAIN}/run_scene`, scene_id: id, running: turnOn });
        this._afterRun(turnOn);
      } catch (err) { this._flash('err', err.message || String(err)); }
    }

    _afterRun(turnedOn) {
      if (turnedOn && !this._config.settings.enabled) this._flash('err', 'Running, but the master switch (Settings) is off, so nothing shows until you switch it on.');
      else if (this._open) this._render(); // an open editor does not redraw on its own
    }

    /** Bring back an item that was pushed away until its scene's next run. */
    async _unmute(id) {
      try { await this._ws({ type: `${DOMAIN}/unmute_item`, item_id: id }); this._flash('ok', 'Brought back.'); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _stopAll() {
      try {
        const res = await this._ws({ type: `${DOMAIN}/stop_all` });
        this._flash('ok', `Stopped ${res.changed}.`);
      } catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _allOff() {
      const sensors = this._tab === 'sensors';
      const ids = this._config.items.filter((i) => isSensorItem(i) === sensors && i.enabled).map((i) => i.id);
      if (!ids.length || !window.confirm(`Turn off ${ids.length} item${ids.length === 1 ? '' : 's'} on this screen?${sensors ? '' : ' CAUTION: this includes items set to run on dates, such as birthdays and holidays. They will not appear on their dates until you switch them back on.'} You can switch each one back on.`)) return;
      try {
        const res = await this._ws({ type: `${DOMAIN}/disable_all`, item_ids: ids });
        this._flash('ok', `Turned off ${res.changed}.`);
      } catch (err) { this._flash('err', err.message || String(err)); }
    }

    async _saveSettings() {
      const q = (k) => this.shadowRoot.querySelector(`[data-s="${k}"]`);
      const settings = {
        enabled: q('enabled').checked,
        max_simultaneous: Number(q('max_simultaneous').value),
        z_index: Number(q('z_index').value),
        scale: Number(q('scale').value),
        popup_default_edge: q('popup_default_edge').value,
        respect_reduced_motion: q('respect_reduced_motion').checked,
        hide_on_small_screens: q('hide_on_small_screens').checked,
        default_dashboards: q('default_dashboards').value.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      try { await this._ws({ type: `${DOMAIN}/save_settings`, settings }); this._flash('ok', 'Settings saved.'); }
      catch (err) { this._flash('err', err.message || String(err)); }
    }
  }

  customElements.define(ELEMENT, DashboardHolidayPopupsPanel);
  console.info(`%cDashboard Holiday Popups panel v${VERSION}`, 'color:#63b3ed;font-weight:bold');
})();
