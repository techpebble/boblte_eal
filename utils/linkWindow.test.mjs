import test from 'node:test';
import assert from 'node:assert/strict';

import { linkRefusal, LINKABLE_STATUS } from './linkWindow.js';

test('a final note may be linked and unlinked', () => {
    assert.equal(linkRefusal('final'), null);
    assert.equal(linkRefusal('final', { unlinking: true }), null);
    assert.equal(LINKABLE_STATUS, 'final');
});

test('a draft may not: its lines can still change under the labels', () => {
    const refusal = linkRefusal('draft');
    assert.match(refusal, /draft/i);
    assert.match(refusal, /Mark it Final first/);
});

test('once loaded, the labels are settled', () => {
    for (const stage of ['loaded', 'dispatched', 'delivered']) {
        assert.ok(linkRefusal(stage), `${stage} should be refused`);
        assert.match(linkRefusal(stage), /already been/);
    }
});

test('unlinking says unlinked, not linked', () => {
    assert.match(linkRefusal('draft', { unlinking: true }), /unlinked/);
    assert.match(linkRefusal('draft'), /\blinked\b/);
});

test('case and padding do not get a note past the rule', () => {
    assert.equal(linkRefusal(' Final '), null);
    assert.equal(linkRefusal('FINAL'), null);
    assert.ok(linkRefusal('Draft'));
});

test('a status the app has never heard of is refused, not allowed', () => {
    assert.ok(linkRefusal(undefined));
    assert.ok(linkRefusal(null));
    assert.ok(linkRefusal(''));
    assert.ok(linkRefusal('something-else'));
});
