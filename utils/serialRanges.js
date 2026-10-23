/**
 * Putting a split label range back together.
 *
 * A dispatch note records one link per range an operator picked — AAA
 * 0000003601-0000006000, say. The labels behind it need not come from one
 * place. A production run is recorded against a single issuance, so a range
 * that crosses an issuance boundary is held as two runs, and linking it
 * writes one dispatch row against each while the note still shows the one
 * link.
 *
 * Unlinking therefore has to pick those rows back up and check they are all
 * there before it undoes anything. Half a range returned would leave the
 * note's case count saying one thing and the runs' balances another, with
 * nothing to show which was right.
 */

/** The pieces of a range, lowest serial first. */
export const sortBySerial = (pieces = []) =>
  [...pieces].sort((a, b) => Number(a.serialFrom) - Number(b.serialFrom));

/** How many labels a run's used ranges account for. */
export const usedTotal = (ranges = []) =>
  ranges.reduce((count, range) => {
    const total = Number(range.total);
    if (Number.isFinite(total)) return count + total;
    return count + (Number(range.serialTo) - Number(range.serialFrom) + 1);
  }, 0);

/**
 * Why these pieces cannot be taken as the whole of [from]-[to], or null when
 * they can. They have to run end to end: start at from, finish at to, and
 * meet one another with no gap and nothing counted twice.
 *
 * The sentences go back to the apps as they are, so each one says which
 * labels are at fault and what to do about it.
 */
export const coverageRefusal = (pieces, from, to) => {
  const start = Number(from);
  const end = Number(to);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    return `[${from}-${to}] is not a serial range.`;
  }

  const ordered = sortBySerial(pieces).map((piece) => ({
    serialFrom: Number(piece.serialFrom),
    serialTo: Number(piece.serialTo)
  }));

  if (!ordered.length) {
    return `No dispatch records were found for labels ${start}-${end}.`;
  }

  const checkWith = 'so the range cannot be unlinked. Ask a supervisor to check it.';
  let expected = start;

  for (const piece of ordered) {
    if (!Number.isInteger(piece.serialFrom) || !Number.isInteger(piece.serialTo) ||
        piece.serialFrom > piece.serialTo) {
      return `A dispatch record for labels ${start}-${end} has no usable ` +
        `serial range, ${checkWith}`;
    }

    if (piece.serialFrom > expected) {
      return `Labels ${expected}-${piece.serialFrom - 1} of ${start}-${end} ` +
        `have no dispatch record, ${checkWith}`;
    }

    if (piece.serialFrom < expected) {
      const until = Math.min(piece.serialTo, expected - 1);
      return `Labels ${piece.serialFrom}-${until} of ${start}-${end} appear ` +
        `in more than one dispatch record, ${checkWith}`;
    }

    expected = piece.serialTo + 1;
  }

  if (expected <= end) {
    return `Labels ${expected}-${end} of ${start}-${end} have no dispatch ` +
      `record, ${checkWith}`;
  }

  if (expected > end + 1) {
    return `A dispatch record reaches past label ${end}, ${checkWith}`;
  }

  return null;
};
