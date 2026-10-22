/**
 * Telling a bad token apart from a server that cannot answer.
 *
 * The sign-in check does two things in one try block: it verifies the token,
 * then it reads the person out of the database. Both failures used to come
 * back as 401 "Not authorised, token failed", and the app signs a person out
 * on any 401 — so an unreachable database, or a database user without
 * permission to read the records, threw every operator back to the login
 * screen mid-shift with a message about their token, which was fine.
 *
 * A token the server cannot trust is 401. Anything else is the server's own
 * problem: 503, which the app reports without ending the session.
 */
const TOKEN_ERRORS = [
    'JsonWebTokenError',   // malformed, or signed with another secret
    'TokenExpiredError',
    'NotBeforeError'
];

export const isTokenError = (error) => TOKEN_ERRORS.includes(error?.name);

/** Mongoose and the driver both name their errors Mongo-something. */
export const isDatabaseError = (error) =>
    typeof error?.name === 'string' && error.name.startsWith('Mongo');

/**
 * The same answer for a route that is not behind the sign-in check, where
 * "you are still signed in" would make no sense - login, most of all, which
 * reads the database before anyone has a session at all.
 */
export const DATABASE_UNAVAILABLE =
    'The server cannot reach its records at the moment. Try again shortly.';

export const authFailure = (error) => {
    if (isTokenError(error)) {
        return { status: 401, body: { message: 'Not authorised, token failed' } };
    }

    return {
        status: 503,
        body: {
            message: 'The server cannot reach its records at the moment. ' +
                'You are still signed in; try again shortly.'
        }
    };
};
