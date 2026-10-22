import test from 'node:test';
import assert from 'node:assert/strict';

import { MASTERDATA_READERS, PERMISSION_KEYS, BUILT_IN_ROLES } from '../config/permissions.js';
import { can } from '../config/roleHelpers.js';

const role = (permissions, isSystem = false) => ({ role: { permissions, isSystem } });
const mayRead = (user) => MASTERDATA_READERS.some((key) => can(user, key));

test('every key in the list is a real permission', () => {
    for (const key of MASTERDATA_READERS) {
        assert.ok(PERMISSION_KEYS.includes(key), `${key} is not a permission`);
    }
});

test('a role that may record may read what it records against', () => {
    // The Demo Role on this server: usage:create and nothing of masterdata.
    // It could open the production screen and then be refused the items.
    assert.ok(mayRead(role(['usage:create'])));
    assert.ok(mayRead(role(['issuance:create'])));
    assert.ok(mayRead(role(['dispatch:create'])));
});

test('managing master data implies reading it', () => {
    assert.ok(mayRead(role(['masterdata:manage'])));
});

test('a role with neither still may not', () => {
    assert.equal(mayRead(role(['dispatch:view', 'dispatch:link'])), false);
    assert.equal(mayRead(role([])), false);
});

test('the built-in roles can all read what they record against', () => {
    for (const built of BUILT_IN_ROLES) {
        const user = role(built.permissions, built.isSystem);
        const records = ['issuance:create', 'usage:create', 'dispatch:create']
            .some((key) => can(user, key));
        if (records) {
            assert.ok(mayRead(user), `${built.name} cannot read master data`);
        }
    }
});
