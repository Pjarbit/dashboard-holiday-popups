const test = require('node:test');
const assert = require('node:assert');
const { closeAll, makeWindow, loadRuntime, fakeHass, item, config, rule, isoToday, scene, tick } = require('./helpers');

async function boot({ url, hassOpts, cfg, reduce }) {
  const w = makeWindow(url, { reduce });
  const { subs } = fakeHass(w, hassOpts);
  loadRuntime(w);
  await tick(700); // runtime connects with a short delay
  assert.strictEqual(subs.length, 1, 'subscribed once');
  assert.strictEqual(subs[0].msg.type, 'dashboard_holiday_popups/subscribe_config');
  subs[0].cb(cfg);
  await tick(80);
  const host = w.document.getElementById('dashboard-holiday-popups-host');
  return { w, subs, host, shadow: host.shadowRoot };
}

test('draws a floater on a matching dashboard', async () => {
  const { shadow, w } = await boot({ cfg: config([item()]) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 1);
  w.__dhpRuntime && w.eval('void 0');
});

test('nothing drawn and no console errors on a settings page', async () => {
  const errors = [];
  const w = makeWindow('http://ha.local/config/dashboard');
  w.console.error = (...a) => errors.push(a);
  const { subs } = fakeHass(w, { panels: { config: { component_name: 'config' } } });
  loadRuntime(w);
  await tick(700);
  subs[0].cb(config([item()]));
  await tick(80);
  assert.strictEqual(w.document.getElementById('dashboard-holiday-popups-host').shadowRoot.querySelectorAll('.it').length, 0);
  assert.deepStrictEqual(errors, []);
});

test('dashboard prefix filter', async () => {
  const hit = await boot({ cfg: config([item({ dashboards: ['/dashboard-2column'] })]) });
  assert.strictEqual(hit.shadow.querySelectorAll('.it').length, 1);
  const miss = await boot({ cfg: config([item({ dashboards: ['/iphone-dashboard'] })]) });
  assert.strictEqual(miss.shadow.querySelectorAll('.it').length, 0);
});

test('disabled item, paused trigger and master switch hide it', async () => {
  const off = await boot({ cfg: config([item({ enabled: false })]) });
  assert.strictEqual(off.shadow.querySelectorAll('.it').length, 0);
  const paused = await boot({ cfg: config([item({ triggers: [{ id: 't', type: 'always', enabled: false }] })]) });
  assert.strictEqual(paused.shadow.querySelectorAll('.it').length, 0);
  const master = await boot({ cfg: config([item()], { enabled: false }) });
  assert.strictEqual(master.shadow.querySelectorAll('.it').length, 0);
});

test('cap limits simultaneous floaters in stable order', async () => {
  const items = [1, 2, 3, 4].map((n) => item({ id: 'f' + n, order: n, name: 'F' + n }));
  const { shadow } = await boot({ cfg: config(items, { max_simultaneous: 2 }) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 2);
});

test('live update adds and removes; shutdown removes everything', async () => {
  const { subs, w, shadow } = await boot({ cfg: config([item()]) });
  subs[0].cb(config([item(), item({ id: 'i2', order: 2, name: 'Two' })]));
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 2);
  subs[0].cb(config([]));
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0);
  subs[0].cb({ type: 'shutdown' });
  assert.strictEqual(w.document.getElementById('dashboard-holiday-popups-host'), null);
});

test('decoration is click-through and mirrored for the right side', async () => {
  const deco = item({ id: 'd1', kind: 'decoration', placements: [{ anchor: 'top_right', offset_px: { x: 0, y: 0 }, flip: true }], opacity: 0.5 });
  const { shadow } = await boot({ cfg: config([deco]) });
  const el = shadow.querySelector('.deco');
  assert.ok(el);
  assert.ok(el.style.transform.includes('scaleX(-1)'));
  assert.strictEqual(el.style.opacity, '0.5');
  assert.ok(shadow.querySelector('style').textContent.includes('.deco{position:fixed;pointer-events:none}'));
});

test('popup test command shows it and text is plain text', async () => {
  const popup = item({
    id: 'p1', kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
    frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
    banner: { enabled: true, text_template: '<img src=x onerror=alert(1)> {name}' }, triggers: [{ id: 'd', type: 'date', enabled: true, name: 'Sam', recurrence: { start: '2000-01-01', length_days: 366, repeat: 'yearly', interval: 1, weekdays: [], by: 'day', day: 1, nth: 1, weekday: 0, month: 1, ends: 'never', until: '', count: 1 } }],
  });
  const { subs, shadow } = await boot({ cfg: config([popup]) });
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1', message: 'Hello <b>there</b>' });
  await tick(80);
  const banner = shadow.querySelector('.bn');
  assert.ok(banner);
  assert.strictEqual(banner.textContent, 'Hello <b>there</b>');
  assert.strictEqual(banner.querySelector('b'), null);
});

test('two popups never overlap', async () => {
  const mk = (n) => item({
    id: 'p' + n, order: n, kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
    frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
    banner: { enabled: false, text_template: '' }, triggers: [],
  });
  const { subs, shadow } = await boot({ cfg: config([mk(1), mk(2)]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p2' });
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 1); // same fixed spot: second one waits
});

test('hide_all dismisses popups', async () => {
  const popup = item({
    id: 'p1', kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
    frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
    banner: { enabled: false, text_template: '' }, triggers: [],
  });
  const { subs, shadow } = await boot({ cfg: config([popup, item({ id: 'f1', order: 2 })]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  await tick(50);
  subs[0].cb({ type: 'command', command: 'hide_all' });
  await tick(1300);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0); // everything stays away for a minute, new popups included
});

const popupItem = (over = {}) => item({
  id: 'p1', kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
  frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
  banner: { enabled: false, text_template: '' }, triggers: [], ...over,
});
const deco = (over = {}) => item({ id: 'd1', kind: 'decoration', placements: [{ anchor: 'top_left', offset_px: { x: 0, y: 0 }, flip: true }], opacity: 1, ...over });

test('reduced motion hides characters and popups but keeps decorations', async () => {
  const { shadow, subs } = await boot({ reduce: true, cfg: config([item(), popupItem({ order: 2 }), deco({ order: 3 })]) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0);
  assert.strictEqual(shadow.querySelectorAll('.deco').length, 1);
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' }); // show_popup still works
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 1);
});

test('reduced motion setting can be switched off, and an ordinary device is unaffected', async () => {
  const off = await boot({ reduce: true, cfg: config([item()], { respect_reduced_motion: false }) });
  assert.strictEqual(off.shadow.querySelectorAll('.it').length, 1);
  const normal = await boot({ reduce: false, cfg: config([item()], { respect_reduced_motion: true }) });
  assert.strictEqual(normal.shadow.querySelectorAll('.it').length, 1);
});

const PAST = rule({ start: '2020-01-01' }); // a one-off date long gone
const pastTrigger = { id: 't', type: 'date', enabled: true, recurrence: PAST };

test('a scene decides for its items: its date, its switch, and the items\' own triggers are ignored', async () => {
  const inScene = item({ id: 'f1', enabled: false, triggers: [pastTrigger] }); // paused and out of date on its own
  const loose = item({ id: 'f2', order: 2, enabled: false });
  const live = await boot({ cfg: config([inScene, loose], {}, [scene({ item_ids: ['f1'] })]) });
  assert.strictEqual(live.shadow.querySelectorAll('.it').length, 1); // f1 only; f2 is paused and not in a scene
  const paused = await boot({ cfg: config([inScene], {}, [scene({ item_ids: ['f1'], enabled: false })]) });
  assert.strictEqual(paused.shadow.querySelectorAll('.it').length, 0);
  const wrongDay = await boot({ cfg: config([inScene], {}, [scene({ item_ids: ['f1'], recurrence: PAST })]) });
  assert.strictEqual(wrongDay.shadow.querySelectorAll('.it').length, 0);
});

test('an item in two scenes shows when either one is on; with every scene off it is an ordinary item again', async () => {
  const a = scene({ id: 'sa', item_ids: ['f1'], recurrence: PAST });
  const b = scene({ id: 'sb', item_ids: ['f1'] });
  const either = await boot({ cfg: config([item({ id: 'f1', enabled: false })], {}, [a, b]) });
  assert.strictEqual(either.shadow.querySelectorAll('.it').length, 1); // a scene is on, so its own switch is not used
  const ordinary = await boot({ cfg: config([item({ id: 'f1' })], {}, [a]) }); // scene off, own switch on, no dates = all the time
  assert.strictEqual(ordinary.shadow.querySelectorAll('.it').length, 1);
  const paused = await boot({ cfg: config([item({ id: 'f1', enabled: false })], {}, [a]) });
  assert.strictEqual(paused.shadow.querySelectorAll('.it').length, 0);
});

test('while a scene is on, a banner shows the scene\'s banner name for {name}', async () => {
  const popup = popupItem({ id: 'p1', enabled: false, repeat_mode: 'once', banner: { enabled: true, text_template: 'Happy birthday {name}!' } });
  const sc = scene({ id: 'sa', item_ids: ['p1'], banner_name: 'Joe' });
  const { shadow } = await boot({ cfg: config([popup], {}, [sc]) });
  await tick(120);
  const banner = shadow.querySelector('.bn');
  assert.ok(banner);
  assert.strictEqual(banner.textContent, 'Happy birthday Joe!');
});

test('Run now shows a paused, out-of-date item until Stop, even past a reload of the saved state', async () => {
  const idle = item({ id: 'f1', enabled: false, triggers: [pastTrigger] });
  const { subs, shadow } = await boot({ cfg: config([idle]) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0);
  subs[0].cb(config([{ ...idle, running: true }]));
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 1);
  const reloaded = await boot({ cfg: config([{ ...idle, running: true }]) }); // a fresh page gets the saved flag
  assert.strictEqual(reloaded.shadow.querySelectorAll('.it').length, 1);
  subs[0].cb(config([idle]));
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0);
});

test('Run now does not restart a character that is already walking', async () => {
  const f = item({ id: 'f1' });
  const { subs, shadow } = await boot({ cfg: config([f]) });
  const before = shadow.querySelector('.it');
  subs[0].cb(config([{ ...f, running: true }]));
  await tick(80);
  subs[0].cb(config([{ ...f, running: true, enabled: false }]));
  await tick(80);
  assert.strictEqual(shadow.querySelector('.it'), before);
});

test('Run now on a scene shows its items, and Run now still respects the cap', async () => {
  const items = [1, 2, 3].map((n) => item({ id: 'f' + n, order: n, enabled: false }));
  const sc = scene({ item_ids: ['f1', 'f2', 'f3'], recurrence: PAST, running: true });
  const { shadow } = await boot({ cfg: config(items, { max_simultaneous: 2 }, [sc]) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 2);
});

test('Run now on a popup shows it at once instead of waiting for its timer', async () => {
  const popup = item({
    id: 'p1', kind: 'popup', enabled: false, anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
    frequency: { value: 5, unit: 'minutes' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'once',
    banner: { enabled: false, text_template: '' }, triggers: [],
  });
  const { subs, shadow } = await boot({ cfg: config([popup]) });
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  subs[0].cb(config([{ ...popup, running: true }]));
  await tick(1300);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 1);
});

test('a popup on its own timer appears when the time comes (and not before)', async () => {
  const popup = item({
    id: 'p1', kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
    frequency: { value: 1, unit: 'seconds' }, duration_seconds: 6, rotate_for_edge: true, repeat_mode: 'repeat',
    banner: { enabled: false, text_template: '' }, triggers: [],
  });
  const { shadow } = await boot({ cfg: config([popup]) });
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  await tick(1700);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 1);
});

test('Run now overrides reduced motion; decorations in a scene still show', async () => {
  const { shadow } = await boot({ reduce: true, cfg: config([item({ id: 'f1', running: true })]) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 1);
});

test.after(closeAll);

test('a decoration with several placements draws one copy per corner, flipped to fit', async () => {
  const d = deco({ placements: [
    { anchor: 'top_left', offset_px: { x: 0, y: 0 }, flip: true },
    { anchor: 'top_right', offset_px: { x: 0, y: 0 }, flip: true },
    { anchor: 'bottom_left', offset_px: { x: 0, y: 0 }, flip: true },
    { anchor: 'bottom_right', offset_px: { x: 0, y: 0 }, flip: false },
  ] });
  const { shadow } = await boot({ cfg: config([d]) });
  const els = [...shadow.querySelectorAll('.deco')];
  assert.strictEqual(els.length, 4);
  assert.strictEqual(els[0].style.transform, '');
  assert.ok(els[1].style.transform.includes('scaleX(-1)'));
  assert.ok(els[2].style.transform.includes('scaleY(-1)'));
  assert.strictEqual(els[3].style.transform, '');
});

test('the Scale setting multiplies sizes', async () => {
  const { shadow } = await boot({ cfg: config([deco({ size_px: 200 })], { scale: 150 }) });
  assert.strictEqual(shadow.querySelector('.deco').style.width, '300px');
  const f = await boot({ cfg: config([item({ size_px: 100 })], { scale: 200 }) });
  assert.strictEqual(f.shadow.querySelector('.it').style.width.replace('px', '') > 0, true);
});

test('a corner with its own size uses it, others use the decoration size, and Scale applies to both', async () => {
  const d = deco({ size_px: 200, placements: [
    { anchor: 'top_left', offset_px: { x: 0, y: 0 }, flip: true, size_px: null },
    { anchor: 'bottom_left', offset_px: { x: 0, y: 0 }, flip: true, size_px: 100 },
  ] });
  const { shadow } = await boot({ cfg: config([d], { scale: 150 }) });
  const els = [...shadow.querySelectorAll('.deco')];
  assert.strictEqual(els[0].style.width, '300px');
  assert.strictEqual(els[1].style.width, '150px');
});

test('a popup is turned from the edge its picture was drawn for to the edge it comes in from', async () => {
  const show = async (over) => {
    const { subs, shadow } = await boot({ cfg: config([popupItem({ id: 'p1', anchor: 'left', allowed_edges: ['left'], rotate_for_edge: true, ...over })]) });
    subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
    await tick(80);
    return shadow.querySelector('.pop .pic').style.transform;
  };
  assert.strictEqual(await show({ drawn_for: 'left' }), '');                  // drawn for the left, comes from the left
  assert.strictEqual(await show({ drawn_for: 'bottom' }), 'rotate(90deg)');   // the old behaviour for a bottom picture
  assert.strictEqual(await show({}), 'rotate(90deg)');                         // no drawn_for saved means bottom
  assert.strictEqual(await show({ drawn_for: 'right' }), 'scaleX(-1)');        // left and right stay upright: mirrored, not turned over
  assert.strictEqual(await show({ drawn_for: 'top' }), 'rotate(-90deg)');
});

test('"Left or right" and "Top or bottom" popups only come in from those two edges', async () => {
  const turns = async (anchor) => {
    const seen = new Set();
    for (let n = 0; n < 8; n += 1) {
      const { subs, shadow } = await boot({ cfg: config([popupItem({ id: 'p1', anchor, allowed_edges: ['bottom'], drawn_for: 'bottom', rotate_for_edge: true })]) });
      subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
      await tick(30);
      seen.add(shadow.querySelector('.pop .pic').style.transform);
    }
    return [...seen];
  };
  // a bottom-drawn picture is turned 90 / -90 degrees on the left / right edge, and 180 / 0 on the top / bottom edge
  assert.ok((await turns('left_right')).every((t) => t === 'rotate(90deg)' || t === 'rotate(-90deg)'));
  assert.ok((await turns('top_bottom')).every((t) => t === '' || t === 'rotate(180deg)'));
});

test('your own uploaded pictures load with the Home Assistant login; bundled art loads with a plain fetch', async () => {
  const w = makeWindow();
  const plain = [];
  const authed = [];
  w.fetch = async (u) => { plain.push(u); return { ok: true, blob: async () => ({ type: 'image/webp' }) }; };
  const { ha, subs } = fakeHass(w);
  ha.hass.fetchWithAuth = async (u, init) => { authed.push({ u, init }); return { ok: true, blob: async () => ({ type: 'image/gif' }) }; };
  loadRuntime(w);
  await tick(700);
  subs[0].cb(config([
    item({ id: 'u', image_url: '/dashboard_holiday_popups_files/kid-1a2b3c4d.gif' }),
    item({ id: 'b', image_url: '/dashboard_holiday_popups_static/1.0.5/images/lion.webp' }),
  ]));
  await tick(80);
  assert.deepStrictEqual(authed.map((c) => c.u), ['/dashboard_holiday_popups_files/kid-1a2b3c4d.gif']);
  assert.strictEqual(authed[0].init.cache, 'reload');
  assert.deepStrictEqual(plain, ['/dashboard_holiday_popups_static/1.0.5/images/lion.webp']);
});

test('an uploaded picture waits for the Home Assistant login instead of fetching without it', async () => {
  const w = makeWindow();
  const plain = [];
  w.fetch = async (u) => { plain.push(u); return { ok: true, blob: async () => ({ type: 'image/webp' }) }; };
  const { ha, subs } = fakeHass(w);
  const authed = [];
  loadRuntime(w);
  await tick(700);
  subs[0].cb(config([item({ image_url: '/dashboard_holiday_popups_files/kid-1a2b3c4d.gif' })]));
  await tick(80);
  assert.deepStrictEqual(plain, [], 'no unauthenticated request was made');
  ha.hass.fetchWithAuth = async (u) => { authed.push(u); return { ok: true, blob: async () => ({ type: 'image/gif' }) }; };
  await tick(1200);
  assert.deepStrictEqual(authed, ['/dashboard_holiday_popups_files/kid-1a2b3c4d.gif']);
  assert.deepStrictEqual(plain, []);
});

test('hide on small screens: nothing is drawn on a phone-width page, and it returns when the page is wide', async () => {
  const off = await boot({ cfg: config([item(), deco({ order: 2 })], { hide_on_small_screens: true }) });
  assert.strictEqual(off.shadow.querySelectorAll('.it, .deco').length, 2, 'wide page: shown');
  off.w.innerWidth = 390;
  await tick(1200);
  assert.strictEqual(off.shadow.querySelectorAll('.it, .deco').length, 0, 'phone width: nothing drawn');
  off.w.innerWidth = 844;
  await tick(1200);
  assert.strictEqual(off.shadow.querySelectorAll('.it, .deco').length, 2, 'turned sideways: shown again');
});

test('hide on small screens does nothing while the setting is off, and also stops Run now', async () => {
  const w = makeWindow();
  w.innerWidth = 390;
  const { subs } = fakeHass(w);
  loadRuntime(w);
  await tick(700);
  subs[0].cb(config([item()], { hide_on_small_screens: false }));
  await tick(80);
  const shadow = w.document.getElementById('dashboard-holiday-popups-host').shadowRoot;
  assert.strictEqual(shadow.querySelectorAll('.it').length, 1, 'setting off: still shown on a narrow page');
  subs[0].cb(config([item({ running: true })], { hide_on_small_screens: true }));
  await tick(1200);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0, 'setting on: even Run now is hidden');
});
