import test from 'node:test';
import assert from 'node:assert/strict';

import { isManualEntry, manualEntryRefusal } from './manualEntry.js';

const person = (...permissions) => ({
    role: { name: 'Field Operator', permissions, isSystem: false }
});

const admin = { role: { name: 'Administrator', permissions: [], isSystem: true } };

test('a scanned range is never refused', () => {
    assert.equal(isManualEntry({}), false);
    assert.equal(manualEntryRefusal({ body: {}, user: person() }), null);
    assert.equal(
        manualEntryRefusal({ body: { enteredByHand: false }, user: person() }),
        null
    );
});

test('a typed range needs the permission', () => {
    const refusal = manualEntryRefusal({
        body: { enteredByHand: true },
        user: person('usage:create')
    });

    assert.match(refusal.message, /scan a label but not type its serial/);
    assert.deepEqual(refusal.required, ['scan:manual']);
    assert.equal(refusal.role, 'Field Operator');
});

test('with the permission, typing is allowed', () => {
    assert.equal(
        manualEntryRefusal({
            body: { enteredByHand: true },
            user: person('usage:create', 'scan:manual')
        }),
        null
    );
});

test('a system role may do it, as it may everything', () => {
    assert.equal(
        manualEntryRefusal({ body: { enteredByHand: true }, user: admin }),
        null
    );
});

test('the flag is read as sent, string or boolean', () => {
    assert.equal(isManualEntry({ enteredByHand: 'true' }), true);
    assert.equal(isManualEntry({ enteredByHand: 'false' }), false);
    assert.equal(isManualEntry({ enteredByHand: 1 }), false);
});
