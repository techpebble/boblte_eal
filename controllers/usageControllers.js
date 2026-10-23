import mongoose from 'mongoose';
import EALUsage from "../models/eal_usages.js";
import EALIssuance from "../models/eal_issuances.js";
import Item from '../models/item.js';
import EALDispatch from '../models/eal_dispatches.js';
import { startOfDay, endOfDay } from '../utils/dateWindow.js';
import { companyScope, companyRefusal } from '../middleware/authMiddleware.js';
import { isManualEntry, manualEntryRefusal } from '../utils/manualEntry.js';



/**
 * Add EAL usage and update corresponding issuance record.
 */
export const addEALUsage = async (req, res) => {
    const userId = req.user.id;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const {
            company,
            dateUsed,
            market,
            item,
            pack,
            prefix,
            serialFrom,
            serialTo,
            usedQuantity,
            usedQuantityInCases
        } = req.body;

        const serialFromNum = parseInt(serialFrom);
        const serialToNum = parseInt(serialTo);

        if (!mongoose.Types.ObjectId.isValid(company) || !mongoose.Types.ObjectId.isValid(item) || !mongoose.Types.ObjectId.isValid(pack)) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid company or item or pack' });
        }

        const refusal = companyRefusal(req, company);
        if (refusal) {
            await session.abortTransaction();
            return res.status(403).json({ message: refusal });
        }

        if (!company || !market || !pack || !item) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Please select all required fields'
            });
        }

        if (!dateUsed || isNaN(new Date(dateUsed))) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Please enter the date correctly'
            });
        }

        if (!/^[A-Z]{3}$/.test(prefix.trim())) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Prefix must be 3 uppercase letters (A-Z)'
            });
        }

        if (!/^\d{10}$/.test(serialFrom)) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Serial From must be a 10-digit number'
            });
        }

        if (!/^\d{10}$/.test(serialTo)) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Serial To must be a 10-digit number'
            });
        }

        if (usedQuantity <= 0 || usedQuantity !== (serialToNum - serialFromNum + 1)) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Quantity Issued and the serial numbers are not matching'
            });
        }

        const itemData = await Item.findById(item).session(session);
        if (!itemData) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Item not found' });
        }
        const bottlesPerCase = itemData.bottlesPerCase;

        if (usedQuantity % bottlesPerCase !== 0 || (serialToNum % bottlesPerCase) !== 0 || ((serialFromNum - 1) % bottlesPerCase) !== 0) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Serial range not divisible by bottles per case.'
            });
        }

        if (parseInt(usedQuantityInCases) !== Math.floor(usedQuantity / bottlesPerCase) || parseInt(usedQuantityInCases) <= 0) {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Used quantity does not match with the produced cases and it should be greater than zero'
            });
        }

        // Find matching issuance (most recent that fits the range and filters)
        const issuance = await EALIssuance.findOne({
            company,
            market,
            pack,
            prefix,
            serialFrom: { $lte: serialFromNum },
            serialTo: { $gte: serialToNum }
        }).sort({ dateIssued: -1 }); // Prefer latest valid issuance

        if (!issuance) {
            await session.abortTransaction();
            return res.status(404).json({
                message: 'Matching EAL Issuance not found'
            });
        }
        // Validate range is within the issued serial range
        if (serialFromNum < issuance.serialFrom || serialToNum > issuance.serialTo) {
            await session.abortTransaction();
            return res.status(400).json({
                message: `Used range [${serialFromNum}-${serialToNum}] is outside issued range [${issuance.serialFrom}-${issuance.serialTo}]`
            });
        }

        // Validate against overlaps with existing used ranges
        for (const usedRange of issuance.usedSerialRanges) {
            const existingFrom = usedRange.serialFrom;
            const existingTo = usedRange.serialTo;

            const overlaps = serialFromNum <= existingTo && existingFrom <= serialToNum;
            if (overlaps) {
                return res.status(400).json({
                    message: `Used range [${serialFromNum}-${serialToNum}] overlaps with already used range [${existingFrom}-${existingTo}]`
                });
            }
        }

        const manual = manualEntryRefusal(req);
        if (manual) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json(manual);
        }

        // Create the EALUsage document
        const usage = await EALUsage.create(
            [{
                company,
                dateUsed,
                market,
                item,
                pack,
                prefix,
                serialFrom: serialFromNum,
                serialTo: serialToNum,
                usedQuantity,
                usedQuantityInCases,
                issuanceId: issuance._id,
                enteredByHand: isManualEntry(req.body),
                createdBy: userId
            }],
            { session }
        );

        // Append this usage range to the issuance's usedSerialRanges
        issuance.usedSerialRanges.push({ serialFrom: serialFromNum, serialTo: serialToNum, total: usedQuantity });
        issuance.balanceQuantity = issuance.balanceQuantity - usedQuantity;

        await issuance.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Usage recorded and issuance updated successfully.',
            data: usage
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error in addEALUsage:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
};

// Get all EAL Usage records with optional filters
export const getAllEALUsage = async (req, res) => {
    try {
        const filter = {};

        // Optional query filters
        if (req.query.startDate && req.query.endDate) {
            filter.dateUsed = {
                $gte: startOfDay(req.query.startDate),
                $lte: endOfDay(req.query.endDate),
            };
        }
        if (req.query.company) filter.company = req.query.company;
        if (req.query.market) filter.market = req.query.market;
        if (req.query.prefix) filter.prefix = req.query.prefix;

        // If query type is 'balance', only include records with balanceQuantityInCases > 0
        if (req.query.type && req.query.type.toLowerCase() === 'balance') {
            filter.balanceQuantityInCases = { $gt: 0 };
        }

        // Without companies:all a person sees only their own company, whatever
        // the query asked for.
        Object.assign(filter, companyScope(req));

        const usage = await EALUsage.find(filter)
            .populate('company', 'name')
            .populate('item', 'name alias')
            .populate('pack', 'name bottlesPerCase')
            .populate('createdBy', 'fullName email')
            .sort({ dateUsed: -1 });

        res.status(200).json({
            count: usage.length,
            data: usage
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch EAL Usage', message: error.message });
    }
};

/**
 * Remove an EAL usage record, but only while none of what it produced has
 * been dispatched.
 *
 * Recording a usage draws the range down from its issuance: the range is
 * added to the issuance's usedSerialRanges and its balanceQuantity falls by
 * the labels used. Removing the usage has to put both back, or the labels are
 * lost from stock with nothing to show where they went — so the whole thing
 * runs in one transaction and is abandoned if any part of it does not add up.
 */
export const deleteEALUsage = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid EAL usage ID' });
        }

        const usage = await EALUsage.findOne({ _id: id, ...companyScope(req) }).session(session);

        if (!usage) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'EAL usage not found' });
        }

        // The caller has to name the range it means to remove. This is what
        // the confirmation box collects: it makes the removal deliberate, and
        // it catches a stale row or an id that moved on between the page
        // loading and the button being pressed.
        const { serialFrom, serialTo } = req.body || {};

        if (serialFrom == null || serialTo == null || serialFrom === '' || serialTo === '') {
            await session.abortTransaction();
            return res.status(400).json({
                message: 'Confirm the serial range to remove this usage'
            });
        }

        if (Number(serialFrom) !== usage.serialFrom || Number(serialTo) !== usage.serialTo) {
            await session.abortTransaction();
            return res.status(400).json({
                message: `The range given does not match this usage. It runs ${usage.prefix}${String(usage.serialFrom).padStart(10, '0')} to ${usage.prefix}${String(usage.serialTo).padStart(10, '0')}.`,
                expected: { serialFrom: usage.serialFrom, serialTo: usage.serialTo },
                received: { serialFrom: Number(serialFrom), serialTo: Number(serialTo) }
            });
        }

        // Three separate things have to agree that nothing has gone out. They
        // should always agree; if they do not, something is already wrong and
        // removing the record would bury it.
        const dispatchLinks = await EALDispatch.countDocuments({ usageId: id }).session(session);
        const usedRanges = usage.usedSerialRanges?.length || 0;
        const producedCases = usage.usedQuantityInCases || 0;
        const waitingCases = usage.balanceQuantityInCases ?? producedCases;
        const dispatchedCases = producedCases - waitingCases;

        if (dispatchLinks > 0 || usedRanges > 0 || dispatchedCases > 0) {
            await session.abortTransaction();
            const reasons = [];
            if (dispatchedCases > 0) reasons.push(`${dispatchedCases} case(s) already dispatched`);
            if (dispatchLinks > 0) {
                reasons.push(`${dispatchLinks} dispatch link${dispatchLinks === 1 ? '' : 's'} against it`);
            }
            if (dispatchedCases <= 0 && dispatchLinks === 0 && usedRanges > 0) {
                reasons.push(`${usedRanges} used range(s) recorded against it`);
            }

            return res.status(400).json({
                message: `This usage cannot be removed: ${reasons.join(', ')}.`,
                dispatchedCases,
                dispatchLinks,
                usedRanges
            });
        }

        // Give the labels back to the issuance they were drawn from.
        const issuance = await EALIssuance.findById(usage.issuanceId).session(session);

        if (!issuance) {
            await session.abortTransaction();
            return res.status(409).json({
                message: 'The issuance this usage was drawn from no longer exists, so the labels cannot be returned to stock'
            });
        }

        const before = issuance.usedSerialRanges.length;
        issuance.usedSerialRanges = issuance.usedSerialRanges.filter(
            (range) => !(range.serialFrom === usage.serialFrom && range.serialTo === usage.serialTo)
        );

        if (issuance.usedSerialRanges.length === before) {
            await session.abortTransaction();
            return res.status(409).json({
                message: 'This range is not recorded as used on its issuance, so the two no longer agree. Removing the usage would make that worse rather than better.'
            });
        }

        const restored = issuance.balanceQuantity + usage.usedQuantity;

        if (restored > issuance.issuedQuantity) {
            await session.abortTransaction();
            return res.status(409).json({
                message: `Returning ${usage.usedQuantity} labels would put the issuance above the ${issuance.issuedQuantity} it was issued`
            });
        }

        issuance.balanceQuantity = restored;
        await issuance.save({ session });
        await EALUsage.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: 'EAL usage removed and the labels returned to stock',
            data: { id, labelsReturned: usage.usedQuantity, issuanceBalance: restored }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Failed to delete EAL usage:', error);
        return res.status(500).json({ message: error.message });
    }
};
