import test from 'node:test';
import assert from 'node:assert/strict';

import { startOfDay, endOfDay } from './dateWindow.js';

/**
 * A record written by the app and queried for its own day has to come back.
 *
 * It did not: dates are written with `new Date("22-Oct-2026")`, which parses
 * as local midnight, while the window opened at `new Date("2026-10-22")`,
 * which parses as UTC midnight. East of Greenwich the record landed before
 * the window opened and after the previous day's closed, so it belonged to
 * no day at all.
 */

const within = (stamp, from, to) =>
  stamp >= startOfDay(from) && stamp <= endOfDay(to);

test('a date written the way the app writes it falls on its own day', () => {
  const written = new Date('22-Oct-2026');
  assert.equal(within(written, '2026-10-22', '2026-10-22'), true);
  assert.equal(within(written, '2026-10-21', '2026-10-21'), false);
  assert.equal(within(written, '2026-10-23', '2026-10-23'), false);
});

test('a date written as plain ISO falls on its own day too', () => {
  const written = new Date('2026-10-22');
  assert.equal(within(written, '2026-10-22', '2026-10-22'), true);
});

test('a span covers every day from the first to the last', () => {
  const written = new Date('22-Oct-2026');
  assert.equal(within(written, '2026-10-16', '2026-10-22'), true);
  assert.equal(within(written, '2026-10-16', '2026-10-21'), false);
});

test('the window holds the whole closing day and stops there', () => {
  assert.equal(
    within(new Date(2026, 9, 22, 23, 59, 59, 999), '2026-10-22', '2026-10-22'),
    true,
  );
  assert.equal(
    within(new Date(2026, 9, 23, 0, 0, 0, 0), '2026-10-22', '2026-10-22'),
    false,
  );
});

test('consecutive days meet without a gap or an overlap', () => {
  const firstEnds = endOfDay('2026-10-21').getTime();
  const secondStarts = startOfDay('2026-10-22').getTime();
  assert.equal(secondStarts - firstEnds, 1, 'one millisecond apart');
});

test('a date that names no day is rejected rather than guessed at', () => {
  for (const bad of ['', '   ', 'not a date', null, undefined]) {
    assert.equal(startOfDay(bad), null);
    assert.equal(endOfDay(bad), null);
  }
});
