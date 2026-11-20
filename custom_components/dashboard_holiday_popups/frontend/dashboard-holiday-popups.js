/* Dashboard Holiday Popups runtime  pja v1.0.7
   Loaded on every Home Assistant page by the integration. Decides per page whether to draw
   anything, then animates floaters, popups and decorations over the dashboard. */
(() => {
  'use strict';
  const VERSION = '1.0.7'; // pja v1.0.7
  if (window.__dhpRuntime) return;
  window.__dhpRuntime = VERSION;

  const DOMAIN = 'dashboard_holiday_popups';
  const RETRY_IMAGE_MS = 10000;
  const SMALL_SCREEN_PX = 600;   // narrower than this counts as a phone
  const WAIT_HASS_MS = 500;      // the page is not ready yet: look again soon
  const UPLOADS_PREFIX = `/${DOMAIN}_files/`; // your own pictures: served to signed-in users only
  const EDGE_MARGIN = 80;       // release within this many px of an edge = pushed off
  const FLOOR_GAP = 4;
  const POPUP_SLIDE_MS = 450;
  const POPUP_GAP = 12;

  // ---------------------------------------------------------------------
  // Pure helpers (also exposed for tests)
  // ---------------------------------------------------------------------
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

  function dateTriggerActive(t, now) {
    return !!(t.recurrence && recurrenceActive(t.recurrence, now).active);
  }

  const UNKNOWN = new Set(['unknown', 'unavailable', '', undefined, null]);

  function entityTriggerActive(t, states) {
    const st = states && states[t.entity_id];
    if (!st || UNKNOWN.has(st.state)) return false;
    let value = st.state;
    if (t.attribute) {
      value = st.attributes ? st.attributes[t.attribute] : undefined;
      if (UNKNOWN.has(value)) return false;
    }
    const want = String(t.value);
    const text = String(value);
    switch (t.operator) {
      case 'equals': return text === want;
      case 'not_equals': return text !== want;
      case 'contains': return text.toLowerCase().includes(want.toLowerCase());
      case 'above': { const a = parseFloat(text), b = parseFloat(want); return !isNaN(a) && !isNaN(b) && a > b; }
      case 'below': { const a = parseFloat(text), b = parseFloat(want); return !isNaN(a) && !isNaN(b) && a < b; }
      default: return false;
    }
  }

  function weatherTriggerActive(t, states) {
    const st = states && states[t.entity_id];
    if (!st || UNKNOWN.has(st.state)) return false;
    return (t.conditions || []).includes(st.state);
  }

  /** Returns { active, name }. Paused triggers are ignored. No triggers at all = always. */
  function itemTriggerState(item, now, states, manual) {
    const triggers = item.triggers || [];
    if (triggers.length === 0) return { active: true, name: '' };
    for (const t of triggers) {
      if (!t.enabled) continue;
      let hit = false;
      switch (t.type) {
        case 'always': hit = true; break;
        case 'date': hit = dateTriggerActive(t, now); break;
        case 'weather': hit = weatherTriggerActive(t, states); break;
        case 'entity': hit = entityTriggerActive(t, states); break;
        case 'manual': hit = !!(manual && manual.get(item.id) > now.getTime()); break;
        default: hit = false;
      }
      if (hit) return { active: true, name: t.name || '' };
    }
    return { active: false, name: '' };
  }

  function fillTemplate(template, name) {
    return String(template || '').split('{name}').join(name || '');
  }

  const waveValue = (shape, phase) =>
    shape === 'zigzag' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);

  function anchorPoint(anchor, vw, vh, w, h, pad) {
    const left = pad, right = vw - w - pad, top = pad, bottom = vh - h - pad;
    const cx = (vw - w) / 2, cy = (vh - h) / 2;
    const map = {
      top_left: [left, top], top: [cx, top], top_right: [right, top],
      left: [left, cy], center: [cx, cy], right: [right, cy],
      bottom_left: [left, bottom], bottom: [cx, bottom], bottom_right: [right, bottom],
    };
    return map[anchor] || map.center;
  }

  // Device setting "reduce motion": characters and popups stay hidden unless the user pressed Run now
  // or called show_popup. Decorations are still pictures, so they stay. Settings can turn this off.
  const reduceQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => !!(reduceQuery && reduceQuery.matches);
  // "Hide on small screens" in Settings: draw nothing while the page is narrower than a phone held upright.
  const hiddenOnSmallScreen = () => !!(config.settings && config.settings.hide_on_small_screens === true) && window.innerWidth < SMALL_SCREEN_PX;

  const rectsOverlap = (a, b, gap) =>
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

  if (window.__DHP_TEST__) {
    window.__dhpTest = {
      dateTriggerActive, recurrenceActive, recurrenceNext, entityTriggerActive, weatherTriggerActive,
      itemTriggerState, fillTemplate, waveValue, anchorPoint, rectsOverlap,
    };
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let config = { settings: { enabled: true, max_simultaneous: 3, z_index: 900, default_dashboards: [] }, items: [], scenes: [] };
  const images = new Map();       // url -> { status, blob, w, h, timer }
  const runners = new Map();      // item id -> runner
  const manual = new Map();       // item id -> expiry ms (from the show_popup service)
  const popupState = new Map();   // item id -> { sig, nextFire, wasActive, shown }
  const messageOverride = new Map(); // item id -> { text, duration }
  let hiddenAllUntil = 0;
  let unsub = null;
  let rafId = 0;
  let reconcileTimer = 0;
  let connectTimer = 0;
  let stopped = false;
  let last = 0;

  const getHass = () => {
    const ha = document.querySelector('home-assistant');
    return ha && ha.hass ? ha.hass : null;
  };

  // ---------------------------------------------------------------------
  // DOM host
  // ---------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = 'dashboard-holiday-popups-host';
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:900;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .it{position:fixed;left:0;top:0;pointer-events:none;will-change:transform;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    .it.drag{pointer-events:auto;touch-action:none;cursor:grab}
    .it img,.it .pic{display:block;pointer-events:none;-webkit-user-drag:none}
    .it img{filter:drop-shadow(0 6px 6px rgba(0,0,0,.35))}
    .lbl{position:absolute;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:14px;white-space:nowrap;
         font:700 20px "Comic Sans MS","Chalkboard SE","Marker Felt",sans-serif;box-shadow:0 3px 8px rgba(0,0,0,.4);pointer-events:none;max-width:90vw;overflow:hidden;text-overflow:ellipsis}
    .lbl.above{bottom:100%;margin-bottom:6px}
    .lbl.below{top:100%;margin-top:6px}
    .pop{transition:transform ${POPUP_SLIDE_MS}ms ease-out}
    .bn{position:absolute;padding:8px 16px;border-radius:18px;white-space:nowrap;font:700 22px "Comic Sans MS","Chalkboard SE","Marker Felt",sans-serif;
        box-shadow:0 4px 10px rgba(0,0,0,.45);pointer-events:none;max-width:min(80vw,460px);overflow:hidden;text-overflow:ellipsis}
    .deco{position:fixed;pointer-events:none}
    .deco img{display:block;pointer-events:none;width:100%;height:auto}
  </style>`;
  const attachHost = () => { if (!host.isConnected && document.body) document.body.appendChild(host); };
  attachHost();

  // ---------------------------------------------------------------------
  // Images: fetch(url, {cache:'reload'}) -> blob URL, retry every 10 s
  // ---------------------------------------------------------------------
  function ensureImage(url) {
    if (!url) return null;
    let rec = images.get(url);
    if (rec) return rec;
    rec = { status: 'loading', blob: '', w: 0, h: 0, timer: 0 };
    images.set(url, rec);
    const attempt = async () => {
      if (stopped || images.get(url) !== rec) return;
      try {
        let r;
        if (url.startsWith(UPLOADS_PREFIX)) {
          // Your own pictures need a signed-in session: wait for Home Assistant's page, then fetch with its login.
          const hass = getHass();
          if (!hass || typeof hass.fetchWithAuth !== 'function') { rec.timer = setTimeout(attempt, WAIT_HASS_MS); return; }
          r = await hass.fetchWithAuth(url, { cache: 'reload' });
        } else {
          r = await fetch(url, { cache: 'reload' });
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = await r.blob();
        if (!b.type.startsWith('image')) throw new Error('not an image');
        const blobUrl = URL.createObjectURL(b);
        const probe = new Image();
        probe.src = blobUrl;
        await probe.decode();
        rec.blob = blobUrl; rec.w = probe.naturalWidth || 1; rec.h = probe.naturalHeight || 1;
        rec.status = 'ready';
        reconcile();
      } catch (err) {
        console.debug('[dashboard-holiday-popups] image not ready, retrying', url, err);
        rec.timer = setTimeout(attempt, RETRY_IMAGE_MS);
      }
    };
    attempt();
    return rec;
  }

  function pruneImages() {
    const wanted = new Set(config.items.map((i) => i.image_url).filter(Boolean));
    for (const [url, rec] of images) {
      if (!wanted.has(url)) {
        clearTimeout(rec.timer);
        if (rec.blob) URL.revokeObjectURL(rec.blob);
        images.delete(url);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Page rules
  // ---------------------------------------------------------------------
  function isExcludedPath(path) {
    const seg = path.split('/')[1] || '';
    return seg === 'config' || seg === 'developer-tools' || seg === 'profile' || seg === 'dashboard-holiday-popups';
  }

  function isDashboardPanel() {
    const hass = getHass();
    const seg = location.pathname.split('/')[1] || '';
    const panel = hass && hass.panels ? hass.panels[seg] : null;
    return !!panel && panel.component_name === 'lovelace';
  }

  function pageMatches(item) {
    const path = location.pathname;
    if (isExcludedPath(path)) return false;
    const list = item.dashboards.length ? item.dashboards : config.settings.default_dashboards;
    if (list.length) return list.some((p) => path.startsWith(p));
    return isDashboardPanel();
  }

  const effectiveZ = (item) => (item.z_index || config.settings.z_index);
  const zFor = (item) => effectiveZ(item) * 1000 + (item.order % 1000);

  // ---------------------------------------------------------------------
  // Shared element builders
  // ---------------------------------------------------------------------
  function makeLabelEl(item, text) {
    const el = document.createElement('div');
    el.className = 'lbl ' + (item.label.position === 'below' ? 'below' : 'above');
    el.style.fontSize = item.label.font_size + 'px';
    el.style.color = item.label.color;
    el.style.background = item.label.background;
    el.textContent = text; // textContent only: never innerHTML for user text
    return el;
  }

  function makeImg(rec, heightPx) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = rec.blob;
    img.style.height = heightPx + 'px';
    img.style.width = (heightPx * rec.w / rec.h) + 'px';
    return img;
  }

  // ---------------------------------------------------------------------
  // Floater
  // ---------------------------------------------------------------------
  /** The drawn height of an item: its own size times the Scale setting (percent). */
  const sizeOf = (item, own) => (own || item.size_px) * ((config.settings.scale || 100) / 100);

  class Floater {
    constructor(item, rec, nameText) {
      this.item = item; this.rec = rec; this.nameText = nameText;
      this.H = sizeOf(item); this.W = this.H * rec.w / rec.h;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.t = Math.random() * 10;
      this.dir = 1; this.flip = false;
      this.state = 'moving'; this.awayUntil = 0;
      this.anchorOverride = null;
      this.el = document.createElement('div');
      this.el.className = 'it' + (item.drag_off.enabled ? ' drag' : '');
      this.el.style.width = this.W + 'px';
      this.el.style.height = this.H + 'px';
      this.el.style.zIndex = String(zFor(item));
      this.img = makeImg(rec, this.H);
      this.el.appendChild(this.img);
      if (item.label.enabled) {
        const text = fillTemplate(item.message_template, nameText || item.name);
        if (text) this.el.appendChild(makeLabelEl(item, text));
      }
      this.bindDrag();
      root.appendChild(this.el);
      this.enter(true);
    }

    destroy() { this.el.remove(); }

    get vw() { return window.innerWidth; }
    get vh() { return window.innerHeight; }

    enter(first) {
      const it = this.item, vw = this.vw, vh = this.vh;
      this.state = 'moving';
      this.el.style.display = 'block';
      if (it.path === 'bottom_straight' || it.path === 'top_straight' || it.path === 'curve_arc') {
        this.dir = it.direction === 'right_to_left' ? -1 : it.direction === 'left_to_right' ? 1 : (Math.random() < 0.5 ? 1 : -1);
        this.x = this.dir > 0 ? -this.W : vw;
        if (first) this.x = this.dir > 0 ? -this.W : vw;
        this.applyPathY();
      } else {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * it.speed; this.vy = Math.sin(angle) * it.speed;
        if (it.motion === 'drift') {
          const fromLeft = Math.random() < 0.5;
          this.x = fromLeft ? -this.W : vw;
          this.y = Math.random() * Math.max(1, vh - this.H);
          this.vx = (fromLeft ? 1 : -1) * Math.max(Math.abs(this.vx), it.speed * 0.4);
          this.inside = false;
        } else {
          this.anchorOverride = null;
        }
      }
      this.place();
    }

    applyPathY() {
      const it = this.item, vh = this.vh;
      if (it.path === 'bottom_straight') this.y = vh - this.H - FLOOR_GAP;
      else if (it.path === 'top_straight') this.y = FLOOR_GAP;
      else if (it.path === 'curve_arc') {
        const progress = (this.x + this.W) / (this.vw + this.W);
        const phase = 2 * Math.PI * it.peaks * progress;
        const centre = (vh - this.H) * 0.4;
        const amp = Math.min(it.amplitude_px, Math.max(0, centre));
        this.y = Math.max(0, Math.min(vh - this.H, centre + amp * waveValue(it.wave_shape, phase)));
      }
    }

    update(dt, now) {
      if (this.state === 'dragging') return;
      if (this.state === 'away') {
        if (now >= this.awayUntil) this.enter(false);
        return;
      }
      const it = this.item, vw = this.vw, vh = this.vh;
      this.t += dt;
      if (it.path === 'bottom_straight' || it.path === 'top_straight' || it.path === 'curve_arc') {
        this.x += this.dir * it.speed * dt;
        if (this.dir > 0 && this.x > vw) this.turnOrWrap(1, vw);
        else if (this.dir < 0 && this.x < -this.W) this.turnOrWrap(-1, vw);
        this.applyPathY();
        this.flip = this.dir < 0;
      } else if (it.motion === 'drift') {
        this.x += this.vx * dt; this.y += this.vy * dt;
        const maxX = vw - this.W, maxY = vh - this.H;
        if (!this.inside && this.x >= 0 && this.x <= maxX) this.inside = true; // a fresh entry crosses the edge first
        if (this.inside) {
          if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
          if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx); }
        }
        if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }
        if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy); }
        this.flip = this.vx < 0;
      } else {
        const [ax, ay] = this.anchorOverride || anchorPoint(it.anchor, vw, vh, this.W, this.H, 20);
        const phase = (2 * Math.PI * this.t) / it.period_seconds;
        const amp = it.amplitude_px;
        if (it.motion === 'bob_vertical') { this.x = ax; this.y = ay + amp * Math.sin(phase); }
        else if (it.motion === 'sway_horizontal') {
          this.x = ax + amp * Math.sin(phase); this.y = ay; this.flip = Math.cos(phase) < 0;
        } else { // circle
          this.x = ax + amp * Math.cos(phase); this.y = ay + amp * Math.sin(phase); this.flip = -Math.sin(phase) < 0;
        }
        this.x = Math.max(-amp - this.W, Math.min(vw - this.W + amp, this.x));
        this.y = Math.max(0, Math.min(vh - this.H, this.y));
      }
      this.place();
    }

    turnOrWrap(side, vw) {
      const dirs = this.item.direction;
      if (dirs === 'both') { this.dir = -side; this.x = side > 0 ? vw : -this.W; }
      else { this.x = side > 0 ? -this.W : vw; }
    }

    place() {
      this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
      const flipped = this.flip ? 'scaleX(-1)' : '';
      if (this._flipApplied !== flipped) { this.img.style.transform = flipped; this._flipApplied = flipped; }
    }

    bindDrag() {
      if (!this.item.drag_off.enabled) return;
      let offX = 0, offY = 0;
      this.el.addEventListener('pointerdown', (e) => {
        if (this.state !== 'moving') return;
        e.preventDefault();
        this.el.setPointerCapture(e.pointerId);
        this.state = 'dragging';
        offX = e.clientX - this.x; offY = e.clientY - this.y;
        this.el.style.cursor = 'grabbing';
      });
      this.el.addEventListener('pointermove', (e) => {
        if (this.state !== 'dragging') return;
        this.x = e.clientX - offX; this.y = e.clientY - offY;
        this.place();
      });
      const release = () => {
        if (this.state !== 'dragging') return;
        this.el.style.cursor = 'grab';
        const cx = this.x + this.W / 2, cy = this.y + this.H / 2;
        const off = cx < EDGE_MARGIN || cx > this.vw - EDGE_MARGIN || cy < EDGE_MARGIN || cy > this.vh - EDGE_MARGIN;
        if (off) {
          this.state = 'away';
          this.el.style.display = 'none';
          // Delay: come back after the chosen time. Turn off: ask the server (Infinity until it answers).
          const seconds = pushedAway(this.item, (s) => { this.awayUntil = performance.now() + s * 1000; });
          this.awayUntil = performance.now() + seconds * 1000;
          return;
        }
        this.state = 'moving';
        if (this.item.path === 'free_float' && this.item.motion !== 'drift') this.anchorOverride = [this.x, this.y];
        this.applyPathY();
        this.place();
      };
      this.el.addEventListener('pointerup', release);
      this.el.addEventListener('pointercancel', release);
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    hideFor(seconds, now) {
      this.state = 'away';
      this.awayUntil = now + seconds * 1000;
      this.el.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------
  // Popup (one showing at a time per item)
  // ---------------------------------------------------------------------
  const activePopups = [];   // { rect, key }

  class PopupShow {
    constructor(item, rec, edge, frac, text, durationMs) {
      this.item = item; this.edge = edge; this.rec = rec;
      this.durationMs = durationMs;
      const size = sizeOf(item), iw = size * rec.w / rec.h, ih = size;
      const rotate = item.rotate_for_edge;
      // The picture is drawn for one edge (bottom unless the popup says otherwise); turn it from there to this edge.
      const ANGLE = { bottom: 0, left: 90, top: 180, right: 270 };
      let deg = rotate ? (ANGLE[edge] - ANGLE[item.drawn_for || 'bottom'] + 360) % 360 : 0;
      if (deg > 180) deg -= 360;
      // Left and right pictures stay upright: mirror them instead of turning them upside down.
      const drawn = item.drawn_for || 'bottom';
      const mirror = rotate && deg === 180 && (edge === 'left' || edge === 'right') && (drawn === 'left' || drawn === 'right');
      if (mirror) deg = 0;
      const sideways = Math.abs(deg) === 90;
      const bw = sideways ? ih : iw, bh = sideways ? iw : ih;
      this.bw = bw; this.bh = bh;
      const vw = window.innerWidth, vh = window.innerHeight;
      if (edge === 'bottom') { this.x = (vw - bw) * frac; this.y = vh - bh; }
      else if (edge === 'top') { this.x = (vw - bw) * frac; this.y = 0; }
      else if (edge === 'left') { this.x = 0; this.y = (vh - bh) * frac; }
      else { this.x = vw - bw; this.y = (vh - bh) * frac; }
      this.el = document.createElement('div');
      this.el.className = 'it pop' + (item.drag_off && item.drag_off.enabled ? ' drag' : '');
      this.onPush = null;
      this.dragging = false;
      this.lastNow = 0;
      this.el.style.width = bw + 'px'; this.el.style.height = bh + 'px';
      this.el.style.zIndex = String(zFor(item));
      const pic = document.createElement('div');
      pic.className = 'pic';
      pic.style.cssText = `position:absolute;width:${iw}px;height:${ih}px;left:${(bw - iw) / 2}px;top:${(bh - ih) / 2}px;`;
      if (mirror) pic.style.transform = 'scaleX(-1)';
      else if (deg) pic.style.transform = `rotate(${deg}deg)`;
      pic.appendChild(makeImg(rec, ih));
      this.el.appendChild(pic);
      if (text) this.addBanner(text);
      this.hiddenTransform = this.outsideTransform();
      this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0) ${this.hiddenTransform}`;
      this.phase = 'in';
      this.until = 0;
      this.bindDrag();
    }

    /** Push the popup back toward the edge it came from; far enough and it counts as pushed aside. */
    bindDrag() {
      if (!this.item.drag_off || !this.item.drag_off.enabled) return;
      let sx = 0, sy = 0, moved = 0;
      const vertical = this.edge === 'top' || this.edge === 'bottom';
      const length = vertical ? this.bh : this.bw;
      const outward = (dx, dy) => {
        const v = this.edge === 'bottom' ? dy : this.edge === 'top' ? -dy : this.edge === 'left' ? -dx : dx;
        return Math.max(0, Math.min(v, length + 20));
      };
      const shift = () => {
        const sign = this.edge === 'bottom' || this.edge === 'right' ? 1 : -1;
        return vertical ? `translate3d(${this.x}px,${this.y + sign * moved}px,0)` : `translate3d(${this.x + sign * moved}px,${this.y}px,0)`;
      };
      this.el.addEventListener('pointerdown', (e) => {
        if (this.phase !== 'visible' || this.dragging) return;
        e.preventDefault();
        this.el.setPointerCapture(e.pointerId);
        this.dragging = true;
        sx = e.clientX; sy = e.clientY; moved = 0;
        this.el.style.transition = 'none';
      });
      this.el.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        moved = outward(e.clientX - sx, e.clientY - sy);
        this.el.style.transform = shift();
      });
      const release = () => {
        if (!this.dragging) return;
        this.dragging = false;
        void this.el.offsetWidth; // the drag position is the starting point of the slide
        this.el.style.transition = '';
        if (moved >= length * 0.4) {
          this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0) ${this.hiddenTransform}`;
          this.phase = 'out';
          this.until = performance.now() + POPUP_SLIDE_MS + 50;
          if (this.onPush) this.onPush();
        } else {
          this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
        }
      };
      this.el.addEventListener('pointerup', release);
      this.el.addEventListener('pointercancel', release);
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    outsideTransform() {
      const e = this.edge;
      return e === 'bottom' ? `translateY(${this.bh + 20}px)` : e === 'top' ? `translateY(${-this.bh - 20}px)`
        : e === 'left' ? `translateX(${-this.bw - 20}px)` : `translateX(${this.bw + 20}px)`;
    }

    addBanner(text) {
      const it = this.item;
      const b = document.createElement('div');
      b.className = 'bn';
      b.textContent = text;
      b.style.fontSize = it.label.font_size + 'px';
      b.style.color = it.label.color; b.style.background = it.label.background;
      const e = this.edge;
      if (e === 'bottom') { b.style.bottom = 'calc(100% + 6px)'; b.style.left = '50%'; b.style.transform = 'translateX(-50%)'; }
      else if (e === 'top') { b.style.top = 'calc(100% + 6px)'; b.style.left = '50%'; b.style.transform = 'translateX(-50%)'; }
      else if (e === 'left') { b.style.left = 'calc(100% + 6px)'; b.style.top = '50%'; b.style.transform = 'translateY(-50%)'; }
      else { b.style.right = 'calc(100% + 6px)'; b.style.top = '50%'; b.style.transform = 'translateY(-50%)'; }
      this.banner = b;
      this.el.appendChild(b);
    }

    keepBannerOnScreen() {
      if (!this.banner || (this.edge !== 'bottom' && this.edge !== 'top')) return;
      const w = this.banner.offsetWidth, vw = window.innerWidth;
      const centre = this.x + this.bw / 2;
      let shift = 0;
      if (centre - w / 2 < 8) shift = 8 - (centre - w / 2);
      else if (centre + w / 2 > vw - 8) shift = vw - 8 - (centre + w / 2);
      if (shift) this.banner.style.transform = `translateX(calc(-50% + ${shift}px))`;
    }

    start(now) {
      root.appendChild(this.el);
      this.keepBannerOnScreen();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
      }));
      this.phase = 'visible';
      this.until = now + POPUP_SLIDE_MS + this.durationMs;
    }

    update(now) {
      if (this.dragging) { // the countdown waits while a finger is on it
        if (this.lastNow) this.until += now - this.lastNow;
        this.lastNow = now;
        return true;
      }
      this.lastNow = 0;
      if (this.phase === 'visible' && now >= this.until) {
        this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0) ${this.hiddenTransform}`;
        this.phase = 'out';
        this.until = now + POPUP_SLIDE_MS + 50;
      } else if (this.phase === 'out' && now >= this.until) {
        this.phase = 'done';
      }
      return this.phase !== 'done';
    }

    occupied() {
      const pad = this.banner ? (this.edge === 'left' || this.edge === 'right' ? 280 : 80) : 0;
      let { x, y, bw: w, bh: h } = this;
      if (pad) {
        if (this.edge === 'bottom') { y -= pad; h += pad; }
        else if (this.edge === 'top') { h += pad; }
        else if (this.edge === 'left') { w += pad; }
        else { x -= pad; w += pad; }
      }
      return { x, y, w, h };
    }

    destroy() { this.el.remove(); }
  }

  // ---------------------------------------------------------------------
  // Decoration
  // ---------------------------------------------------------------------
  class Decoration {
    constructor(item, rec) {
      this.item = item;
      this.els = (item.placements || []).map((pl) => this.place(item, rec, pl));
    }

    /** One copy of the picture, in one corner or edge position. */
    place(item, rec, pl) {
      const el = document.createElement('div');
      el.className = 'deco';
      el.style.zIndex = String(zFor(item));
      el.style.opacity = String(item.opacity);
      const a = pl.anchor, ox = pl.offset_px.x, oy = pl.offset_px.y;
      const top = a.startsWith('top'), bottom = a.startsWith('bottom');
      const left = a.endsWith('left') || a === 'left', right = a.endsWith('right') || a === 'right';
      const flipX = pl.flip && right, flipY = pl.flip && bottom;
      el.style.width = sizeOf(item, pl.size_px) + 'px';
      if (top) el.style.top = oy + 'px'; else if (bottom) el.style.bottom = oy + 'px'; else el.style.top = `calc(50% + ${oy}px)`;
      if (left) el.style.left = ox + 'px'; else if (right) el.style.right = ox + 'px'; else el.style.left = `calc(50% + ${ox}px)`;
      const tx = (!left && !right) ? '-50%' : '0', ty = (!top && !bottom) ? '-50%' : '0';
      const parts = [];
      if (tx !== '0' || ty !== '0') parts.push(`translate(${tx},${ty})`);
      if (flipX) parts.push('scaleX(-1)');
      if (flipY) parts.push('scaleY(-1)');
      if (parts.length) el.style.transform = parts.join(' ');
      const img = document.createElement('img');
      img.alt = ''; img.src = rec.blob; img.draggable = false;
      el.appendChild(img);
      root.appendChild(el);
      return el;
    }

    destroy() { for (const el of this.els) el.remove(); }
  }

  // ---------------------------------------------------------------------
  // Reconcile: decide what should exist right now (about once a second)
  // ---------------------------------------------------------------------
  // What an item looks like and how it moves. On/off, Run now and triggers only decide whether it is shown,
  // so changing them never restarts a character that is already walking.
  const SIG_SKIP = new Set(['enabled', 'running', 'muted', 'triggers', 'order']);
  // The Scale setting is part of the signature, so changing it redraws everything at the new size.
  const itemSig = (item) => JSON.stringify([config.settings.scale || 100, Object.fromEntries(Object.entries(item).filter(([k]) => !SIG_SKIP.has(k)))]);

  function reconcile() {
    if (stopped) return;
    attachHost();
    const now = new Date();
    const nowMs = performance.now(); // timers and hide-all use this clock; dates (triggers) use `now`
    const hass = getHass();
    const states = hass ? hass.states : null;
    const s = config.settings;
    const cap = s.max_simultaneous;
    const smallScreen = hiddenOnSmallScreen();

    const sorted = [...config.items].sort((a, b) => a.order - b.order);
    let maxZ = s.z_index;
    // While a scene is on, it decides for its items. When none of an item's scenes is on, the item is an ordinary
    // item again: its own switch and dates decide.
    const sceneOn = new Set();      // an item with at least one of its scenes on
    const sceneShows = new Map();   // item id -> the banner name of a scene on for it that has not been pushed away
    const itemById = new Map(config.items.map((i) => [i.id, i]));
    for (const sc of config.scenes || []) {
      const token = sceneNow(sc, now);
      if (!token) continue;
      for (const id of sc.item_ids) {
        sceneOn.add(id);
        // Pushed away with "turn off": muted in this scene until this occurrence of it is over.
        const it = itemById.get(id);
        const mutedHere = !!(it && it.muted && it.muted[sc.id] === token);
        if (!mutedHere && !sceneShows.has(id)) sceneShows.set(id, sc.banner_name || '');
      }
    }
    const want = new Set();
    let floaters = 0;

    for (const item of sorted) {
      maxZ = Math.max(maxZ, effectiveZ(item));
      const rec = item.image_url ? ensureImage(item.image_url) : null;
      const ready = rec && rec.status === 'ready';
      const trig = itemTriggerState(item, now, states, manual);
      const popupHasWork = item.kind === 'popup' && runners.get(item.id) && runners.get(item.id).show;
      const scened = sceneOn.has(item.id);
      const trigName = scened ? (sceneShows.get(item.id) || '') : trig.name;
      const active = !!item.running || (scened ? sceneShows.has(item.id) : item.enabled && trig.active);
      const motionBlocked = item.kind !== 'decoration' && s.respect_reduced_motion !== false && reducedMotion()
        && !item.running && !(manual.get(item.id) > Date.now());
      const live = !motionBlocked && !smallScreen && s.enabled && ready && pageMatches(item) && (active || popupHasWork);
      if (item.kind === 'popup') {
        updatePopupSchedule(item, live && active, trigName, nowMs);
      }
      if (!live) continue;
      if (item.kind === 'floater') {
        if (nowMs < hiddenAllUntil) continue;
        if (floaters >= cap) { console.debug('[dashboard-holiday-popups] cap reached, not showing', item.name); continue; }
        floaters++;
      }
      want.add(item.id);
      const sig = itemSig(item) + '|' + (item.kind === 'floater' ? trigName : '');
      let runner = runners.get(item.id);
      if (runner && runner.sig !== sig) {
        if (runner.obj) runner.obj.destroy();
        runners.delete(item.id);
        runner = null;
      }
      if (!runner && item.kind !== 'popup') {
        const obj = item.kind === 'floater' ? new Floater(item, rec, trigName) : new Decoration(item, rec);
        runners.set(item.id, { sig, obj, kind: item.kind });
      } else if (!runner && item.kind === 'popup') {
        runners.set(item.id, { sig, obj: null, kind: 'popup', show: null });
      }
    }

    for (const [id, runner] of [...runners]) {
      if (!want.has(id)) {
        if (runner.kind === 'popup') {
          if (!runner.show) runners.delete(id);
          continue;
        }
        if (runner.obj) runner.obj.destroy();
        runners.delete(id);
      }
    }
    host.style.zIndex = String(maxZ);
  }

  const DISMISS_WAIT_SECONDS = 10;
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** The occurrence a scene is on for right now: its start date, "run" for Run now, or "" when it is off. */
  function sceneNow(sc, now) {
    const res = sc.enabled ? recurrenceActive(sc.recurrence, now) : { active: false };
    if (res.active) return isoDay(res.start);
    return sc.running ? 'run' : '';
  }

  /** "Turn off" after a push: ask the server to switch the item off (any signed-in user may do this). */
  function requestDismiss(item) {
    const hass = getHass();
    if (!hass || !hass.connection || !hass.connection.sendMessagePromise) return Promise.reject(new Error('no connection'));
    const now = new Date();
    const occurrences = {};
    for (const sc of config.scenes || []) {
      if (!sc.item_ids.includes(item.id)) continue;
      const token = sceneNow(sc, now);
      if (token) occurrences[sc.id] = token;
    }
    return hass.connection.sendMessagePromise({ type: `${DOMAIN}/dismiss_item`, item_id: item.id, occurrences });
  }

  /** What happens when something is pushed aside: wait and return, or ask the server to turn it off. */
  function pushedAway(item, comeBack) {
    const action = item.drag_off && item.drag_off.action === 'off' ? 'off' : 'delay';
    const seconds = (item.drag_off && item.drag_off.away_seconds) || 60;
    if (action === 'off') {
      // The server's update normally removes the item within a moment. If that update never arrives,
      // it does not stay hidden forever: it comes back after a few seconds.
      requestDismiss(item).then(() => comeBack(DISMISS_WAIT_SECONDS)).catch((err) => {
        console.debug('[dashboard-holiday-popups] could not turn it off, using the delay instead', err);
        comeBack(seconds);
      });
      return Infinity;
    }
    return seconds;
  }

  function popupDelayMs(item) {
    const f = item.frequency;
    return f.value * (f.unit === 'minutes' ? 60000 : 1000);
  }

  function updatePopupSchedule(item, active, name, nowMs) {
    let ps = popupState.get(item.id);
    const sig = itemSig(item);
    if (!ps || ps.sig !== sig) {
      ps = { sig, nextFire: nowMs + popupDelayMs(item), wasActive: false, wasRunning: false, name: '' };
      popupState.set(item.id, ps);
    }
    ps.name = name;
    const running = !!item.running;
    if (active && !ps.wasActive) {
      ps.awayUntil = 0;
      ps.nextFire = item.repeat_mode === 'once' || running ? nowMs : nowMs + popupDelayMs(item);
    } else if (active && running && !ps.wasRunning) {
      ps.nextFire = nowMs; // Run now on a popup that is already live: show it right away
    }
    ps.wasActive = active;
    ps.wasRunning = running;
    ps.active = active;
  }

  function popupMessage(item, name) {
    const ov = messageOverride.get(item.id);
    const tpl = ov && ov.text ? ov.text : (item.banner.enabled ? (item.banner.text_template || item.message_template) : '');
    return tpl ? fillTemplate(tpl, name || item.name) : '';
  }

  function tryShowPopup(item, ps, nowMs, force) {
    const runner = runners.get(item.id);
    if (!runner || runner.show) return false;
    const rec = ensureImage(item.image_url);
    if (!rec || rec.status !== 'ready') return false;
    const shownCount = activePopups.length;
    if (shownCount >= config.settings.max_simultaneous) return false;
    const edges = item.anchor === 'random' ? item.allowed_edges
      : item.anchor === 'left_right' ? ['left', 'right']
      : item.anchor === 'top_bottom' ? ['top', 'bottom'] : [item.anchor];
    const pos = item.position_along_edge;
    const fracOf = () => (pos === 'center' ? 0.5 : pos === 'random' ? Math.random() : Math.max(0, Math.min(1, Number(pos) / 100)));
    const ov = messageOverride.get(item.id);
    const text = popupMessage(item, ps ? ps.name : '');
    const durationMs = ((ov && ov.duration) || item.duration_seconds) * 1000;
    for (let attempt = 0; attempt < 14; attempt++) {
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const show = new PopupShow(item, rec, edge, fracOf(), text, durationMs);
      const rect = show.occupied();
      if (activePopups.some((o) => rectsOverlap(rect, o.rect, POPUP_GAP))) { continue; }
      show.onPush = () => {
        const state = ps || popupState.get(item.id);
        const seconds = pushedAway(item, (sec) => { if (state) { state.awayUntil = performance.now() + sec * 1000; state.nextFire = state.awayUntil; } });
        if (state) state.awayUntil = performance.now() + seconds * 1000;
      };
      show.start(nowMs);
      runner.show = show;
      activePopups.push({ rect, key: item.id });
      messageOverride.delete(item.id);
      return true;
    }
    return false; // nothing free right now: try again shortly
  }

  // ---------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------
  function tick(t) {
    if (stopped) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    for (const runner of runners.values()) {
      if (runner.kind === 'floater') runner.obj.update(dt, t);
      else if (runner.kind === 'popup') {
        if (runner.show && !runner.show.update(t)) {
          runner.show.destroy();
          const idx = activePopups.findIndex((o) => o.key === runner.show.item.id);
          if (idx >= 0) activePopups.splice(idx, 1);
          const ps = popupState.get(runner.show.item.id);
          if (ps) ps.nextFire = Math.max(performance.now() + popupDelayMs(runner.show.item), ps.awayUntil || 0);
          runner.show = null;
        }
      }
    }
    // popup timers (checked every frame; cheap)
    const wallNow = performance.now();
    for (const item of config.items) {
      if (item.kind !== 'popup') continue;
      const ps = popupState.get(item.id);
      const runner = runners.get(item.id);
      if (!ps || !runner || runner.show) continue;
      const forced = manual.get(item.id) > Date.now();
      if (forced) {
        if (tryShowPopup(item, ps, t, true)) manual.delete(item.id);
        continue;
      }
      if (!ps.active || wallNow < hiddenAllUntil) continue;
      if (performance.now() >= ps.nextFire) {
        if (tryShowPopup(item, ps, t, false)) {
          if (item.repeat_mode === 'once' && !item.running) ps.nextFire = Infinity;
        } else {
          ps.nextFire = performance.now() + 4000; // crowded or busy: retry in a few seconds
        }
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (!document.hidden) reconcile();
  });

  // ---------------------------------------------------------------------
  // Configuration and commands from the backend
  // ---------------------------------------------------------------------
  function applyConfig(cfg) {
    config = { ...cfg, scenes: cfg.scenes || [] };
    for (const [id, runner] of [...runners]) {
      if (!cfg.items.some((i) => i.id === id)) {
        if (runner.obj) runner.obj.destroy();
        if (runner.show) { runner.show.destroy(); const k = activePopups.findIndex((o) => o.key === id); if (k >= 0) activePopups.splice(k, 1); }
        runners.delete(id);
        popupState.delete(id);
      }
    }
    pruneImages();
    reconcile();
  }

  function handleCommand(msg) {
    if (msg.command === 'show') {
      const item = config.items.find((i) => i.id === msg.item_id);
      if (!item) return;
      if (msg.message || msg.duration) messageOverride.set(item.id, { text: msg.message || '', duration: msg.duration || 0 });
      manual.set(item.id, Date.now() + 60000); // visible (even if its triggers are not) until shown
      if (item.kind !== 'popup') setTimeout(() => manual.delete(item.id), (msg.duration || 20) * 1000);
      hiddenAllUntil = 0;
      showNow(item);
    } else if (msg.command === 'hide_all') {
      hiddenAllUntil = performance.now() + 60000;
      for (const runner of runners.values()) {
        if (runner.show) runner.show.until = 0;
        if (runner.kind === 'floater') runner.obj.hideFor(60, performance.now());
      }
      manual.clear();
      reconcile();
    }
  }

  // The show_popup service must show the item even when its triggers or page rules are not met.
  function showNow(item) {
    if (hiddenOnSmallScreen()) return;
    const rec = ensureImage(item.image_url);
    if (!rec || rec.status !== 'ready') return;
    if (item.kind === 'popup') {
      const runner = runners.get(item.id) || { sig: itemSig(item), obj: null, kind: 'popup', show: null };
      runners.set(item.id, runner);
      let ps = popupState.get(item.id);
      if (!ps) { ps = { sig: itemSig(item), nextFire: Infinity, wasActive: false, name: '', active: false }; popupState.set(item.id, ps); }
      tryShowPopup(item, ps, performance.now(), true);
      manual.delete(item.id);
    } else {
      const old = runners.get(item.id);
      if (old && old.obj) old.obj.destroy();
      const obj = item.kind === 'floater' ? new Floater(item, rec, '') : new Decoration(item, rec);
      runners.set(item.id, { sig: itemSig(item) + '|test', obj, kind: item.kind });
      setTimeout(() => { const r = runners.get(item.id); if (r && r.obj === obj) { obj.destroy(); runners.delete(item.id); } }, 20000);
    }
  }

  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'config') applyConfig(msg.config);
    else if (msg.type === 'command') handleCommand(msg);
    else if (msg.type === 'shutdown') shutdown();
  }

  async function connect(delay) {
    if (stopped) return;
    const hass = getHass();
    if (!hass || !hass.connection) {
      const next = Math.min((delay || 500) * 2, 10000);
      connectTimer = setTimeout(() => connect(next), delay || 500);
      return;
    }
    try {
      unsub = await hass.connection.subscribeMessage(onMessage, { type: `${DOMAIN}/subscribe_config` });
    } catch (err) {
      console.debug('[dashboard-holiday-popups] not available yet, retrying', err);
      connectTimer = setTimeout(() => connect(10000), 10000);
    }
  }

  function shutdown() {
    stopped = true;
    cancelAnimationFrame(rafId);
    clearInterval(reconcileTimer);
    clearTimeout(connectTimer);
    if (unsub) { try { unsub(); } catch { /* connection already closed */ } unsub = null; }
    for (const runner of runners.values()) { if (runner.obj) runner.obj.destroy(); if (runner.show) runner.show.destroy(); }
    runners.clear();
    for (const rec of images.values()) { clearTimeout(rec.timer); if (rec.blob) URL.revokeObjectURL(rec.blob); }
    images.clear();
    host.remove();
    delete window.__dhpRuntime;
  }

  reconcileTimer = setInterval(reconcile, 1000);
  rafId = requestAnimationFrame((t) => { last = t; tick(t); });
  connect(500);
  console.info(`%cDashboard Holiday Popups runtime v${VERSION}`, 'color:#63b3ed;font-weight:bold');
})();
