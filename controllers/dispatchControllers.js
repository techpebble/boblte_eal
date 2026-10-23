import mongoose from "mongoose";
import Dispatch from "../models/dispatch.js";
import EALUsage from "../models/eal_usages.js";
import EALDispatch from "../models/eal_dispatches.js";
import Item from "../models/item.js";
import { startOfDay, endOfDay } from '../utils/dateWindow.js';
import { companyScope, companyRefusal } from '../middleware/authMiddleware.js';
import { linkRefusal } from '../utils/linkWindow.js';
import { transitionRefusal } from '../utils/stageTransition.js';
import { isManualEntry, manualEntryRefusal } from '../utils/manualEntry.js';


/**
 * Create a new dispatch record.
 */
export const addDispatch = async (req, res) => {
  const userId = req.user.id;
  const {
    company,
    deliveryTo,
    dateDispatched,
    market,
    items,
    totalQuantity
  } = req.body;

  try {
    if (!company?.trim()) {
      return res.status(400).json({
        error: 'Please select a Company'
      });
    }

    const refusal = companyRefusal(req, company);
    if (refusal) {
      return res.status(403).json({ message: refusal });
    }

    if (!market?.trim()) {
      return res.status(400).json({
        error: 'Please select a Market'
      });
    }
    if (isNaN(Date.parse(dateDispatched))) {
      return res.status(400).json({
        error: 'Please enter the date correctly'
      });
    }
    if (!deliveryTo?.trim()) {
      return res.status(400).json({
        error: 'Please select a delivery location'
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Please add atleast one item'
      });
    }

    const dispatch = new Dispatch({
      company,
      market,
      dateDispatched,
      deliveryTo,
      items,
      totalQuantity,
      createdBy: userId
    });

    const savedDispatch = await dispatch.save();

    return res.status(201).json({
      message: 'EAL Dispatch successfully created.',
      data: savedDispatch
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const updateDispatch = async (req, res) => {
  const userId = req.user.id;
  const { dispatchId } = req.params;
  const {
    deliveryTo,
    dateDispatched,
    items,
    totalQuantity
  } = req.body;

  if (isNaN(Date.parse(dateDispatched))) {
    return res.status(400).json({
      error: 'Please enter the date correctly'
    });
  }
  if (!deliveryTo?.trim()) {
    return res.status(400).json({
      error: 'Please select a delivery location'
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Please add atleast one item'
    });
  }

  if (!mongoose.Types.ObjectId.isValid(dispatchId)) {
    return res.status(400).json({ error: 'Invalid Dispatch ID' });
  }

  try {

    // Step 1: Fetch dispatch to check its current status
    const existingDispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) });

    if (!existingDispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    // Step 2: Ensure status is 'draft'
    if (existingDispatch.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft dispatches can be updated' });
    }

    // Step 3: Proceed with update
    const updatedDispatch = await Dispatch.findByIdAndUpdate(
      dispatchId,
      { deliveryTo, dateDispatched, items, totalQuantity },
      { new: true }
    );

    if (!updatedDispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    return res.status(200).json({
      message: `Dispatch updated`,
      data: updatedDispatch
    });
  } catch (error) {
    console.error('Error updating dispatch status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

};

export const deleteDispatch = async (req, res) => {
  try {
    const { dispatchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(dispatchId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    // Step 1: Fetch dispatch to check its current status
    const existingDispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) });

    if (!existingDispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    // Step 2: Ensure status is 'draft'
    if (existingDispatch.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft dispatches can be deleted' });
    }

    // Step 3: Proceed with deletion
    const deletedDispatch = await Dispatch.findByIdAndDelete(dispatchId);
    if (!deletedDispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    res.json({ message: 'Dispatch deleted successfully', deletedDispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Update the status of an existing dispatch.
 */
export const updateDispatchStatus = async (req, res) => {
  const { dispatchId } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(dispatchId)) {
    return res.status(400).json({ error: 'Invalid Dispatch ID' });
  }

  try {

    // Step 1: Fetch dispatch to check its current status
    const existingDispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) });

    if (!existingDispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    // Step 2: the transition rules, which the vehicle route now shares.
    const refusal = transitionRefusal(existingDispatch, status);
    if (refusal) return res.status(400).json(refusal);

    const updatedDispatch = await Dispatch.findByIdAndUpdate(
      dispatchId,
      { status },
      { new: true }
    );


    if (!updatedDispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    return res.status(200).json({
      message: `Dispatch status updated to '${status}' successfully.`,
      data: updatedDispatch
    });
  } catch (error) {
    console.error('Error updating dispatch status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Link EAL ranges to dispatch items with validations.
 */
export const addEALLinkToDispatchItem = async (req, res) => {
  const userId = req.user.id;
  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const {
      dispatchId,
      itemId,
      prefix,
      serialFrom,
      serialTo
    } = req.body;

    // Validate inputs
    if (!dispatchId || !itemId || !prefix || serialFrom == null || serialTo == null) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const itemData = await Item.findById(itemId).session(session);
    if (!itemData) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Item not found' });
    }
    const bottlesPerCase = itemData.bottlesPerCase;

    if (serialTo < serialFrom) {
      return res.status(400).json({ message: 'serialTo must be >= serialFrom' });
    }

    const dispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) }).session(session);
    if (!dispatch) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    // Typing a serial is how a wrong number reaches the records, so a role
    // without scan:manual may scan but not type.
    const manual = manualEntryRefusal(req);
    if (manual) {
      await session.abortTransaction();
      return res.status(403).json(manual);
    }

    // Only while the note is Final. A draft's lines can still change, and a
    // loaded one has already been checked against the lorry.
    const stageRefusal = linkRefusal(dispatch.status);
    if (stageRefusal) {
      await session.abortTransaction();
      return res.status(400).json({ message: stageRefusal });
    }

    const itemRef = dispatch.items.find(i => i.item.toString() === itemId);
    if (!itemRef) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Item not found in dispatch' });
    }

    // Calculate how many cases are being added in this EAL link
    const newLinkQuantityInCases = (serialTo - serialFrom + 1) / bottlesPerCase;

    // Check if EAL linking would exceed the allowed quantity
    if ((itemRef.EALIssuedQuantity + newLinkQuantityInCases) > itemRef.quantityInCases) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Linking this EAL range exceeds the allowed quantity in dispatch. Max allowed: ${itemRef.quantityInCases} cases, Already linked: ${itemRef.EALIssuedQuantity} cases.`
      });
    }

    const { company, market, dateDispatched } = dispatch;
    const usages = await EALUsage.find({
      company,
      market,
      item: itemId,
      prefix,
      serialTo: { $gte: serialFrom },
      serialFrom: { $lte: serialTo },
      balanceQuantity: { $gt: 0 }
    }).sort({ serialFrom: 1 }).session(session);

    if (!usages.length) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'No valid usage records found for the serial range.' });
    }

    let remaining = serialTo - serialFrom + 1;
    let currentFrom = serialFrom;
    const dispatches = [];

    for (const usage of usages) {
      if (remaining <= 0) break;

      const usageFrom = Math.max(currentFrom, usage.serialFrom);
      const usageTo = Math.min(serialTo, usage.serialTo);

      if (usageFrom > usageTo) continue;

      // Check for overlaps
      for (const used of usage.usedSerialRanges) {
        if (usageFrom <= used.serialTo && used.serialFrom <= usageTo) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Overlap with used range [${used.serialFrom}-${used.serialTo}] in usage ${usage._id}`
          });
        }
      }

      const count = Math.min(usageTo - usageFrom + 1, remaining);
      const rangeTo = usageFrom + count - 1;

      const ealDispatch = new EALDispatch({
        company,
        dateDispatched,
        market,
        item: itemId,
        pack: usage.pack._id,
        prefix,
        serialFrom: usageFrom,
        serialTo: rangeTo,
        usedQuantity: count,
        usedQuantityInCases: count / bottlesPerCase,
        dispatchId,
        usageId: usage._id,
        enteredByHand: isManualEntry(req.body),
        createdBy: userId
      });

      await ealDispatch.save({ session });
      dispatches.push(ealDispatch);

      usage.usedSerialRanges.push({ serialFrom: usageFrom, serialTo: rangeTo, total: count });
      usage.balanceQuantity -= count;
      usage.balanceQuantityInCases -= count / bottlesPerCase;
      await usage.save({ session });

      remaining -= count;
      currentFrom = rangeTo + 1;
    }

    if (remaining > 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: `Incomplete dispatch. ${remaining} serials unallocated.` });
    }

    // Update dispatch with new EALLinks
    itemRef.EALLinks.push({ prefix, serialFrom, serialTo });
    itemRef.EALIssuedQuantity = itemRef.EALLinks.reduce((sum, link) => sum + (link.serialTo - link.serialFrom + 1), 0) / bottlesPerCase;
    dispatch.EALIssuedTotalQuantity = dispatch.items.reduce((sum, i) => sum + i.EALIssuedQuantity, 0);

    await dispatch.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: 'EAL link and dispatch saved successfully.',
      // ealDispatches: dispatches,
      updatedDispatch: await Dispatch.findById(dispatchId).populate('company', 'name code')
        .populate('deliveryTo', 'name')
        .populate({ path: 'items.item' })
        .populate('createdBy', 'fullName email')
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error in addEALLinkToDispatchItem:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

export const updateVehicleDetails = async (req, res) => {

  try {
    const { dispatchId } = req.params;
    const { vehicleNumber, driverName, driverContact, status } = req.body;

    // This wrote whatever status it was handed. The stage rules lived in the
    // status route alone, so a note could be walked past them by saving the
    // vehicle details instead.
    const existing = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) });
    if (!existing) return res.status(404).json({ message: 'Dispatch not found' });

    // Leaving the stage out means leaving it alone.
    const nextStatus = status ?? existing.status;

    const refusal = transitionRefusal(existing, nextStatus);
    if (refusal) return res.status(400).json(refusal);

    const updatedDispatch = await Dispatch.findOneAndUpdate(
      { _id: dispatchId, ...companyScope(req) },
      {
        vehicleDetails: { vehicleNumber, driverName, driverContact },
        status: nextStatus
      },
      { new: true }
    );

    if (!updatedDispatch) return res.status(404).json({ message: 'Dispatch not found' });

    res.json({ message: 'Vehicle details saved', updatedDispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }

}

/**
 * Unlink EAL ranges to dispatch items with validations.
 */
export const unlinkEALFromDispatchItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { dispatchId, itemId, prefix, serialFrom, serialTo } = req.body;
    const serialFromNum = Number(serialFrom);
    const serialToNum = Number(serialTo);

    if (!dispatchId || !itemId || !prefix || serialFromNum == null || serialToNum == null) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const dispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) }).session(session);
    if (!dispatch) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    const stageRefusal = linkRefusal(dispatch.status, { unlinking: true });
    if (stageRefusal) {
      await session.abortTransaction();
      return res.status(400).json({ message: stageRefusal });
    }

    const item = dispatch.items.find(i => i.item.toString() === itemId);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Item not found in dispatch' });
    }

    // Step 1: Remove the EALLink from dispatch item
    const originalLength = item.EALLinks.length;
    item.EALLinks = item.EALLinks.filter(link =>
      !(link.prefix === prefix && link.serialFrom === serialFromNum && link.serialTo === serialToNum)
    );

    if (item.EALLinks.length === originalLength) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'EAL Link not found for unlinking' });
    }

    // Step 2: Get item details to calculate bottlesPerCase
    const itemDetails = await Item.findById(itemId).session(session);
    const bottlesPerCase = itemDetails?.bottlesPerCase || 1;

    // Step 3: Recalculate EALIssuedQuantity and EALIssuedTotalQuantity
    item.EALIssuedQuantity = item.EALLinks.reduce((total, link) =>
      total + (link.serialTo - link.serialFrom + 1) / bottlesPerCase, 0);

    dispatch.EALIssuedTotalQuantity = dispatch.items.reduce((sum, i) =>
      sum + (i.EALIssuedQuantity || 0), 0);

    // Step 4: Remove EALDispatch entries and update usage
    const ealDispatches = await EALDispatch.find({
      dispatchId,
      item: itemId,
      prefix,
      serialFrom: serialFromNum,
      serialTo: serialToNum
    }).session(session);

    if (!ealDispatches.length) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Related EAL Dispatch records not found' });
    }

    for (const eal of ealDispatches) {
      if (eal.usageId) {
        const usage = await EALUsage.findById(eal.usageId).session(session);
        if (usage) {
          // Remove used serial range
          usage.usedSerialRanges = usage.usedSerialRanges.filter(r =>
            !(r.serialFrom === eal.serialFrom && r.serialTo === eal.serialTo)
          );
          const recoveredQty = eal.serialTo - eal.serialFrom + 1;
          usage.balanceQuantity += recoveredQty;
          usage.balanceQuantityInCases += recoveredQty / bottlesPerCase;
          await usage.save({ session });
        }
      }
      await eal.deleteOne({ session });
    }

    await dispatch.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate similar to addEALLinkToDispatchItem
    const updatedDispatch = await Dispatch.findById(dispatchId)
      .populate('company', 'name code')
      .populate('deliveryTo', 'name')
      .populate({ path: 'items.item' })
      .populate('createdBy', 'fullName email');

    return res.status(200).json({
      message: 'EAL unlinked successfully',
      updatedDispatch
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error unlinking EAL:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Get all dispatches with optional filters (date range, company, market).
 */
export const getAllDispatch = async (req, res) => {
  try {
    const filter = {};

    // Optional filters
    if (req.query.startDate && req.query.endDate) {
      filter.dateDispatched = {
        $gte: startOfDay(req.query.startDate),
        $lte: endOfDay(req.query.endDate)
      };
    }
    if (req.query.company) filter.company = req.query.company;
    if (req.query.market) filter.market = req.query.market;

    // Without companies:all a person sees only their own company, whatever
    // the query asked for.
    Object.assign(filter, companyScope(req));

    const dispatches = await Dispatch.find(filter)
      .populate('company', 'name code')
      .populate('deliveryTo', 'name')
      .populate({ path: 'items.item' })
      .populate('createdBy', 'fullName email')
      .sort({ dateDispatched: -1 });

    return res.status(200).json({
      count: dispatches.length,
      data: dispatches
    });

  } catch (error) {
    console.error('Failed to fetch dispatches:', error);
    return res.status(500).json({
      error: 'Failed to fetch Dispatches',
      message: error.message
    });
  }
};

/**
 * One note, with everything its own page shows. The list hands over an id and
 * nothing else, so this is what the page is built from rather than a second
 * copy of the list filtered down to one row.
 */
export const getDispatchByID = async (req, res) => {
  const { dispatchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(dispatchId)) {
    return res.status(400).json({ message: 'Invalid Dispatch ID' });
  }

  try {
    const dispatch = await Dispatch.findOne({ _id: dispatchId, ...companyScope(req) })
      .populate('company', 'name code')
      .populate('deliveryTo', 'name')
      .populate({ path: 'items.item' })
      .populate('createdBy', 'fullName email');

    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    return res.status(200).json({ data: dispatch });
  } catch (error) {
    console.error('Failed to fetch dispatch:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Get all eal dispatches with optional filters (date range, company, market).
 */
export const getAllEALDispatch = async (req, res) => {
  try {
    const filter = {};

    // Optional filters
    if (req.query.startDate && req.query.endDate) {
      filter.dateDispatched = {
        $gte: startOfDay(req.query.startDate),
        $lte: endOfDay(req.query.endDate)
      };
    }
    if (req.query.company) filter.company = req.query.company;
    if (req.query.market) filter.market = req.query.market;
    if (req.query.dispatchId) filter.dispatchId = req.query.dispatchId;

    // Without companies:all a person sees only their own company, whatever
    // the query asked for.
    Object.assign(filter, companyScope(req));

    const dispatches = await EALDispatch.find(filter)
      .populate('company', 'name code')
      .populate('item', 'name alias')
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: dispatches.length,
      data: dispatches
    });

  } catch (error) {
    console.error('Failed to fetch dispatches:', error);
    return res.status(500).json({
      error: 'Failed to fetch Dispatches',
      message: error.message
    });
  }
};