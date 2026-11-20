const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { closeAll } = require('./helpers');

const PKG = path.join(__dirname, '../../custom_components/dashboard_holiday_popups');
const PANEL = path.join(PKG, 'panel.js');
const RUNTIME = path.join(PKG, 'frontend/dashboard-holiday-popups.js');

const rule = (over = {}) => ({
  start: '2000-10-15', length_days: 17, repeat: 'yearly', interval: 1, weekdays: [0], by: 'day', day: 15, nth: 3,
  weekday: 0, month: 10, ends: 'never', until: '', count: 1, ...over,
});
const HALLOWEEN = rule();
const CHRISTMAS = rule({ start: '2000-12-20', length_days: 5, day: 20, month: 12, weekday: 3, nth: 3 });

const base = (over = {}) => ({
  id: 'i1', order: 1, kind: 'floater', name: 'Witch', enabled: true, running: false, image: { file: 'a.webp', builtin: false }, image_url: '/x/a.webp',
  size_px: 100, dashboards: [], z_index: null, message_template: '',
  label: { enabled: false, position: 'above', font_size: 20, color: '#111111', background: '#ffffff' },
  path: 'curve_arc', speed: 80, direction: 'both', drag_off: { enabled: true, action: 'delay', away_seconds: 60 },
  motion: 'drift', wave_shape: 'sine', amplitude_px: 60, period_seconds: 4, peaks: 2, anchor: 'center',
  triggers: [{ id: 't1', type: 'date', enabled: true, name: 'Halloween', recurrence: HALLOWEEN }],
  ...over,
});
const sensor = (over = {}) => base({
  id: 's1', order: 5, name: 'Rain umbrella',
  triggers: [{ id: 'w1', type: 'weather', enabled: true, name: '', entity_id: '', conditions: ['rainy'] }], ...over,
});
const scene = (over = {}) => ({ id: 'sc1', order: 1, name: 'Halloween', enabled: true, running: false, recurrence: HALLOWEEN, item_ids: [], ...over });

const settings = (over = {}) => ({ enabled: true, max_simultaneous: 3, z_index: 900, default_dashboards: [], respect_reduced_motion: true, ...over });

async function boot(items, panels = {}, scenes = [], settingsOver = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://ha.local/dashboard-holiday-popups', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(fs.readFileSync(PANEL, 'utf8'));
  const calls = [];
  let push;
  const el = w.document.createElement('dashboard-holiday-popups-panel');
  w.document.body.appendChild(el);
  w.confirm = () => true;
  const hass = {
    panels,
    connection: { subscribeMessage: async (cb) => { push = cb; return () => {}; } },
    callWS: async (msg) => {
      calls.push(msg);
      if (msg.type.endsWith('list_entities')) return { entities: [{ entity_id: 'weather.home', name: 'Home', domain: 'weather' }, { entity_id: 'sensor.washer', name: 'Washer', domain: 'sensor' }] };
      if (msg.type.endsWith('disable_all') || msg.type.endsWith('stop_all')) return { changed: 1 };
      return {};
    },
    fetchWithAuth: async () => ({ ok: true, json: async () => ({ file: 'up-12345678.gif', url: '/dashboard_holiday_popups_files/up-12345678.gif' }) }),
  };
  el.hass = hass;
  await new Promise((r) => setTimeout(r, 20));
  const send = (its, scs) => push({ type: 'config', config: { settings: settings(settingsOver), items: its, scenes: scs } });
  send(items, scenes);
  await new Promise((r) => setTimeout(r, 20));
  const sr = el.shadowRoot;
  const change = (node) => node.dispatchEvent(new w.Event('change', { bubbles: true }));
  const type = (node, value) => { node.value = value; node.dispatchEvent(new w.Event('input', { bubbles: true })); change(node); };
  const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
  const call = (suffix) => calls.find((c) => c.type.endsWith(suffix));
  return { w, el, hass, sr, calls, push, send, change, type, wait, call };
}

test('four screens; names are escaped; pause switch is shown', async () => {
  const { sr } = await boot([base({ name: '<img src=x onerror=alert(1)>' })]);
  assert.deepStrictEqual([...sr.querySelectorAll('.tab')].map((t) => t.dataset.tab), ['dated', 'scenes', 'sensors', 'settings']);
  assert.strictEqual(sr.querySelector('.name img'), null);
  assert.ok(sr.querySelector('.name').textContent.includes('<img'));
  assert.ok(sr.querySelector('input[data-act="toggle-item"]').checked);
});

test('Dated shows date and always-on items, Sensors shows weather and entity items', async () => {
  const always = base({ id: 'i2', order: 2, name: 'Lion', triggers: [] });
  const entity = base({ id: 's2', order: 6, name: 'Mail', triggers: [{ id: 'e1', type: 'entity', enabled: true, name: '', entity_id: 'sensor.mail', attribute: '', operator: 'equals', value: 'on' }] });
  const { sr } = await boot([base(), always, sensor(), entity]);
  const names = () => [...sr.querySelectorAll('.card.item .name')].map((n) => n.textContent.replace(/Running|In scene/g, '').trim());
  assert.deepStrictEqual(names(), ['Witch', 'Lion']);
  sr.querySelector('[data-tab="sensors"]').click();
  assert.deepStrictEqual(names(), ['Rain umbrella', 'Mail']);
});

test('an item card says when it shows, in words, and when it is next', async () => {
  const { sr } = await boot([base()]);
  const text = sr.querySelector('.card.item').textContent;
  assert.ok(text.includes('Every year on October 15, lasting 17 days'), text);
  assert.ok(/On now:|Next:/.test(text));
});

test('a sensor item without an entity is flagged', async () => {
  const { sr } = await boot([sensor()]);
  sr.querySelector('[data-tab="sensors"]').click();
  assert.ok(sr.querySelector('.card.item').textContent.includes('choose a weather entity'));
});

test('pause switch saves the item with enabled false', async () => {
  const { sr, change, wait, call } = await boot([base()]);
  const sw = sr.querySelector('input[data-act="toggle-item"]');
  sw.checked = false; change(sw);
  await wait();
  const save = call('save_item');
  assert.ok(save && save.item.enabled === false && save.item.id === 'i1');
});

test('Run now saves running, becomes Stop, and Stop all appears only while something runs', async () => {
  const { sr, send, wait, call, calls } = await boot([base()]);
  assert.strictEqual(sr.querySelector('[data-act="stop-all"]'), null);
  assert.strictEqual(sr.querySelector('[data-act="run"]').textContent, 'Run now');
  sr.querySelector('[data-act="run"]').click();
  await wait();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(call('run_item'))), { type: 'dashboard_holiday_popups/run_item', item_id: 'i1', running: true });
  send([base({ running: true })], []);
  await wait();
  assert.strictEqual(sr.querySelector('[data-act="run"]').textContent, 'Stop');
  assert.ok(sr.querySelector('.tag.run'));
  sr.querySelector('[data-act="run"]').click();
  await wait();
  assert.strictEqual(calls.filter((c) => c.type.endsWith('run_item')).pop().running, false);
  sr.querySelector('[data-act="stop-all"]').click();
  await wait();
  assert.ok(call('stop_all'));
});

test('Run now says so when the master switch is off', async () => {
  const { sr, wait } = await boot([base()], {}, [], { enabled: false });
  sr.querySelector('[data-act="run"]').click();
  await wait(30);
  assert.ok(sr.querySelector('.msg.err').textContent.includes('master switch'));
});

test('add character on the Dated screen: date trigger preset, name defaults, upload and save', async () => {
  const { sr, change, w, wait, call } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="floater"]').click();
  assert.ok(sr.querySelector('.modal'));
  assert.ok(sr.querySelector('.trig .mini').textContent === 'date');
  const name = sr.querySelector('[data-p="name"]');
  name.value = 'Santa sleigh'; name.dispatchEvent(new w.Event('input', { bubbles: true })); change(name);
  sr.querySelector('[data-act="save"]').click();
  await wait();
  assert.ok(sr.querySelector('.msg.err').textContent.includes('image'));
  const file = new w.File(['GIF89a'], 'up.gif', { type: 'image/gif' });
  const input = sr.getElementById('file');
  Object.defineProperty(input, 'files', { value: [file] });
  change(input);
  await wait(30);
  assert.ok(sr.querySelector('.mbody img[data-asrc*="up-12345678"]'));
  sr.querySelector('[data-act="save"]').click();
  await wait(20);
  const save = call('save_item');
  assert.strictEqual(save.item.name, 'Santa sleigh');
  assert.strictEqual(save.item.path, 'curve_arc');
  assert.strictEqual(save.item.image.file, 'up-12345678.gif');
  assert.strictEqual(save.item.triggers[0].type, 'date');
  assert.strictEqual(save.item.triggers[0].recurrence.repeat, 'yearly');
});

test('add on the Sensors screen starts with an entity trigger', async () => {
  const { sr } = await boot([]);
  sr.querySelector('[data-tab="sensors"]').click();
  sr.querySelector('[data-act="add"][data-kind="popup"]').click();
  assert.strictEqual(sr.querySelector('.trig .mini').textContent, 'entity');
});

test('a new decoration starts at the top right', async () => {
  const { sr } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="decoration"]').click();
  assert.ok(sr.querySelector('input[name="grid-placements.0.anchor"][value="top_right"]').checked);
});

test('trigger editor: weather picker lists only weather entities', async () => {
  const { sr } = await boot([base({ triggers: [] })]);
  sr.querySelector('[data-act="edit"]').click();
  sr.getElementById('newtrig').value = 'weather';
  sr.querySelector('[data-act="add-trigger"]').click();
  const options = [...sr.querySelectorAll('.trig select option')].map((o) => o.value);
  assert.ok(options.includes('weather.home') && !options.includes('sensor.washer'));
  sr.getElementById('newtrig').value = 'date';
  sr.querySelector('[data-act="add-trigger"]').click();
  assert.strictEqual(sr.querySelectorAll('.trig').length, 2);
});

// ---- the repeat picker -------------------------------------------------------------------------

const openRule = async (trigRule) => {
  const ctx = await boot([base({ triggers: [{ id: 't1', type: 'date', enabled: true, name: '', recurrence: trigRule }] })]);
  ctx.sr.querySelector('[data-act="edit"]').click();
  return ctx;
};
const field = (sr, key) => sr.querySelector(`[data-p="triggers.0.recurrence.${key}"]`);

test('picker: weekly shows weekday boxes and saves the chosen days', async () => {
  const { sr, change, wait, call } = await openRule(rule({ start: '2026-11-02', repeat: 'weekly', weekdays: [1], length_days: 1 }));
  assert.strictEqual(sr.querySelectorAll('[data-wd]').length, 7);
  for (const n of [3, 5]) { const box = sr.querySelector(`[data-wd="${n}"]`); box.checked = true; change(box); }
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('Mon, Wed, Fri'));
  sr.querySelector('[data-act="save"]').click();
  await wait();
  assert.deepStrictEqual([...call('save_item').item.triggers[0].recurrence.weekdays], [1, 3, 5]);
});

test('picker: Thanksgiving is "the 4th Thursday of November", saved as a weekday rule', async () => {
  const { sr, change, type, wait, call } = await openRule(rule({ start: '2026-11-26', repeat: 'yearly', month: 11, day: 26, weekday: 4, nth: 4, length_days: 1 }));
  const by = field(sr, 'by');
  by.value = 'weekday'; change(by);
  assert.ok(field(sr, 'nth') && field(sr, 'weekday') && !field(sr, 'day'));
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('Every year on the 4th Thursday of November'));
  type(field(sr, 'length_days'), '3');
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('lasting 3 days'));
  sr.querySelector('[data-act="save"]').click();
  await wait();
  const saved = call('save_item').item.triggers[0].recurrence;
  assert.deepStrictEqual([saved.by, saved.nth, saved.weekday, saved.month, saved.length_days], ['weekday', 4, 4, 11, 3]);
});

test('picker: monthly choices, last Friday, and ending after a number of times', async () => {
  const { sr, change } = await openRule(rule({ start: '2026-01-31', repeat: 'monthly', day: 31, length_days: 1 }));
  assert.ok(sr.querySelector('.hint') && sr.textContent.includes('Shorter months use their last day'));
  const by = field(sr, 'by'); by.value = 'weekday'; change(by);
  const nth = field(sr, 'nth'); nth.value = '-1'; change(nth);
  const wd = field(sr, 'weekday'); wd.value = '5'; change(wd);
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('Every month on the last Friday'));
  const ends = field(sr, 'ends'); ends.value = 'after'; change(ends);
  assert.ok(field(sr, 'count'));
  assert.ok(!field(sr, 'until'));
  const ends2 = field(sr, 'ends'); ends2.value = 'on'; change(ends2);
  assert.ok(field(sr, 'until') && !field(sr, 'count'));
});

test('picker: changing the start date moves the day, month and weekday with it', async () => {
  const { sr, type, wait, call } = await openRule(rule({ start: '2026-10-15', repeat: 'yearly' }));
  type(field(sr, 'start'), '2026-12-25');
  assert.strictEqual(field(sr, 'month').value, '12');
  assert.strictEqual(field(sr, 'day').value, '25');
  sr.querySelector('[data-act="save"]').click();
  await wait();
  const saved = call('save_item').item.triggers[0].recurrence;
  assert.deepStrictEqual([saved.start, saved.month, saved.day, saved.weekday, saved.nth], ['2026-12-25', 12, 25, 5, 4]);
});

test('picker: one-off dates hide the repeat controls', async () => {
  const { sr } = await openRule(rule({ start: '2026-12-20', repeat: 'none', length_days: 5 }));
  assert.ok(!field(sr, 'interval') && !field(sr, 'ends'));
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('Once, on'));
  assert.ok(sr.querySelector('[data-recsum]').textContent.includes('for 5 days'));
});

// ---- Pushing a character or popup aside ----------------------------------------------------------

test('character editor: choose delay or turn off; the seconds box only shows for delay', async () => {
  const { sr, change, wait, call } = await boot([base()]);
  sr.querySelector('[data-act="edit"]').click();
  const action = () => sr.querySelector('[data-p="drag_off.action"]');
  assert.strictEqual(action().value, 'delay');
  assert.ok(sr.querySelector('[data-p="drag_off.away_seconds"]'));
  action().value = 'off'; change(action());
  assert.strictEqual(sr.querySelector('[data-p="drag_off.away_seconds"]'), null);
  sr.querySelector('[data-act="save"]').click();
  await wait();
  assert.strictEqual(call('save_item').item.drag_off.action, 'off');
});

test('popup editor has the same push setting, switched off by default', async () => {
  const { sr, change, wait, call } = await boot([base({ id: 'p9', kind: 'popup', name: 'Mail', anchor: 'bottom', allowed_edges: ['bottom'], position_along_edge: 'center',
    frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat', banner: { enabled: false, text_template: '' }, drag_off: { enabled: false, action: 'delay', away_seconds: 60 } })]);
  sr.querySelector('[data-act="edit"]').click();
  const box = sr.querySelector('[data-p="drag_off.enabled"]');
  assert.strictEqual(box.checked, false);
  assert.strictEqual(sr.querySelector('[data-p="drag_off.action"]'), null);
  box.checked = true; change(box);
  const action = sr.querySelector('[data-p="drag_off.action"]');
  action.value = 'off'; change(action);
  sr.querySelector('[data-act="save"]').click();
  await wait();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(call('save_item').item.drag_off)), { enabled: true, action: 'off', away_seconds: 60 });
});

test('a new popup starts with pushing off, a new character with it on', async () => {
  const { sr } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="popup"]').click();
  assert.strictEqual(sr.querySelector('[data-p="drag_off.enabled"]').checked, false);
  sr.querySelector('[data-act="cancel"]').click();
  sr.querySelector('[data-act="add"][data-kind="floater"]').click();
  assert.strictEqual(sr.querySelector('[data-p="drag_off.enabled"]').checked, true);
});

// ---- Muted by a push -----------------------------------------------------------------------------

test('an item pushed away for the current scene run is tagged and can be brought back', async () => {
  const { sr, wait, call } = await boot([base()], {}, [scene({ item_ids: ['i1'] })]);
  assert.strictEqual(sr.querySelector('[data-act="unmute"]'), null);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const onNow = scene({ item_ids: ['i1'], recurrence: rule({ start: iso, repeat: 'none', length_days: 3 }) });
  const { sr: sr2, wait: wait2, call: call2 } = await boot([base({ muted: { sc1: iso } })], {}, [onNow]);
  assert.ok(sr2.querySelector('.card.item').textContent.includes('Pushed away for now'));
  sr2.querySelector('[data-act="unmute"]').click();
  await wait2();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(call2('unmute_item'))), { type: 'dashboard_holiday_popups/unmute_item', item_id: 'i1' });
  void wait; void call;
});

test('an old mute is not shown', async () => {
  const { sr } = await boot([base({ muted: { sc1: '2020-10-15' } })], {}, [scene({ item_ids: ['i1'] })]);
  assert.ok(!sr.querySelector('.card.item').textContent.includes('Pushed away'));
});

// ---- Turn all off ------------------------------------------------------------------------------

test('Turn all off lists only this screen\'s items, and there is no turn-all-on', async () => {
  const { sr, wait, call, calls } = await boot([base(), sensor()]);
  assert.strictEqual(sr.querySelector('[data-act="all-on"]'), null);
  sr.querySelector('[data-act="all-off"]').click();
  await wait();
  assert.deepStrictEqual([...call('disable_all').item_ids], ['i1']);
  sr.querySelector('[data-tab="sensors"]').click();
  sr.querySelector('[data-act="all-off"]').click();
  await wait();
  const last = calls.filter((c) => c.type.endsWith('disable_all')).pop();
  assert.deepStrictEqual([...last.item_ids], ['s1']);
});

test('Turn all off is hidden when nothing on the screen is on', async () => {
  const { sr } = await boot([base({ enabled: false })]);
  assert.strictEqual(sr.querySelector('[data-act="all-off"]'), null);
});

// ---- Scenes ------------------------------------------------------------------------------------

const sceneShop = () => [
  base({ id: 'i1', name: 'Witch' }),
  base({ id: 'i2', order: 2, name: 'Cobweb', kind: 'decoration' }),
  sensor(),
];

test('scene editor offers only dated items, grouped, and never sensor items', async () => {
  const { sr } = await boot(sceneShop());
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="add-scene"]').click();
  const ids = [...sr.querySelectorAll('[data-sitem]')].map((b) => b.dataset.sitem);
  assert.deepStrictEqual(ids.sort(), ['i1', 'i2']);
  assert.deepStrictEqual([...sr.querySelectorAll('.mbody .gh')].map((g) => g.textContent), ['Characters', 'Decorations']);
});

test('saving a scene sends its name, repeat rule and items', async () => {
  const { sr, change, type, wait, call } = await boot(sceneShop());
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="add-scene"]').click();
  type(sr.querySelector('[data-p="name"]'), 'Halloween');
  for (const id of ['i1', 'i2']) { const box = sr.querySelector(`[data-sitem="${id}"]`); box.checked = true; change(box); }
  sr.querySelector('[data-act="save-scene"]').click();
  await wait();
  const saved = call('save_scene').scene;
  assert.strictEqual(saved.name, 'Halloween');
  assert.deepStrictEqual([...saved.item_ids].sort(), ['i1', 'i2']);
  assert.ok(saved.recurrence && saved.recurrence.repeat === 'yearly');
});

test('a scene without a name is refused in the panel', async () => {
  const { sr, wait, call } = await boot(sceneShop());
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="add-scene"]').click();
  sr.querySelector('[data-act="save-scene"]').click();
  await wait();
  assert.ok(sr.querySelector('.msg.err').textContent.includes('name'));
  assert.strictEqual(call('save_scene'), undefined);
});

test('warns when a chosen item is already in another scene whose dates overlap', async () => {
  const other = scene({ id: 'sc1', name: 'Halloween house', item_ids: ['i1'] });
  const mine = scene({ id: 'sc2', order: 2, name: 'Halloween porch', item_ids: [] });
  const { sr, change } = await boot(sceneShop(), {}, [other, mine]);
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="edit-scene"][data-id="sc2"]').click();
  const row = () => sr.querySelector('[data-sitem="i1"]').closest('.pick');
  assert.ok(row().textContent.includes('Already in the scene “Halloween house”'));
  assert.ok(row().textContent.includes('dates overlap'));
  assert.strictEqual(sr.querySelector('.mbody > .card:last-child .warn:not(.pick .warn)'), null); // no summary until it is chosen
  const box = sr.querySelector('[data-sitem="i1"]'); box.checked = true; change(box);
  assert.ok(sr.querySelector('.mbody').textContent.includes('1 chosen item is already in another scene that runs on the same dates'));
});

test('items in a scene on different dates get a softer note, and the other scene is named', async () => {
  const other = scene({ id: 'sc1', name: 'Christmas', recurrence: CHRISTMAS, item_ids: ['i1'] });
  const mine = scene({ id: 'sc2', order: 2, name: 'Halloween', item_ids: ['i2'] });
  const { sr } = await boot(sceneShop(), {}, [other, mine]);
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="edit-scene"][data-id="sc2"]').click();
  const note = sr.querySelector('[data-sitem="i1"]').closest('.pick').textContent;
  assert.ok(note.includes('Already in the scene “Christmas” (on different dates)'));
  assert.ok(!note.includes('overlap'));
  assert.strictEqual(sr.querySelector('[data-sitem="i2"]').closest('.pick').querySelector('.warn'), null);
});

const TODAY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('an item in a scene that is on is tagged and its switch is locked', async () => {
  const { sr } = await boot(sceneShop(), {}, [scene({ item_ids: ['i1'], recurrence: rule({ start: TODAY(), repeat: 'none', length_days: 3 }) })]);
  const card = sr.querySelector('.card.item[data-id="i1"]');
  assert.ok(card.querySelector('.tag.sceneon').textContent.includes('On via scene: Halloween'));
  assert.ok(card.textContent.includes('Also shows when a scene is on: Halloween'));
  assert.ok(card.querySelector('input[type=checkbox]').disabled);
  assert.ok(!sr.querySelector('.card.item[data-id="i2"]').textContent.includes('scene'));
});

test('when its scene is off, the item is tagged differently and its own switch works', async () => {
  const off = scene({ item_ids: ['i1'], recurrence: rule({ start: '2020-01-01', repeat: 'none', length_days: 1 }) });
  const { sr } = await boot(sceneShop(), {}, [off]);
  const card = sr.querySelector('.card.item[data-id="i1"]');
  assert.ok(card.querySelector('.tag.scene').textContent.includes('In scene: Halloween'));
  assert.strictEqual(card.querySelector('.tag.sceneon'), null);
  assert.ok(!card.querySelector('input[type=checkbox]').disabled);
});

test('Duplicate opens an unsaved copy of an item and of a scene', async () => {
  const { sr, wait, call, change } = await boot(sceneShop(), {}, [scene({ item_ids: ['i1'] })]);
  sr.querySelector('.card.item[data-id="i1"] [data-act="dup"]').click();
  assert.strictEqual(sr.querySelector('input[data-p="name"]').value.endsWith(' copy'), true);
  assert.strictEqual(call('save_item'), undefined);
  sr.querySelector('[data-act="cancel"]').click();
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="dup-scene"]').click();
  assert.strictEqual(sr.querySelector('input[data-p="name"]').value, 'Halloween copy');
  const banner = sr.querySelector('input[data-p="banner_name"]');
  banner.value = 'Jim'; change(banner);
  sr.querySelector('[data-act="save-scene"]').click();
  await wait();
  const saved = call('save_scene').scene;
  assert.strictEqual(saved.id, undefined);
  assert.strictEqual(saved.banner_name, 'Jim');
  assert.deepStrictEqual([...saved.item_ids], ['i1']);
});

test('scene card: wording, run now, pause switch and delete', async () => {
  const { sr, send, wait, call, change } = await boot(sceneShop(), {}, [scene({ item_ids: ['i1', 'i2'] })]);
  sr.querySelector('[data-tab="scenes"]').click();
  const card = sr.querySelector('.card.item');
  assert.ok(card.textContent.includes('Every year on October 15, lasting 17 days'));
  assert.ok(card.textContent.includes('2 items'));
  card.querySelector('[data-act="run-scene"]').click();
  await wait();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(call('run_scene'))), { type: 'dashboard_holiday_popups/run_scene', scene_id: 'sc1', running: true });
  send(sceneShop(), [scene({ item_ids: ['i1', 'i2'], running: true })]);
  await wait();
  sr.querySelector('[data-tab="scenes"]').click();
  assert.strictEqual(sr.querySelector('[data-act="run-scene"]').textContent, 'Stop');
  const sw = sr.querySelector('input[data-act="toggle-scene"]');
  sw.checked = false; change(sw);
  await wait();
  assert.strictEqual(call('save_scene').scene.enabled, false);
  sr.querySelector('[data-act="delete-scene"]').click();
  await wait();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(call('delete_scene'))), { type: 'dashboard_holiday_popups/delete_scene', scene_id: 'sc1' });
});

test('a server refusal is shown in the scene editor', async () => {
  const ctx = await boot(sceneShop());
  ctx.hass.callWS = async (msg) => { if (msg.type.endsWith('save_scene')) throw new Error('Rain umbrella is triggered by a sensor or weather'); return {}; };
  const { sr, type, wait } = ctx;
  sr.querySelector('[data-tab="scenes"]').click();
  sr.querySelector('[data-act="add-scene"]').click();
  type(sr.querySelector('[data-p="name"]'), 'X');
  sr.querySelector('[data-act="save-scene"]').click();
  await wait();
  assert.ok(sr.querySelector('.msg.err').textContent.includes('triggered by a sensor'));
  assert.ok(sr.querySelector('.modal')); // stays open so nothing is lost
});

// ---- Settings and dashboards -------------------------------------------------------------------

const PANELS = {
  lovelace: { component_name: 'lovelace', url_path: 'lovelace', title: 'Overview' },
  'dashboard-2column': { component_name: 'lovelace', url_path: 'dashboard-2column', title: 'Two column' },
  config: { component_name: 'config', url_path: 'config', title: 'Settings' },
  map: { component_name: 'map', url_path: 'map', title: 'Map' },
};

test('settings tab saves master switch, dashboards and reduced motion', async () => {
  const { sr, wait, call } = await boot([]);
  sr.querySelector('[data-tab="settings"]').click();
  sr.querySelector('[data-s="default_dashboards"]').value = '/dashboard-2column\n/iphone-dashboard';
  sr.querySelector('[data-s="respect_reduced_motion"]').checked = false;
  sr.querySelector('[data-act="save-settings"]').click();
  await wait();
  const save = call('save_settings');
  assert.deepStrictEqual([...save.settings.default_dashboards], ['/dashboard-2column', '/iphone-dashboard']);
  assert.strictEqual(save.settings.respect_reduced_motion, false);
});

test('dashboard picker lists only real dashboards and ticking one saves its path', async () => {
  const { sr, change, wait, call } = await boot([base()], PANELS);
  sr.querySelector('[data-act="edit"]').click();
  const boxes = [...sr.querySelectorAll('[data-dash]')].map((b) => b.dataset.dash);
  assert.deepStrictEqual(boxes.sort(), ['/dashboard-2column', '/lovelace']);
  const two = sr.querySelector('[data-dash="/dashboard-2column"]');
  two.checked = true; change(two);
  assert.strictEqual(sr.querySelector('textarea[data-p="dashboards"]').value, '/dashboard-2column');
  sr.querySelector('[data-act="save"]').click();
  await wait(20);
  assert.deepStrictEqual([...call('save_item').item.dashboards], ['/dashboard-2column']);
});

test('typed extra paths survive and unticking removes only that path', async () => {
  const { sr, change, wait, call } = await boot([base({ dashboards: ['/dashboard-2column', '/custom-view'] })], PANELS);
  sr.querySelector('[data-act="edit"]').click();
  assert.ok(sr.querySelector('[data-dash="/dashboard-2column"]').checked);
  const two = sr.querySelector('[data-dash="/dashboard-2column"]');
  two.checked = false; change(two);
  sr.querySelector('[data-act="save"]').click();
  await wait(20);
  assert.deepStrictEqual([...call('save_item').item.dashboards], ['/custom-view']);
});

test('the repeat-rule code is the same in the panel and the runtime', () => {
  const block = (file) => {
    const text = fs.readFileSync(file, 'utf8');
    const a = text.indexOf('// <recurrence>'), b = text.indexOf('// </recurrence>');
    assert.ok(a > 0 && b > a, file);
    return text.slice(a, b);
  };
  assert.strictEqual(block(PANEL), block(RUNTIME));
});

test.after(closeAll);

test('Scale is saved with the settings', async () => {
  const { sr, wait, call } = await boot([]);
  sr.querySelector('[data-tab="settings"]').click();
  sr.querySelector('[data-s="scale"]').value = '175';
  sr.querySelector('[data-act="save-settings"]').click();
  await wait();
  assert.strictEqual(call('save_settings').settings.scale, 175);
});

test('a decoration can have several corners, added and removed', async () => {
  const { sr } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="decoration"]').click();
  assert.strictEqual(sr.querySelector('[data-act="del-placement"]'), null);
  sr.querySelector('[data-act="add-placement"]').click();
  sr.querySelector('[data-act="add-placement"]').click();
  assert.strictEqual(sr.querySelectorAll('[data-act="del-placement"]').length, 3);
  assert.ok(sr.querySelector('input[name="grid-placements.1.anchor"][value="top_left"]').checked);
  sr.querySelectorAll('[data-act="del-placement"]')[0].click();
  assert.strictEqual(sr.querySelectorAll('[data-act="del-placement"]').length, 2);
});

test('each corner has an optional size box that saves as a number or empty', async () => {
  const { sr, change } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="decoration"]').click();
  const box = sr.querySelector('input[data-p="placements.0.size_px"]');
  assert.ok(box);
  assert.strictEqual(box.value, '');
  box.value = '120'; change(box);
  assert.strictEqual(sr.querySelector('input[data-p="placements.0.size_px"]').value, '120');
});

test('a new popup starts from the edge chosen in Settings, and Settings saves it', async () => {
  const { sr, wait, call } = await boot([]);
  sr.querySelector('[data-act="add"][data-kind="popup"]').click();
  assert.strictEqual(sr.querySelector('select[data-p="anchor"]').value, 'left');
  assert.strictEqual(sr.querySelector('select[data-p="drawn_for"]').value, 'left');
  sr.querySelector('[data-act="cancel"]').click();
  sr.querySelector('[data-tab="settings"]').click();
  sr.querySelector('[data-s="popup_default_edge"]').value = 'right';
  sr.querySelector('[data-act="save-settings"]').click();
  await wait();
  assert.strictEqual(call('save_settings').settings.popup_default_edge, 'right');
});

test('uploaded pictures in the panel are fetched with the login; bundled art uses a normal src', async () => {
  const up = '/dashboard_holiday_popups_files/kid-1a2b3c4d.gif';
  const bundled = '/dashboard_holiday_popups_static/1.0.5/images/lion.webp';
  const { w, hass, sr, send, wait } = await boot([base({ id: 'u', image_url: up }), base({ id: 'b', order: 2, image_url: bundled })]);
  const fetched = [];
  w.URL.createObjectURL = () => 'blob:panel-pic';
  w.URL.revokeObjectURL = () => {};
  hass.fetchWithAuth = async (u) => { fetched.push(u); return { ok: true, blob: async () => ({ type: 'image/gif' }) }; };
  send([base({ id: 'u', image_url: up }), base({ id: 'b', order: 2, image_url: bundled })], []);
  await wait(40);
  const mine = sr.querySelector(`img[data-asrc="${up}"]`);
  assert.ok(mine, 'uploaded picture waits for the login');
  assert.strictEqual(mine.getAttribute('src'), 'blob:panel-pic');
  assert.strictEqual(sr.querySelector(`img[src="${bundled}"]`) !== null, true);
  assert.deepStrictEqual(fetched, [up], 'fetched once with the login, bundled art not fetched');
  send([base({ id: 'u', image_url: up, name: 'Renamed' }), base({ id: 'b', order: 2, image_url: bundled })], []);
  await wait(40);
  assert.deepStrictEqual(fetched, [up], 'a redraw reuses the picture already loaded');
});

test('Settings has a hide-on-small-screens switch that saves', async () => {
  const { sr, change, wait, call } = await boot([base()], {}, [], { hide_on_small_screens: false });
  sr.querySelector('[data-tab="settings"]').click();
  await wait(20);
  const box = sr.querySelector('[data-s="hide_on_small_screens"]');
  assert.ok(box, 'switch is shown');
  assert.strictEqual(box.checked, false);
  box.checked = true; change(box);
  sr.querySelector('[data-act="save-settings"]').click();
  await wait(20);
  assert.strictEqual(call('save_settings').settings.hide_on_small_screens, true);
});
