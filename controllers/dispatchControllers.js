import mongoose from "mongoose";
import Dispatch from "../models/dispatch.js";
import EALUsage from "../models/eal_usages.js";
import EALDispatch from "../models/eal_dispatches.js";
import Item from "../models/item.js";
import { startOfDay, endOfDay } from '../utils/dateWindow.js';
import { companyScope, companyRefusal, can } from '../middleware/authMiddleware.js';
import { linkRefusal } from '../utils/linkWindow.js';
import { transitionRefusal, isBackward, vehicleIsFrozen } from '../utils/stageTransition.js';
import { isManualEntry, manualEntryRefusal } from '../utils/manualEntry.js';
import { coverageRefusal, usedTotal } from '../utils/serialRanges.js';


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

    // Undoing a stage is its own permission. Moving a note along is the line
    // it was always going to follow; sending it back rewrites what the record
    // said had already happened, which is a supervisor's call.
    if (isBackward(existingDispatch.status, status) && !can(req.user, 'dispatch:reverse')) {
      const roleName = req.user?.role?.name;
      return res.status(403).json({
        error: roleName
          ? `${roleName} is not allowed to send a note back a stage. Ask a supervisor.`
          : 'Your role does not allow sending a note back a stage. Ask a supervisor.',
        required: ['dispatch:reverse'],
        role: roleName ?? null
      });
    }

    // Step 2: the transition rules, which the vehicle route now shares. This
    // is the route that exists to change the stage, so it is the one that may
    // also undo one.
    const refusal = transitionRefusal(existingDispatch, status, { allowBack: true });
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

    // Leaving a field out means leaving it alone too. This used to write the
    // three as one object, so a client that sent only the lorry number wiped
    // the driver off the note without meaning to.
    const was = existing.vehicleDetails || {};
    const vehicleDetails = {
      vehicleNumber: vehicleNumber ?? was.vehicleNumber,
      driverName: driverName ?? was.driverName,
      driverContact: driverContact ?? was.driverContact
    };

    // Past `final` the vehicle is a record of what carried the load, not a
    // plan, so it stops being editable. The route itself stays open, because
    // the apps move a note on by sending the stage and the vehicle together
    // and that is not a change to the vehicle — only a different lorry or
    // driver is refused, and the way to make one is to send the note back a
    // stage first.
    const sameAsBefore = ['vehicleNumber', 'driverName', 'driverContact'].every(
      (field) => String(vehicleDetails[field] ?? '').trim() === String(was[field] ?? '').trim()
    );

    if (vehicleIsFrozen(existing) && !sameAsBefore) {
      return res.status(400).json({
        error: `This note is ${existing.status}. The vehicle was recorded as it ` +
          `went, so it cannot be changed here. Send the note back a stage first.`,
        status: existing.status
      });
    }

    const updatedDispatch = await Dispatch.findOneAndUpdate(
      { _id: dispatchId, ...companyScope(req) },
      { vehicleDetails, status: nextStatus },
      { new: true }
    );

    if (!updatedDispatch) return res.status(404).json({ message: 'Dispatch not found' });

    res.json({ message: 'Vehicle details saved', updatedDispatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }

}

/**
 * Unlink EAL ranges from dispatch items with validations.
 *
 * One link can stand for several dispatch rows. Linking splits the range it
 * is given across every production run it touches, and a run is recorded
 * against a single issuance, so a range crossing an issuance boundary is
 * always two runs and two rows while the note keeps the one link. This looks
 * for every row inside the link rather than a row matching it, and checks
 * they account for the whole link before undoing anything.
 */
export const unlinkEALFromDispatchItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { dispatchId, itemId, linkId, prefix, serialFrom, serialTo } = req.body;
    const serialFromNum = Number(serialFrom);
    const serialToNum = Number(serialTo);

    if (!dispatchId || !itemId || !prefix) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // `Number(undefined)` is NaN rather than null, so a missing serial used
    // to pass the old check and fail further down as a puzzling 404.
    if (!Number.isInteger(serialFromNum) || !Number.isInteger(serialToNum) ||
        serialFromNum > serialToNum) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Serial From and Serial To must be whole numbers, with From no higher than To.'
      });
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

    // Step 1: The link being removed. Links carry an _id, so a client that
    // sends one gets exactly the link it meant; the serial range stays as
    // the way the apps have always asked. Either way the link's own numbers
    // are what the rest of this works from, not the ones in the request.
    const link = linkId
      ? item.EALLinks.id(linkId)
      : item.EALLinks.find(l =>
          l.prefix === prefix &&
          l.serialFrom === serialFromNum &&
          l.serialTo === serialToNum);

    if (!link) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'EAL Link not found for unlinking' });
    }

    const { prefix: linkPrefix, serialFrom: linkFrom, serialTo: linkTo } = link;

    // Step 2: Every dispatch row inside the link, in serial order — one per
    // production run the range was split across.
    const ealDispatches = await EALDispatch.find({
      dispatchId,
      item: itemId,
      prefix: linkPrefix,
      serialFrom: { $gte: linkFrom },
      serialTo: { $lte: linkTo }
    }).sort({ serialFrom: 1 }).session(session);

    if (!ealDispatches.length) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Related EAL Dispatch records not found' });
    }

    // Step 3: They have to account for the whole link. Returning part of a
    // range would leave the note's case count and the runs' balances
    // disagreeing, with nothing to say which of them is right.
    const coverage = coverageRefusal(ealDispatches, linkFrom, linkTo);
    if (coverage) {
      await session.abortTransaction();
      return res.status(409).json({ message: coverage });
    }

    const itemDetails = await Item.findById(itemId).session(session);
    const bottlesPerCase = itemDetails?.bottlesPerCase || 1;

    // Step 4: Give the labels back to their production runs. The balance is
    // worked out from the ranges that are left rather than added back, so a
    // balance that had drifted is put right instead of carried forward.
    for (const eal of ealDispatches) {
      if (eal.usageId) {
        const usage = await EALUsage.findById(eal.usageId).session(session);
        if (usage) {
          usage.usedSerialRanges = usage.usedSerialRanges.filter(r =>
            !(r.serialFrom >= eal.serialFrom && r.serialTo <= eal.serialTo)
          );
          usage.balanceQuantity = usage.usedQuantity - usedTotal(usage.usedSerialRanges);
          usage.balanceQuantityInCases = usage.balanceQuantity / bottlesPerCase;
          await usage.save({ session });
        }
      }
      await eal.deleteOne({ session });
    }

    // Step 5: Take the link off the note — this one link, not every link
    // that looks like it — and recount the cases.
    item.EALLinks.pull(link._id);

    item.EALIssuedQuantity = item.EALLinks.reduce((total, l) =>
      total + (l.serialTo - l.serialFrom + 1) / bottlesPerCase, 0);

    dispatch.EALIssuedTotalQuantity = dispatch.items.reduce((sum, i) =>
      sum + (i.EALIssuedQuantity || 0), 0);

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