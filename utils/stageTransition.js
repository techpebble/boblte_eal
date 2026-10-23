/**
 * How a dispatch note may move through its stages.
 *
 * These rules lived inside the status endpoint, so the one other route that
 * writes `status` — the vehicle details route the mobile app saves through —
 * wrote whatever it was handed. A note could be moved from draft straight to
 * delivered, or marked loaded with lines still short, by going the other way
 * round. The rules belong in one place that both call.
 */
export const DISPATCH_STAGES = [
    'draft',
    'final',
    'loaded',
    'dispatched',
    'delivered'
];

/** One step forward. */
const FORWARD = {
    draft: 'final',
    final: 'loaded',
    loaded: 'dispatched',
    dispatched: 'delivered'
};

/**
 * One step back, for when a note was moved on too soon: the lorry had not
 * left, the depot had not signed, the labels went on the wrong note. A stage
 * is undone one at a time, the same way it was reached, so a delivered note
 * cannot drop straight back to final without passing the stages between.
 *
 * Only `final` → `draft` carries a condition, because going back that far
 * reopens the lines themselves and labels linked against the old ones would
 * be linked against quantities that no longer hold.
 */
const BACKWARD = {
    final: 'draft',
    loaded: 'final',
    dispatched: 'loaded',
    delivered: 'dispatched'
};

const clean = (value) => String(value ?? '').toLowerCase().trim();

/**
 * Whether moving from one stage to another is undoing rather than going on.
 * A stage this app does not know is neither, so a typo reads as an invalid
 * status rather than as an attempt to reverse.
 */
export const isBackward = (from, to) => {
    const at = DISPATCH_STAGES.indexOf(clean(from));
    const going = DISPATCH_STAGES.indexOf(clean(to));
    return at !== -1 && going !== -1 && going < at;
};

/** Lines whose cases are not all covered by linked labels. */
const shortLinesOf = (dispatch) =>
    (dispatch?.items ?? []).filter(
        (i) => (i.EALIssuedQuantity || 0) + 1e-6 < i.quantityInCases
    );

/**
 * Why `dispatch` may not move to `nextStatus`, or null when it may.
 *
 * `allowBack` opens the one-step-back moves. It is off by default so that a
 * route which writes `status` in passing cannot undo a stage; the status
 * endpoint turns it on, because undoing a stage is what it was asked to do.
 *
 * The body is returned ready to send with a 400, keeping the shape the
 * status endpoint already answered with, so anything reading `error`,
 * `shortfallInCases` or `lines` still finds them.
 */
export const transitionRefusal = (dispatch, nextStatus, { allowBack = false } = {}) => {
    const from = clean(dispatch?.status);
    const to = clean(nextStatus);

    if (!DISPATCH_STAGES.includes(to)) {
        return { error: `Invalid status. Allowed: ${DISPATCH_STAGES.join(', ')}` };
    }

    // Staying put is not a move. The app sends the current stage alongside
    // the vehicle and driver when only those have changed, and refusing
    // that would make the details unsaveable.
    if (from === to) return null;

    if (from === 'final' && to === 'loaded') {
        const short = shortLinesOf(dispatch);
        if (short.length === 0) return null;

        const shortfallInCases = short.reduce(
            (sum, i) => sum + (i.quantityInCases - (i.EALIssuedQuantity || 0)),
            0
        );

        return {
            error: `Cannot mark as loaded: ${shortfallInCases} case(s) across ${short.length} line(s) have no EAL linked.`,
            shortfallInCases,
            lines: short.map((i) => ({
                item: i.item,
                quantityInCases: i.quantityInCases,
                EALIssuedQuantity: i.EALIssuedQuantity || 0,
                shortfallInCases: i.quantityInCases - (i.EALIssuedQuantity || 0)
            }))
        };
    }

    // Back to draft while nothing is linked: the note has not been acted on
    // yet, so there is nothing to undo.
    if (from === 'final' && to === 'draft') {
        if ((dispatch?.EALIssuedTotalQuantity || 0) === 0) return null;

        return {
            error: 'This dispatch cannot go back to draft: labels are already ' +
                'linked to it. Unlink them first, or ask a supervisor.'
        };
    }

    if (FORWARD[from] === to) return null;

    // Going back is its own act, asked for in those words, so only the route
    // whose whole job is the stage may do it. Saving the vehicle details must
    // not walk a note backwards as a side effect of saving a lorry number.
    if (DISPATCH_STAGES.indexOf(to) < DISPATCH_STAGES.indexOf(from)) {
        if (!allowBack) {
            return { error: `Invalid status transition from '${from}' to '${to}'` };
        }
        if (BACKWARD[from] === to) return null;
        return {
            error: `A dispatch goes back one stage at a time. Move it to ` +
                `'${BACKWARD[from]}' first.`
        };
    }

    return { error: `Invalid status transition from '${from}' to '${to}'` };
};
