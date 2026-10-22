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

/** One step forward, and the one step back that is allowed. */
const FORWARD = {
    draft: 'final',
    final: 'loaded',
    loaded: 'dispatched',
    dispatched: 'delivered'
};

const clean = (value) => String(value ?? '').toLowerCase().trim();

/** Lines whose cases are not all covered by linked labels. */
const shortLinesOf = (dispatch) =>
    (dispatch?.items ?? []).filter(
        (i) => (i.EALIssuedQuantity || 0) + 1e-6 < i.quantityInCases
    );

/**
 * Why `dispatch` may not move to `nextStatus`, or null when it may.
 *
 * The body is returned ready to send with a 400, keeping the shape the
 * status endpoint already answered with, so anything reading `error`,
 * `shortfallInCases` or `lines` still finds them.
 */
export const transitionRefusal = (dispatch, nextStatus) => {
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

    return { error: `Invalid status transition from '${from}' to '${to}'` };
};
