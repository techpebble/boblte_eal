import EALIssuance from "../models/eal_issuances.js";
import EALUsage from "../models/eal_usages.js";
import Pack from "../models/pack.js";
import mongoose from 'mongoose';
import { startOfDay, endOfDay } from '../utils/dateWindow.js';

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
        message: 'Please select a Company'
      });
    }

    if (!market.trim()) {
      return res.status(400).json({
        message: 'Please select a Market'
      });
    }

    if (!dateIssued.trim()) {
      return res.status(400).json({
        message: 'Please enter the date correctly'
      });
    }

    if (!pack.trim()) {
      return res.status(400).json({
        message: 'Please select a Pack'
      });
    }

    if (!/^[A-Z]{3}$/.test(prefix.trim())) {
      return res.status(400).json({
        message: '"Prefix" must be 3 uppercase letters (A-Z)'
      });
    }

    if (!/^\d{10}$/.test(serialFrom)) {
      return res.status(400).json({
        message: '"Serial From" must be a 10-digit number'
      });
    }

    if (!/^\d{10}$/.test(serialTo)) {
      return res.status(400).json({
        message: '"Serial To" must be a 10-digit number'
      });
    }

    if (issuedQuantity <= 0) {
      return res.status(400).json({
        message: 'Issued Quantity should be greater than "0"'
      });
    }

    // Calculate issued quantity
    if (Number(issuedQuantity) !== (serialTo - serialFrom + 1)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: '"issuedQuantity" and the serials are not matching'
      });
    }

    // A range has to come out as whole cases. Labels that leave a part case
    // can never be fully drawn down, because usage and dispatch both insist on
    // whole cases, so the remainder would sit in stock for good.
    const packData = await Pack.findById(pack).session(session);

    if (!packData) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Pack not found' });
    }

    const bottlesPerCase = packData.bottlesPerCase;
    const labels = Number(issuedQuantity);

    if (!bottlesPerCase || bottlesPerCase <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Pack "${packData.name}" has no bottles-per-case set, so cases cannot be worked out`
      });
    }

    if (labels % bottlesPerCase !== 0) {
      await session.abortTransaction();
      const cases = labels / bottlesPerCase;
      return res.status(400).json({
        message: `${labels} labels is ${cases.toFixed(2)} cases at ${bottlesPerCase} per case. A range must come out as whole cases — the nearest are ${Math.floor(cases) * bottlesPerCase} and ${Math.ceil(cases) * bottlesPerCase} labels.`,
        labels,
        bottlesPerCase,
        cases
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
        message: `Serial range [${serialFrom}-${serialTo}] with prefix "${prefix}" overlaps with an existing issuance from ${overlappingIssuance.serialFrom} to ${overlappingIssuance.serialTo}.`
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
    res.status(500).json({ message: error.message || 'Server Error' });
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
        $gte: startOfDay(req.query.startDate),
        $lte: endOfDay(req.query.endDate),
      };
    }
    if (req.query.company) filter.company = req.query.company;
    if (req.query.market) filter.market = req.query.market;
    if (req.query.prefix) filter.prefix = req.query.prefix;

    // If query type is 'balance', only include records with balanceQuantity > 0
    if (req.query.type && req.query.type.toLowerCase() === 'balance') {
      filter.balanceQuantity = { $gt: 0 };
    }

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
    res.status(500).json({ message: 'Failed to fetch EAL Issuances', message: error.message });
  }
};

/**
 * Remove an EAL issuance, but only while none of it has been used.
 *
 * Three separate things have to agree that it is untouched: no usage record
 * points at it, it carries no used serial ranges, and its balance still
 * equals the quantity issued. They should always agree; if they do not,
 * something is already wrong and removing the issuance would hide it, so the
 * request is refused on any one of them.
 */
export const deleteEALIssuance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid EAL issuance ID' });
    }

    const issuance = await EALIssuance.findById(id);

    if (!issuance) {
      return res.status(404).json({ message: 'EAL issuance not found' });
    }

    // The caller has to name the range it means to remove, the same way a
    // usage removal does. It makes the removal deliberate, and it catches an
    // id that has moved on since the page was loaded.
    const { serialFrom, serialTo } = req.body || {};

    if (serialFrom == null || serialTo == null || serialFrom === '' || serialTo === '') {
      return res.status(400).json({
        error: 'Confirm the serial range to remove this issuance'
      });
    }

    if (Number(serialFrom) !== issuance.serialFrom || Number(serialTo) !== issuance.serialTo) {
      return res.status(400).json({
        error: `The range given does not match this issuance. It runs ${issuance.prefix}${String(issuance.serialFrom).padStart(10, '0')} to ${issuance.prefix}${String(issuance.serialTo).padStart(10, '0')}.`,
        expected: { serialFrom: issuance.serialFrom, serialTo: issuance.serialTo },
        received: { serialFrom: Number(serialFrom), serialTo: Number(serialTo) }
      });
    }

    const usageRecords = await EALUsage.countDocuments({ issuanceId: id });
    const usedRanges = issuance.usedSerialRanges?.length || 0;
    const balance = issuance.balanceQuantity ?? issuance.issuedQuantity;
    const usedQuantity = issuance.issuedQuantity - balance;

    if (usageRecords > 0 || usedRanges > 0 || usedQuantity > 0) {
      const reasons = [];
      if (usedQuantity > 0) reasons.push(`${usedQuantity} label(s) already applied`);
      if (usageRecords > 0) {
        reasons.push(`${usageRecords} production entr${usageRecords === 1 ? 'y' : 'ies'} recorded against it`);
      }
      if (usedQuantity <= 0 && usageRecords === 0 && usedRanges > 0) {
        reasons.push(`${usedRanges} used range(s) recorded against it`);
      }

      return res.status(400).json({
        error: `This issuance cannot be removed: ${reasons.join(', ')}.`,
        usedQuantity,
        usageRecords,
        usedRanges
      });
    }

    await EALIssuance.findByIdAndDelete(id);

    return res.status(200).json({
      message: 'EAL issuance removed successfully',
      data: { id }
    });
  } catch (error) {
    console.error('Failed to delete EAL issuance:', error);
    return res.status(500).json({ message: error.message });
  }
};
