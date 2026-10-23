import test from 'node:test';
import assert from 'node:assert/strict';

import { coverageRefusal, sortBySerial, usedTotal } from './serialRanges.js';

const range = (serialFrom, serialTo) => ({ serialFrom, serialTo });

test('one row covering the whole link is enough', () => {
    assert.equal(coverageRefusal([range(3601, 6000)], 3601, 6000), null);
});

test('two rows meeting at a production boundary cover the link', () => {
    // 180ml, 48 to a case. Issuances AAA 1-4800 and AAA 4801-9600, so a link
    // of 3601-6000 is held as two runs and two dispatch rows.
    const pieces = [range(3601, 4800), range(4801, 6000)];
    assert.equal(coverageRefusal(pieces, 3601, 6000), null);
});

test('the rows need not arrive in order', () => {
    const pieces = [range(4801, 6000), range(3601, 4800)];
    assert.equal(coverageRefusal(pieces, 3601, 6000), null);
});

test('a gap in the middle is named and refused', () => {
    const pieces = [range(3601, 4800), range(4849, 6000)];
    const refusal = coverageRefusal(pieces, 3601, 6000);
    assert.match(refusal, /4801-4848/);
    assert.match(refusal, /no dispatch record/);
    assert.match(refusal, /supervisor/);
});

test('a missing start is a gap too', () => {
    const refusal = coverageRefusal([range(4801, 6000)], 3601, 6000);
    assert.match(refusal, /3601-4800/);
    assert.match(refusal, /no dispatch record/);
});

test('a short last row leaves the end uncovered', () => {
    const pieces = [range(3601, 4800), range(4801, 5952)];
    const refusal = coverageRefusal(pieces, 3601, 6000);
    assert.match(refusal, /5953-6000/);
});

test('rows counting the same labels twice are refused', () => {
    const pieces = [range(3601, 4800), range(4753, 6000)];
    const refusal = coverageRefusal(pieces, 3601, 6000);
    assert.match(refusal, /4753-4800/);
    assert.match(refusal, /more than one dispatch record/);
});

test('a row reaching past the link is refused', () => {
    const pieces = [range(3601, 4800), range(4801, 6048)];
    const refusal = coverageRefusal(pieces, 3601, 6000);
    assert.match(refusal, /past label 6000/);
});

test('no rows at all says so plainly', () => {
    const refusal = coverageRefusal([], 3601, 6000);
    assert.match(refusal, /No dispatch records were found/);
    assert.match(refusal, /3601-6000/);
});

test('a row with no usable serials is refused, not ignored', () => {
    const pieces = [range(3601, 4800), range(4801, undefined)];
    assert.match(coverageRefusal(pieces, 3601, 6000), /no usable/);
});

test('a link that is not a range is refused before anything else', () => {
    assert.match(coverageRefusal([range(3601, 6000)], 6000, 3601), /not a serial range/);
    assert.match(coverageRefusal([range(3601, 6000)], undefined, 6000), /not a serial range/);
});

test('serials arriving as text are still read as serials', () => {
    const pieces = [range('4801', '6000'), range('3601', '4800')];
    assert.equal(coverageRefusal(pieces, '3601', '6000'), null);
});

test('sorting leaves the caller\'s array alone', () => {
    const pieces = [range(4801, 6000), range(3601, 4800)];
    sortBySerial(pieces);
    assert.equal(pieces[0].serialFrom, 4801);
});

test('used ranges are totalled from what they say', () => {
    assert.equal(usedTotal([{ serialFrom: 3601, serialTo: 4800, total: 1200 }]), 1200);
    assert.equal(usedTotal([]), 0);
});

test('a used range with no total is measured instead', () => {
    assert.equal(usedTotal([{ serialFrom: 4801, serialTo: 6000 }]), 1200);
});
