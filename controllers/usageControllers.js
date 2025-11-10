import mongoose from 'mongoose';
import EALUsage from "../models/eal_usages.js";
import EALIssuance from "../models/eal_issuances.js";
import Item from '../models/item.js';



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
                $gte: new Date(req.query.startDate),
                $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999)), // include full day
            };
        }
        if (req.query.company) filter.company = req.query.company;
        if (req.query.market) filter.market = req.query.market;
        if (req.query.prefix) filter.prefix = req.query.prefix;

        // If query type is 'balance', only include records with balanceQuantityInCases > 0
        if (req.query.type && req.query.type.toLowerCase() === 'balance') {
            filter.balanceQuantityInCases = { $gt: 0 };
        }

        const usage = await EALUsage.find(filter)
            .populate('company', 'name')
            .populate('item', 'name')
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