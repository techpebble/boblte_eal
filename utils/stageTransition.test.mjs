import test from 'node:test';
import assert from 'node:assert/strict';

import { transitionRefusal, DISPATCH_STAGES } from './stageTransition.js';

const note = (status, items = [], linkedTotal = 0) => ({
    status,
    items,
    EALIssuedTotalQuantity: linkedTotal
});

const covered = [{ item: 'a', quantityInCases: 100, EALIssuedQuantity: 100 }];
const short = [
    { item: 'a', quantityInCases: 100, EALIssuedQuantity: 90 },
    { item: 'b', quantityInCases: 50, EALIssuedQuantity: 50 }
];

test('one step forward is allowed at each stage', () => {
    assert.equal(transitionRefusal(note('draft'), 'final'), null);
    assert.equal(transitionRefusal(note('final', covered), 'loaded'), null);
    assert.equal(transitionRefusal(note('loaded'), 'dispatched'), null);
    assert.equal(transitionRefusal(note('dispatched'), 'delivered'), null);
});

test('staying put is not a move', () => {
    // The vehicle route sends the current stage alongside the driver and
    // the lorry when only those changed. Refusing that would make the
    // details unsaveable.
    for (const stage of DISPATCH_STAGES) {
        assert.equal(
            transitionRefusal(note(stage), stage),
            null,
            `${stage} -> ${stage} should be allowed`
        );
    }
});

test('skipping a stage is refused', () => {
    assert.match(
        transitionRefusal(note('draft'), 'delivered').error,
        /Invalid status transition from 'draft' to 'delivered'/
    );
    assert.ok(transitionRefusal(note('draft'), 'loaded'));
    assert.ok(transitionRefusal(note('final', covered), 'dispatched'));
});

test('loaded is refused while any line is short, and says by how much', () => {
    const refusal = transitionRefusal(note('final', short), 'loaded');

    assert.match(refusal.error, /Cannot mark as loaded/);
    assert.equal(refusal.shortfallInCases, 10);
    assert.equal(refusal.lines.length, 1);
    assert.equal(refusal.lines[0].shortfallInCases, 10);
});

test('back to draft only while nothing is linked', () => {
    assert.equal(transitionRefusal(note('final', [], 0), 'draft'), null);

    const refusal = transitionRefusal(note('final', [], 240), 'draft');
    assert.match(refusal.error, /labels are already linked/);
});

test('going backwards anywhere else is refused', () => {
    assert.ok(transitionRefusal(note('loaded'), 'final'));
    assert.ok(transitionRefusal(note('delivered'), 'dispatched'));
    assert.ok(transitionRefusal(note('dispatched'), 'draft'));
});

test('a status the app has never heard of is refused', () => {
    assert.match(
        transitionRefusal(note('final'), 'shipped').error,
        /Invalid status\. Allowed:/
    );
    assert.ok(transitionRefusal(note('final'), undefined));
    assert.ok(transitionRefusal(note('final'), ''));
});

test('case and padding do not get a note past the rules', () => {
    assert.equal(transitionRefusal(note('Draft'), ' FINAL '), null);
    assert.ok(transitionRefusal(note('Draft'), 'Loaded'));
});
