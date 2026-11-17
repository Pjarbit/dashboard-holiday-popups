const test = require('node:test');
const assert = require('node:assert');
const { closeAll, makeWindow, loadRuntime, fakeHass, item, config, scene, isoToday, tick } = require('./helpers');

async function boot({ cfg, failSend = false }) {
  const w = makeWindow('http://ha.local/dashboard-2column/home');
  const { subs, sent } = fakeHass(w, { failSend });
  loadRuntime(w);
  await tick(700);
  subs[0].cb(cfg);
  await tick(80);
  const shadow = w.document.getElementById('dashboard-holiday-popups-host').shadowRoot;
  return { w, subs, sent, shadow };
}

/** Press, drag by (dx, dy) from the given start, release. Plain events with the fields the runtime reads. */
function drag(w, el, from, to) {
  el.setPointerCapture = () => {};
  const fire = (type, x, y) => {
    const e = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1 });
    el.dispatchEvent(e);
  };
  fire('pointerdown', from[0], from[1]);
  fire('pointermove', to[0], to[1]);
  fire('pointerup', to[0], to[1]);
}

const popup = (over = {}) => item({
  id: 'p1', kind: 'popup', anchor: 'bottom', position_along_edge: 'center', allowed_edges: ['bottom'],
  frequency: { value: 1, unit: 'seconds' }, duration_seconds: 30, rotate_for_edge: true, repeat_mode: 'repeat',
  banner: { enabled: false, text_template: '' }, drag_off: { enabled: true, action: 'delay', away_seconds: 30 },
  triggers: [], ...over,
});

const dismissed = (sent) => sent.filter((m) => m.type === 'dashboard_holiday_popups/dismiss_item');

test('character pushed off with "delay": hidden, nothing sent to the server', async () => {
  const { w, shadow, sent } = await boot({ cfg: config([item()]) });
  const el = shadow.querySelector('.it');
  drag(w, el, [400, 400], [-300, 400]);
  assert.strictEqual(el.style.display, 'none');
  assert.deepStrictEqual(dismissed(sent), []);
});

test('character pushed off with "turn off": the server is asked, with no scene token outside a scene', async () => {
  const cfg = config([item({ drag_off: { enabled: true, action: 'off', away_seconds: 60 } })]);
  const { w, shadow, sent } = await boot({ cfg });
  drag(w, shadow.querySelector('.it'), [400, 400], [-300, 400]);
  await tick(20);
  assert.deepStrictEqual(dismissed(sent).map((m) => [m.item_id, Object.keys(m.occurrences).length]), [['i1', 0]]);
  assert.strictEqual(shadow.querySelector('.it').style.display, 'none');
});

test('character released mid-screen is not pushed away', async () => {
  const cfg = config([item({ size_px: 300, direction: 'left_to_right', drag_off: { enabled: true, action: 'off', away_seconds: 60 } })]);
  const { w, shadow, sent } = await boot({ cfg });
  const el = shadow.querySelector('.it');
  drag(w, el, [400, 400], [1000, 400]); // along the line it walks on, ending well inside the screen
  assert.notStrictEqual(el.style.display, 'none');
  assert.deepStrictEqual(dismissed(sent), []);
});

test('"turn off" that cannot reach the server falls back to coming back after the delay', async () => {
  const cfg = config([item({ drag_off: { enabled: true, action: 'off', away_seconds: 1 } })]);
  const { w, shadow, sent } = await boot({ cfg, failSend: true });
  const el = shadow.querySelector('.it');
  drag(w, el, [400, 400], [-300, 400]);
  await tick(20);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(el.style.display, 'none');
  await tick(1500);
  assert.notStrictEqual(shadow.querySelector('.it').style.display, 'none'); // back after the 1 second delay
});

test('inside a scene the push names the scene occurrence', async () => {
  const cfg = config([item({ drag_off: { enabled: true, action: 'off', away_seconds: 60 } })], {}, [scene({ item_ids: ['i1'] })]);
  const { w, shadow, sent } = await boot({ cfg });
  drag(w, shadow.querySelector('.it'), [400, 400], [-300, 400]);
  await tick(20);
  assert.deepStrictEqual({ ...dismissed(sent)[0].occurrences }, { s1: isoToday() });
});

test('an item muted for this scene occurrence is not shown; a different occurrence shows it', async () => {
  const muted = config([item({ muted: { s1: isoToday() } })], {}, [scene({ item_ids: ['i1'] })]);
  assert.strictEqual((await boot({ cfg: muted })).shadow.querySelectorAll('.it').length, 0);
  const old = config([item({ muted: { s1: '2020-01-01' } })], {}, [scene({ item_ids: ['i1'] })]);
  assert.strictEqual((await boot({ cfg: old })).shadow.querySelectorAll('.it').length, 1);
  const other = config([item({ muted: { other: isoToday() } })], {}, [scene({ item_ids: ['i1'] })]);
  assert.strictEqual((await boot({ cfg: other })).shadow.querySelectorAll('.it').length, 1); // another scene's mute does not count
});

test('an item in two live scenes needs both muted to disappear', async () => {
  const scenes = [scene({ id: 'sc1', item_ids: ['i1'] }), scene({ id: 'sc2', order: 2, name: 'Second', item_ids: ['i1'] })];
  const one = config([item({ muted: { sc1: isoToday() } })], {}, scenes);
  assert.strictEqual((await boot({ cfg: one })).shadow.querySelectorAll('.it').length, 1);
  const both = config([item({ muted: { sc1: isoToday(), sc2: isoToday() } })], {}, scenes);
  assert.strictEqual((await boot({ cfg: both })).shadow.querySelectorAll('.it').length, 0);
});

test('pushing an item that is in two live scenes names both', async () => {
  const scenes = [scene({ id: 'sc1', item_ids: ['i1'] }), scene({ id: 'sc2', order: 2, name: 'Second', item_ids: ['i1'] })];
  const cfg = config([item({ drag_off: { enabled: true, action: 'off', away_seconds: 60 } })], {}, scenes);
  const { w, shadow, sent } = await boot({ cfg });
  drag(w, shadow.querySelector('.it'), [400, 400], [-300, 400]);
  await tick(20);
  assert.deepStrictEqual({ ...dismissed(sent)[0].occurrences }, { sc1: isoToday(), sc2: isoToday() });
});

test('a muted item in a Run now scene stays away until the mute is cleared', async () => {
  const live = (muted) => config([item({ muted })], {}, [scene({ enabled: false, running: true, item_ids: ['i1'] })]);
  const { shadow, subs } = await boot({ cfg: live({ s1: 'run' }) });
  assert.strictEqual(shadow.querySelectorAll('.it').length, 0);
  subs[0].cb(live({}));
  await tick(80);
  assert.strictEqual(shadow.querySelectorAll('.it').length, 1);
});

test('"turn off" accepted by the server but never followed by an update: comes back after a few seconds', async () => {
  const cfg = config([item({ drag_off: { enabled: true, action: 'off', away_seconds: 60 } })]);
  const { w, shadow } = await boot({ cfg });
  const el = shadow.querySelector('.it');
  drag(w, el, [400, 400], [-300, 400]);
  await tick(200);
  assert.strictEqual(el.style.display, 'none');
  await tick(10500);
  assert.notStrictEqual(shadow.querySelector('.it').style.display, 'none');
});

test('popups are tap-through unless pushing is switched on', async () => {
  const { subs, shadow } = await boot({ cfg: config([popup({ drag_off: { enabled: false, action: 'delay', away_seconds: 30 }, enabled: false })]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  await tick(80);
  assert.ok(shadow.querySelector('.pop'));
  assert.ok(!shadow.querySelector('.pop').className.includes('drag'));
});

test('popup pushed back with "delay" slides away and does not return before the delay', async () => {
  const { w, subs, shadow, sent } = await boot({ cfg: config([popup()]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  await tick(80);
  const el = shadow.querySelector('.pop');
  assert.ok(el.className.includes('drag'));
  drag(w, el, [500, 700], [500, 900]); // bottom edge: pushing down is "back out"
  await tick(1200); // the slide-out finishes
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  await tick(1800); // a normal 1 second repeat would have shown it again by now
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 0);
  assert.deepStrictEqual(dismissed(sent), []);
});

test('popup pushed back with "turn off" asks the server', async () => {
  const p = popup({ drag_off: { enabled: true, action: 'off', away_seconds: 30 } });
  const { w, subs, shadow, sent } = await boot({ cfg: config([p]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  await tick(80);
  drag(w, shadow.querySelector('.pop'), [500, 700], [500, 900]);
  await tick(50);
  assert.deepStrictEqual(dismissed(sent).map((m) => m.item_id), ['p1']);
});

test('a short push does not dismiss the popup, and it stays on screen', async () => {
  const { w, subs, shadow, sent } = await boot({ cfg: config([popup({ drag_off: { enabled: true, action: 'off', away_seconds: 30 } })]) });
  subs[0].cb({ type: 'command', command: 'show', item_id: 'p1' });
  await tick(80);
  const el = shadow.querySelector('.pop');
  drag(w, el, [500, 700], [500, 710]);
  await tick(700);
  assert.strictEqual(shadow.querySelectorAll('.pop').length, 1);
  assert.deepStrictEqual(dismissed(sent), []);
});

test.after(closeAll);
