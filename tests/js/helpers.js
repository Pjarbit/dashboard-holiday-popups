const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RUNTIME = path.join(__dirname, '../../custom_components/dashboard_holiday_popups/frontend/dashboard-holiday-popups.js');

const opened = [];
function closeAll() { while (opened.length) { try { opened.pop().close(); } catch { /* already closed */ } } }

function makeWindow(url = 'http://ha.local/dashboard-2column/home', { reduce } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  opened.push(w);
  w.__DHP_TEST__ = true;
  if (reduce !== undefined) w.matchMedia = () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} });
  w.URL.createObjectURL = () => 'blob:fake';
  w.URL.revokeObjectURL = () => {};
  w.Image = class { set src(v) { this._s = v; } decode() { return Promise.resolve(); } get naturalWidth() { return 200; } get naturalHeight() { return 100; } };
  w.fetch = async () => ({ ok: true, blob: async () => ({ type: 'image/webp' }) });
  w.innerWidth = 1280; w.innerHeight = 800;
  return w;
}

function loadRuntime(w) { w.eval(fs.readFileSync(RUNTIME, 'utf8')); return w; }

function fakeHass(w, { states = {}, panels = { 'dashboard-2column': { component_name: 'lovelace' } }, failSend = false } = {}) {
  const ha = w.document.createElement('home-assistant');
  const subs = [];
  const sent = []; // messages the runtime sent with sendMessagePromise (such as dismiss_item)
  ha.hass = {
    states, panels,
    connection: {
      subscribeMessage: async (cb, msg) => { subs.push({ cb, msg }); return () => {}; },
      sendMessagePromise: async (msg) => { sent.push(msg); if (failSend) throw new Error('offline'); return {}; },
    },
  };
  w.document.body.appendChild(ha);
  return { ha, subs, sent };
}

const item = (over = {}) => ({
  id: 'i1', order: 1, kind: 'floater', name: 'Test', enabled: true, running: false, image: { file: 'a.webp', builtin: false }, image_url: '/x/a.webp',
  size_px: 100, dashboards: [], z_index: null, triggers: [], message_template: '',
  label: { enabled: false, position: 'above', font_size: 20, color: '#111', background: '#fff' },
  path: 'bottom_straight', speed: 80, direction: 'both', drag_off: { enabled: true, action: 'delay', away_seconds: 60 }, muted: {},
  motion: 'drift', wave_shape: 'sine', amplitude_px: 60, period_seconds: 4, peaks: 2, anchor: 'center',
  ...over,
});

const config = (items, settings = {}, scenes = []) => ({
  type: 'config',
  config: { settings: { enabled: true, max_simultaneous: 3, z_index: 900, default_dashboards: [], respect_reduced_motion: true, ...settings }, items, scenes },
});

/** A complete repeat rule, as the server stores it. */
const rule = (over = {}) => ({
  start: '2026-01-01', length_days: 1, repeat: 'none', interval: 1, weekdays: [], by: 'day', day: 1, nth: 1,
  weekday: 0, month: 1, ends: 'never', until: '', count: 1, ...over,
});
const isoToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const scene = (over = {}) => ({ id: 's1', order: 1, name: 'Scene', enabled: true, running: false, recurrence: rule({ start: isoToday() }), item_ids: [], ...over });

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

module.exports = { closeAll, makeWindow, loadRuntime, fakeHass, item, config, rule, isoToday, scene, tick };
