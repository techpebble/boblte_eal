import EALUsage from "../models/eal_usages.js";
import EALIssuance from "../models/eal_issuances.js";
import Dispatch from "../models/dispatch.js";
import EALDispatch from "../models/eal_dispatches.js";
import { companyScope } from "../middleware/authMiddleware.js";

/**
 * Where one label has been.
 *
 * A serial on its own does not name a label. A three-letter prefix is reused
 * across packs and the ranges under it overlap, so the same ten digits can sit
 * in two issuances of different pack sizes. The old answer to that was to run
 * one query per collection on prefix-and-serial and hand back four flat lists,
 * which mixed the two labels' histories together with nothing saying which row
 * belonged to which — and, without a prefix typed, mixed in other products too.
 *
 * So: find the issuances the serial could belong to first. One, and we trace
 * it. More than one, and the caller is asked which, because only they can see
 * the bottle in their hand. Then every later stage is read from the stage
 * before it — the usage by its issuanceId, the dispatch by its usageId — which
 * is how the records are actually joined, and the only way the answer can be
 * about one label.
 */

/** "NRK2048325000" or "2048325000" — the prefix is optional. */
const readQuery = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return { error: 'Enter an EAL serial.' };

    const match = text.match(/^([a-zA-Z]{1,5})?\s*(\d{1,12})$/);
    if (!match) {
        return { error: 'An EAL is three letters and ten digits, for example NRK2048325000.' };
    }

    return {
        prefix: match[1] ? match[1].toUpperCase() : null,
        serial: Number(match[2])
    };
};

const candidateOf = (issuance) => ({
    id: issuance._id,
    prefix: issuance.prefix,
    pack: issuance.pack,
    company: issuance.company,
    market: issuance.market,
    dateIssued: issuance.dateIssued,
    serialFrom: issuance.serialFrom,
    serialTo: issuance.serialTo,
    issuedQuantity: issuance.issuedQuantity,
    balanceQuantity: issuance.balanceQuantity
});

export const getEALData = async (req, res) => {
    try {
        const { prefix, serial, error } = readQuery(req.query.ealNumber);
        if (error) return res.status(400).json({ error });

        const holdsSerial = { serialFrom: { $lte: serial }, serialTo: { $gte: serial } };

        // Step 1 — which issuances could this label have come from?
        const candidates = await EALIssuance.find({
            ...companyScope(req),
            ...(prefix ? { prefix } : {}),
            ...(req.query.market ? { market: req.query.market } : {}),
            ...holdsSerial
        })
            .populate('company', 'name code')
            .populate('pack', 'name bottlesPerCase')
            .populate('createdBy', 'fullName email')
            .sort({ dateIssued: -1 });

        if (candidates.length === 0) {
            return res.status(404).json({
                error: prefix
                    ? `No issuance of ${prefix} holds serial ${serial}.`
                    : `No issuance holds serial ${serial}.`,
                serial,
                prefix
            });
        }

        // Step 2 — more than one, and only the person holding the bottle can
        // say which. Unless they have already told us.
        const chosenId = req.query.issuanceId;
        const chosen = chosenId
            ? candidates.find((entry) => String(entry._id) === String(chosenId))
            : candidates.length === 1
                ? candidates[0]
                : null;

        if (!chosen) {
            if (chosenId) {
                return res.status(400).json({
                    error: 'That issuance does not hold this serial.',
                    serial,
                    candidates: candidates.map(candidateOf)
                });
            }
            return res.status(200).json({
                serial,
                prefix: prefix ?? null,
                needsChoice: true,
                candidates: candidates.map(candidateOf)
            });
        }

        // Step 3 — the chain. Each stage comes from the one before it.
        const usages = await EALUsage.find({ issuanceId: chosen._id, ...holdsSerial })
            .populate('item', 'name alias')
            .populate('pack', 'name bottlesPerCase')
            .populate('createdBy', 'fullName email')
            .sort({ dateUsed: 1 });

        const ealDispatches = usages.length > 0
            ? await EALDispatch.find({ usageId: { $in: usages.map((u) => u._id) }, ...holdsSerial })
                .populate('item', 'name alias')
                .populate('createdBy', 'fullName email')
                .sort({ dateDispatched: 1 })
            : [];

        const noteIds = [...new Set(ealDispatches.map((d) => String(d.dispatchId)).filter(Boolean))];
        const notes = noteIds.length > 0
            ? await Dispatch.find({ _id: { $in: noteIds } })
                .populate('company', 'name code')
                .populate('deliveryTo', 'name')
            : [];

        const noteById = Object.fromEntries(notes.map((note) => [String(note._id), note]));

        // Where the label is now, read off the furthest stage it has reached.
        const note = ealDispatches.length > 0 ? noteById[String(ealDispatches[0].dispatchId)] : null;
        const state = note
            ? (note.status === 'delivered' ? 'delivered' : note.status === 'dispatched' ? 'in-transit' : 'linked')
            : usages.length > 0 ? 'applied' : 'on-hand';

        return res.status(200).json({
            serial,
            prefix: chosen.prefix,
            state,
            // Kept so the caller can offer a way back to the choice it made.
            candidates: candidates.length > 1 ? candidates.map(candidateOf) : [],
            issuance: {
                ...candidateOf(chosen),
                usedSerialRanges: chosen.usedSerialRanges,
                createdBy: chosen.createdBy,
                createdAt: chosen.createdAt
            },
            usage: usages.map((entry) => ({
                id: entry._id,
                dateUsed: entry.dateUsed,
                item: entry.item,
                pack: entry.pack,
                prefix: entry.prefix,
                serialFrom: entry.serialFrom,
                serialTo: entry.serialTo,
                usedQuantity: entry.usedQuantity,
                usedQuantityInCases: entry.usedQuantityInCases,
                balanceQuantityInCases: entry.balanceQuantityInCases,
                createdBy: entry.createdBy
            })),
            ealDispatches: ealDispatches.map((entry) => ({
                id: entry._id,
                dateDispatched: entry.dateDispatched,
                item: entry.item,
                prefix: entry.prefix,
                serialFrom: entry.serialFrom,
                serialTo: entry.serialTo,
                usedQuantity: entry.usedQuantity,
                usedQuantityInCases: entry.usedQuantityInCases,
                createdBy: entry.createdBy,
                dispatchId: entry.dispatchId,
                note: noteById[String(entry.dispatchId)] || null
            }))
        });
    } catch (error) {
        console.error('Failed to trace an EAL:', error);
        return res.status(500).json({ error: 'Failed to fetch EAL data', message: error.message });
    }
};
