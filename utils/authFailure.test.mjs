import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import {
    authFailure,
    isTokenError,
    isDatabaseError,
    DATABASE_UNAVAILABLE
} from './authFailure.js';

/** What jwt.verify actually throws, rather than a hand-made stand-in. */
const verifyError = (token, secret) => {
    try {
        jwt.verify(token, secret);
        return null;
    } catch (error) {
        return error;
    }
};

test('a token signed with another secret is the holder\'s problem: 401', () => {
    const error = verifyError(jwt.sign({ id: 'u1' }, 'old-secret'), 'new-secret');

    assert.ok(isTokenError(error));
    assert.equal(authFailure(error).status, 401);
    assert.match(authFailure(error).body.message, /token failed/);
});

test('a token that has run out, and one that is not a token at all', () => {
    const expired = verifyError(
        jwt.sign({ id: 'u1' }, 's', { expiresIn: -10 }),
        's'
    );
    assert.equal(authFailure(expired).status, 401);
    assert.equal(authFailure(verifyError('not-a-token', 's')).status, 401);
});

test('a database that will not answer is the server\'s problem: 503', () => {
    // What Mongoose throws when the connection is down, and what Atlas
    // sends when the database user may not read the collection.
    const buffering = Object.assign(
        new Error('Operation `users.findOne()` buffering timed out after 10000ms'),
        { name: 'MongooseError' }
    );
    const refused = Object.assign(
        new Error('user is not allowed to do action [find] on [boblte.users]'),
        { name: 'MongoServerError', code: 8000 }
    );

    for (const error of [buffering, refused, new Error('anything else')]) {
        assert.equal(authFailure(error).status, 503, error.name);
        assert.match(authFailure(error).body.message, /still signed in/);
    }
});

test('nothing at all is not read as a bad token', () => {
    assert.equal(authFailure(undefined).status, 503);
    assert.equal(isTokenError(undefined), false);
});

test('login tells them the records are out of reach, not "bad auth"', () => {
    // Not behind the sign-in check, so the sentence leaves out the half
    // about still being signed in.
    const refused = Object.assign(
        new Error('user is not allowed to do action [find] on [boblte.users]'),
        { name: 'MongoServerError' }
    );

    assert.ok(isDatabaseError(refused));
    assert.match(DATABASE_UNAVAILABLE, /Try again shortly/);
    assert.ok(!DATABASE_UNAVAILABLE.includes('signed in'));

    assert.equal(isDatabaseError(new Error('something else')), false);
    assert.equal(isDatabaseError(undefined), false);
});
