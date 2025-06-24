import EALDispatch from "../models/eal_dispatches.js";
import EALUsage from "../models/eal_usages.js";
import mongoose from 'mongoose';

/**
 * Add EAL dispatch and update corresponding issuance record.
 */
export const addEALDispatch = async (req, res) => {
    const userId = req.user.id;
    const session = await mongoose.startSession();

    try {
      const {
        company,
        dateDispatched,
        market,
        item,
        pack,
        dispatchedQuantity,
        prefix,
        serialFrom,
        serialTo,
        usedQuantity
      } = req.body;

      session.startTransaction();

      // Step 1: Find matching usage documents
      const usages = await EALUsage.find({
        company,
        market,
        item,
        pack,
        prefix,
        serialTo: { $gte: serialFrom },
        serialFrom: { $lte: serialTo },
        balanceQuantity: { $gt: 0 }
      })
        .sort({ serialFrom: 1 })
        .session(session);

      if (!usages.length) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: 'No valid usage records found for the dispatch range.' });
      }

      let remaining = usedQuantity;
      let currentFrom = serialFrom;
      const dispatches = [];

      for (const usage of usages) {
        if (remaining <= 0) break;

        const usageRangeFrom = Math.max(currentFrom, usage.serialFrom);
        const usageRangeTo = Math.min(serialTo, usage.serialTo);

        if (usageRangeFrom > usageRangeTo) continue;

        const available = usageRangeTo - usageRangeFrom + 1;

        // Check for overlap with existing usedSerialRanges
        for (const used of usage.usedSerialRanges) {
          const overlaps =
            usageRangeFrom <= used.serialTo && used.serialFrom <= usageRangeTo;

          if (overlaps) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              error: `Serial range [${usageRangeFrom}-${usageRangeTo}] overlaps with used range [${used.serialFrom}-${used.serialTo}] in usage ID: ${usage._id}`
            });
          }
        }

        const toUse = Math.min(available, remaining);
        const thisSerialTo = usageRangeFrom + toUse - 1;

        // Step 2: Save dispatch record
        const dispatch = new EALDispatch({
          company,
          dateDispatched,
          market,
          item,
          pack,
          dispatchedQuantity,
          prefix,
          serialFrom: usageRangeFrom,
          serialTo: thisSerialTo,
          usedQuantity: toUse,
          usageId: usage._id,
          createdBy: userId
        });
        await dispatch.save({ session });
        dispatches.push(dispatch);

        // Step 3: Update EALUsage
        usage.usedSerialRanges.push({
          serialFrom: usageRangeFrom,
          serialTo: thisSerialTo,
          total: toUse
        });
        usage.balanceQuantity -= toUse;
        await usage.save({ session });

        remaining -= toUse;
        currentFrom = thisSerialTo + 1;
      }

      if (remaining > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: `Could not fully dispatch the requested serial range. ${remaining} labels remain unallocated.`
        });
      }

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: 'EAL Dispatch successfully created with full transaction.',
        data: dispatches
      });

    } catch (error) {
       await session.abortTransaction();
      session.endSession();
      console.error('Transaction failed:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }

};

/**
 * Get all EAL Issuance records with optional filters
 */
export const getAllEALDispatch = async (req, res) => {
  try {
    const filter = {};

    // Optional query filters
    if (req.query.company) filter.company = req.query.company;
    if (req.query.market) filter.market = req.query.market;
    if (req.query.prefix) filter.prefix = req.query.prefix;

    const dispatches = await EALDispatch.find(filter)
      // .populate('company', 'name')
      // .populate('pack', 'name')
      // .populate('createdBy', 'fullName email')
      .sort({ dateIssued: -1 });

    res.status(200).json(dispatches);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch EAL Dispatches', message: error.message });
  }
};
