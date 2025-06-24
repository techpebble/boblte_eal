import EALIssuance from "../models/eal_issuances.js";
import mongoose from 'mongoose';

/**
 * Add EAL issuance and generate EAL labels
 */
export const addEALIssuance = async (req, res) => {
  const session = await mongoose.startSession();
  const userId = req.user.id;

  try {
    session.startTransaction();
    const {
        company,
        dateIssued,
        market,
        pack,
        prefix,
        serialFrom,
        serialTo,
        issuedQuantity
    } = req.body;

    if (!company.trim()) {
      return res.status(400).json({
        error: 'Please select a Company'
      });
    }

    if (!market.trim()) {
      return res.status(400).json({
        error: 'Please select a Market'
      });
    }

    if (!dateIssued.trim() || new Date(dateIssued) > new Date()) {
      return res.status(400).json({
        error: 'Please enter the date correctly'
      });
    }

    if (!pack.trim()) {
      return res.status(400).json({
        error: 'Please select a Pack'
      });
    }

    if (!/^[A-Z]{3}$/.test(prefix.trim())) {
      return res.status(400).json({
        error: '"Prefix" must be 3 uppercase letters (A-Z)'
      });
    }

    if (!/^\d{10}$/.test(serialFrom)) {
      return res.status(400).json({
        error: '"Serial From" must be a 10-digit number'
      });
    }

    if (!/^\d{10}$/.test(serialTo)) {
      return res.status(400).json({
        error: '"Serial To" must be a 10-digit number'
      });
    }

    if (issuedQuantity <= 0) {
      return res.status(400).json({
        error: 'Issued Quantity should be greater than "0"'
      });
    }

    // Calculate issued quantity
    if (Number(issuedQuantity) !== (serialTo - serialFrom + 1)) {
      await session.abortTransaction();
      return res.status(400).json({
        error: '"issuedQuantity" and the serials are not matching'
      });
    }

    // Check for existing overlapping issuance
    const overlappingIssuance = await EALIssuance.findOne({
      company,
      market,
      pack,
      prefix,
      $or: [
        {
          serialFrom: { $lte: serialTo },
          serialTo: { $gte: serialFrom }
        }
      ]
    }).session(session);

    if (overlappingIssuance) {
      await session.abortTransaction();
      return res.status(400).json({
        error: `Serial range [${serialFrom}-${serialTo}] with prefix "${prefix}" overlaps with an existing issuance from ${overlappingIssuance.serialFrom} to ${overlappingIssuance.serialTo}.`
      });
    }

    // Create new issuance
    const issuance = new EALIssuance({
        company,
        dateIssued,
        market,
        pack,
        prefix,
        serialFrom,
        serialTo,
        issuedQuantity,
        createdBy: userId
    });

    const savedIssuance = await issuance.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: 'EAL issuance recorded successfully',
      data: savedIssuance
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Transaction failed:', error);
    res.status(500).json({ error: error.message || 'Server Error' });
  }

};

/**
 * Get all EAL Issuance records with optional filters
 */
export const getAllEALIssuances = async (req, res) => {
  try {
    const filter = {};

    // Optional query filters
    if (req.query.startDate && req.query.endDate) {
      filter.dateIssued = {
          $gte: new Date(req.query.startDate),
          $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999)), // include full day
      };
    }
    if (req.query.company) filter.company = req.query.company;
    if (req.query.market) filter.market = req.query.market;
    if (req.query.prefix) filter.prefix = req.query.prefix;

    const issuances = await EALIssuance.find(filter)
      .populate('company', 'name')
      .populate('pack', 'name bottlesPerCase')
      .populate('createdBy', 'fullName email')
      .sort({ dateIssued: -1 });

    res.status(200).json({
        count: issuances.length,
        data: issuances
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch EAL Issuances', message: error.message });
  }
};
