/**
 * Serials that were typed rather than scanned.
 *
 * A scan reads the number off the label; typing it is where a transposed
 * digit becomes a real serial belonging to somebody else's run. So the app
 * says which it was, the record keeps it, and a role without scan:manual is
 * refused — the refusal lives here rather than in three controllers, since
 * issuance, production and dispatch all take serials the same way.
 */
import { can } from '../config/roleHelpers.js';

/** Whether this request claims a hand-typed serial. */
export const isManualEntry = (body = {}) =>
    body.enteredByHand === true || body.enteredByHand === 'true';

/**
 * Why a hand-typed serial may not be recorded, or null when it may.
 *
 * Scanning is always allowed: this only ever refuses the typed kind.
 */
export const manualEntryRefusal = (req) => {
    if (!isManualEntry(req.body)) return null;
    if (can(req.user, 'scan:manual')) return null;

    const role = req.user?.role?.name;

    return {
        message: `${role ? `${role} may` : 'You may'} scan a label but not `
            + 'type its serial. Scan the first and last labels of the range, '
            + 'or ask someone who may type them.',
        required: ['scan:manual'],
        role: role ?? null
    };
};
