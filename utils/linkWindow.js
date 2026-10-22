/**
 * When a dispatch note's labels may be changed.
 *
 * Only while the note is `final`. A draft is still being written — its lines
 * and quantities can change, so labels linked against them would be linked
 * against numbers that no longer hold. And once it is `loaded` the quantities
 * have been checked and the lorry is being filled, so pulling a label off
 * would leave the note saying something the load does not.
 *
 * `final` is the one stage in between, and the server already treats it that
 * way at the other end: a note cannot move to `loaded` until every line is
 * covered.
 */
export const LINKABLE_STATUS = 'final';

/** Stages a note has passed through by the time it is loaded. */
const AFTER_LINKING = ['loaded', 'dispatched', 'delivered'];

/**
 * The sentence to send back when labels may not be changed, or null when
 * they may. The mobile app shows these as they come, so each says what the
 * note's stage is and what to do about it.
 */
export const linkRefusal = (status, { unlinking = false } = {}) => {
  const stage = String(status ?? '').toLowerCase().trim();
  if (stage === LINKABLE_STATUS) return null;

  const act = unlinking ? 'unlinked' : 'linked';

  if (stage === 'draft') {
    return `Labels cannot be ${act} while this dispatch is a draft. ` +
      'Mark it Final first, once its lines and quantities are settled.';
  }

  if (AFTER_LINKING.includes(stage)) {
    const past = stage === 'loaded' ? 'loaded' : stage;
    return `This dispatch has already been ${past}, so its labels cannot ` +
      `be ${act}.`;
  }

  return `Labels can only be ${act} while a dispatch is Final.`;
};
