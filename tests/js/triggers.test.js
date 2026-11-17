const test = require('node:test');
const assert = require('node:assert');
const { closeAll, makeWindow, loadRuntime } = require('./helpers');

const T = loadRuntime(makeWindow()).__dhpTest;
const d = (y, m, day, h = 12) => new Date(y, m - 1, day, h, 0, 0);


const R = (o) => ({
  start: '2026-01-01', length_days: 1, repeat: 'none', interval: 1, weekdays: [], by: 'day', day: 1, nth: 1,
  weekday: 0, month: 1, ends: 'never', until: '', count: 1, ...o,
});
const on = (r, y, m, day) => T.recurrenceActive(r, d(y, m, day)).active;
const dateT = (r) => ({ type: 'date', enabled: true, recurrence: r });

test('one-off range: five days before Christmas, each day, and not the day before or after', () => {
  const santa = R({ start: '2026-12-20', length_days: 5 });
  for (const day of [20, 21, 22, 23, 24]) assert.ok(on(santa, 2026, 12, day), `Dec ${day}`);
  assert.ok(!on(santa, 2026, 12, 19));
  assert.ok(!on(santa, 2026, 12, 25));
  assert.ok(!on(santa, 2027, 12, 22)); // does not repeat
  assert.ok(on(R({ start: '2026-12-20', length_days: 5, repeat: 'yearly', month: 12, day: 20 }), 2027, 12, 22)); // parents choose yearly
});

test('yearly range (Halloween) and the year before its start', () => {
  const r = R({ start: '2000-10-15', length_days: 17, repeat: 'yearly', month: 10, day: 15 });
  assert.ok(on(r, 2026, 10, 15) && on(r, 2026, 10, 31) && on(r, 2031, 10, 20));
  assert.ok(!on(r, 2026, 10, 14) && !on(r, 2026, 11, 1));
  assert.ok(!on(r, 1999, 10, 20));
});

test('yearly range that crosses New Year works on both sides', () => {
  const r = R({ start: '2000-12-28', length_days: 7, repeat: 'yearly', month: 12, day: 28 });
  assert.ok(on(r, 2026, 12, 30) && on(r, 2027, 1, 2));
  assert.ok(!on(r, 2027, 1, 4) && !on(r, 2026, 12, 27));
});

test('Thanksgiving: 4th Thursday of November, every year', () => {
  const r = R({ start: '2000-11-01', repeat: 'yearly', by: 'weekday', nth: 4, weekday: 4, month: 11 });
  assert.ok(on(r, 2025, 11, 27) && on(r, 2026, 11, 26) && on(r, 2027, 11, 25));
  assert.ok(!on(r, 2026, 11, 19) && !on(r, 2026, 11, 27) && !on(r, 2026, 10, 22));
});

test('Mother\'s Day (2nd Sunday of May) and the last Friday of each month', () => {
  const mom = R({ start: '2000-05-01', repeat: 'yearly', by: 'weekday', nth: 2, weekday: 0, month: 5 });
  assert.ok(on(mom, 2026, 5, 10) && !on(mom, 2026, 5, 3) && !on(mom, 2026, 5, 17));
  const lastFri = R({ start: '2026-01-01', repeat: 'monthly', by: 'weekday', nth: -1, weekday: 5 });
  assert.ok(on(lastFri, 2026, 11, 27) && on(lastFri, 2026, 12, 25) && !on(lastFri, 2026, 11, 20));
});

test('monthly on a day: the 31st uses the last day of shorter months; every 2 months', () => {
  const r = R({ start: '2026-01-31', repeat: 'monthly', day: 31 });
  assert.ok(on(r, 2026, 2, 28) && on(r, 2026, 4, 30) && on(r, 2026, 5, 31) && on(r, 2028, 2, 29));
  assert.ok(!on(r, 2026, 2, 27) && !on(r, 2028, 2, 28));
  const every2 = R({ start: '2026-01-15', repeat: 'monthly', day: 15, interval: 2 });
  assert.ok(on(every2, 2026, 1, 15) && on(every2, 2026, 3, 15) && !on(every2, 2026, 2, 15));
});

test('weekly on chosen weekdays, every 2 weeks, and nothing before the start', () => {
  const mwf = R({ start: '2026-11-02', repeat: 'weekly', weekdays: [1, 3, 5] });
  assert.ok(on(mwf, 2026, 11, 4) && on(mwf, 2026, 11, 6) && !on(mwf, 2026, 11, 5));
  assert.ok(!on(mwf, 2026, 10, 30)); // a Friday, but before the start
  const biweekly = R({ start: '2026-11-02', repeat: 'weekly', weekdays: [1], interval: 2 });
  assert.ok(on(biweekly, 2026, 11, 2) && !on(biweekly, 2026, 11, 9) && on(biweekly, 2026, 11, 16));
});

test('daily every 3 days', () => {
  const r = R({ start: '2026-11-01', repeat: 'daily', interval: 3 });
  assert.ok(on(r, 2026, 11, 1) && on(r, 2026, 11, 4) && !on(r, 2026, 11, 5) && on(r, 2026, 11, 7));
});

test('ends on a date, and after N times', () => {
  const until = R({ start: '2000-10-31', repeat: 'yearly', month: 10, day: 31, ends: 'on', until: '2027-12-31' });
  assert.ok(on(until, 2027, 10, 31) && !on(until, 2028, 10, 31));
  const twice = R({ start: '2026-10-31', repeat: 'yearly', month: 10, day: 31, ends: 'after', count: 2 });
  assert.ok(on(twice, 2026, 10, 31) && on(twice, 2027, 10, 31) && !on(twice, 2028, 10, 31));
});

test('29 February yearly falls on 28 February in common years', () => {
  const r = R({ start: '2024-02-29', repeat: 'yearly', month: 2, day: 29 });
  assert.ok(on(r, 2025, 2, 28) && on(r, 2028, 2, 29) && !on(r, 2025, 3, 1));
});

test('a rule is worked out once a day, and again on the next day', () => {
  const r = R({ start: '2026-12-20', length_days: 2 });
  const first = T.recurrenceActive(r, d(2026, 12, 20));
  assert.strictEqual(T.recurrenceActive(r, d(2026, 12, 20, 18)), first);
  assert.notStrictEqual(T.recurrenceActive(r, d(2026, 12, 22)), first);
});

test('next occurrence: today when active, otherwise the next one', () => {
  const r = R({ start: '2000-10-15', length_days: 17, repeat: 'yearly', month: 10, day: 15 });
  const now = T.recurrenceNext(r, d(2026, 10, 20));
  assert.strictEqual(now.start.getDate(), 15);
  const next = T.recurrenceNext(r, d(2026, 11, 15));
  assert.deepStrictEqual([next.start.getFullYear(), next.start.getMonth() + 1, next.start.getDate()], [2027, 10, 15]);
  assert.strictEqual(T.recurrenceNext(R({ start: '2020-01-01' }), d(2026, 1, 1)), null);
});

test('a date trigger without a repeat rule never matches', () => {
  assert.ok(!T.dateTriggerActive({ type: 'date', date: '10-31' }, d(2026, 10, 31)));
  assert.ok(T.dateTriggerActive(dateT(R({ start: '2026-10-31' })), d(2026, 10, 31)));
});

test('entity operators and unknown/unavailable', () => {
  const states = {
    'sensor.a': { state: '5', attributes: { level: '9' } },
    'sensor.b': { state: 'unavailable', attributes: {} },
    'sensor.c': { state: 'unknown', attributes: {} },
    'sensor.d': { state: 'Washer done', attributes: {} },
  };
  const e = (over) => T.entityTriggerActive({ entity_id: 'sensor.a', operator: 'equals', value: '5', attribute: '', ...over }, states);
  assert.ok(e({}));
  assert.ok(!e({ operator: 'not_equals' }));
  assert.ok(e({ operator: 'above', value: '4' }));
  assert.ok(!e({ operator: 'above', value: '5' }));
  assert.ok(e({ operator: 'below', value: '6' }));
  assert.ok(e({ attribute: 'level', value: '9' }));
  assert.ok(!e({ attribute: 'missing', operator: 'not_equals', value: '1' }));
  assert.ok(!e({ entity_id: 'sensor.b', operator: 'not_equals', value: 'x' }));
  assert.ok(!e({ entity_id: 'sensor.c', operator: 'not_equals', value: 'x' }));
  assert.ok(!e({ entity_id: 'sensor.zzz' }));
  assert.ok(e({ entity_id: 'sensor.d', operator: 'contains', value: 'DONE' }));
  assert.ok(!e({ operator: 'above', value: 'abc' }));
});

test('weather conditions', () => {
  const states = { 'weather.home': { state: 'pouring', attributes: {} } };
  assert.ok(T.weatherTriggerActive({ entity_id: 'weather.home', conditions: ['rainy', 'pouring'] }, states));
  assert.ok(!T.weatherTriggerActive({ entity_id: 'weather.home', conditions: ['snowy'] }, states));
  assert.ok(!T.weatherTriggerActive({ entity_id: 'weather.none', conditions: ['snowy'] }, states));
});

test('paused triggers are ignored; no triggers means always; all paused means never', () => {
  const now = d(2026, 10, 31);
  const date = { id: 'a', type: 'date', enabled: true, name: 'Halloween', recurrence: R({ start: '2000-10-31', repeat: 'yearly', month: 10, day: 31 }) };
  const none = T.itemTriggerState({ id: 'x', triggers: [] }, now, {}, new Map());
  assert.ok(none.active && none.name === '');
  const hit = T.itemTriggerState({ id: 'x', triggers: [date] }, now, {}, new Map());
  assert.ok(hit.active && hit.name === 'Halloween');
  assert.strictEqual(T.itemTriggerState({ id: 'x', triggers: [{ ...date, enabled: false }] }, now, {}, new Map()).active, false);
  const other = { id: 'b', type: 'date', enabled: true, recurrence: R({ start: '2000-12-25', repeat: 'yearly', month: 12, day: 25 }) };
  assert.strictEqual(T.itemTriggerState({ id: 'x', triggers: [{ ...date, enabled: false }, other] }, now, {}, new Map()).active, false);
});

test('manual trigger needs a live manual entry', () => {
  const now = d(2026, 5, 5);
  const item = { id: 'x', triggers: [{ id: 'm', type: 'manual', enabled: true }] };
  assert.strictEqual(T.itemTriggerState(item, now, {}, new Map()).active, false);
  assert.strictEqual(T.itemTriggerState(item, now, {}, new Map([['x', now.getTime() + 1000]])).active, true);
});

test('template fills the trigger name', () => {
  assert.strictEqual(T.fillTemplate('Happy Birthday, {name}!', 'Sam'), 'Happy Birthday, Sam!');
  assert.strictEqual(T.fillTemplate('<b>{name}</b>', '<i>'), '<b><i></b>'); // returned as plain text, never parsed as HTML
});

test('wave shapes and overlap', () => {
  assert.ok(Math.abs(T.waveValue('zigzag', Math.PI / 2) - 1) < 1e-9);
  assert.ok(Math.abs(T.waveValue('zigzag', Math.PI / 4) - 0.5) < 1e-9);
  assert.ok(Math.abs(T.waveValue('sine', Math.PI / 2) - 1) < 1e-9);
  assert.ok(T.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }, 0));
  assert.ok(!T.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 }, 12));
  assert.ok(T.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 0, w: 10, h: 10 }, 12));
});

test.after(closeAll);
