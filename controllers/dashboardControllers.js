import mongoose from "mongoose";
import EALIssuance from "../models/eal_issuances.js";
import EALUsage from "../models/eal_usages.js";
import EALDispatch from "../models/eal_dispatches.js";
import Dispatch from "../models/dispatch.js";

// A dispatch note counts towards the "dispatched" figure once it has left the yard.
const DISPATCHED_STATUSES = ['dispatched', 'delivered'];

// Notes still being prepared, and so still able to accept EAL links.
const OPEN_STATUSES = ['draft', 'final'];

// Case counts are derived by division, so compare them with the same tolerance
// used when a note is moved from 'final' to 'loaded'.
const LINK_TOLERANCE = 1e-6;

const MOVEMENT_TYPES = ['issuance', 'usage', 'dispatch-link'];

const MOVEMENT_LIMIT_DEFAULT = 8;
const MOVEMENT_LIMIT_MAX = 50;
const NOTES_LIMIT_DEFAULT = 5;
const NOTES_LIMIT_MAX = 25;

const first = (rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null);

const round = (value, places = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Percentage change between two periods. Returns null when the earlier figure
 * is zero, because the change is undefined rather than infinite.
 */
const changePct = (current, previous) => {
  if (!previous) return null;
  return round(((current - previous) / previous) * 100, 1);
};

const readLimit = (raw, fallback, max) => {
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

/**
 * Resolve the reporting window, plus the equally long window immediately
 * before it that every figure is compared against. Defaults to month to date.
 */
const resolvePeriod = (query) => {
  const now = new Date();
  let start;
  let end;

  if (query.startDate || query.endDate) {
    if (!query.startDate || !query.endDate) {
      return { error: 'Provide both startDate and endDate, or neither' };
    }
    start = new Date(query.startDate);
    end = new Date(query.endDate);
    if (isNaN(start) || isNaN(end)) {
      return { error: 'Please enter the dates correctly' };
    }
    // Match the other list endpoints and include the whole of the closing day.
    end = new Date(end.setHours(23, 59, 59, 999));
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  }

  if (start > end) {
    return { error: 'startDate must fall before endDate' };
  }

  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - (end.getTime() - start.getTime()));

  return { start, end, prevStart, prevEnd };
};

/**
 * Narrow every figure to one company and/or market when asked.
 */
const resolveScope = (query) => {
  const scope = {};

  if (query.company) {
    if (!mongoose.Types.ObjectId.isValid(query.company)) {
      return { error: 'Invalid company id' };
    }
    scope.company = new mongoose.Types.ObjectId(query.company);
  }

  if (query.market) {
    const market = String(query.market).toLowerCase();
    if (!['local', 'export'].includes(market)) {
      return { error: "Market must be either 'local' or 'export'" };
    }
    scope.market = market;
  }

  return { scope };
};

/**
 * Which kinds of movement the activity feed should carry, so the page's
 * All / Issuance / Usage / Dispatch tabs can filter without a second endpoint.
 */
const resolveMovementTypes = (raw) => {
  if (!raw) return { types: [...MOVEMENT_TYPES] };

  const requested = String(raw).split(',').map((type) => type.trim()).filter(Boolean);
  const unknown = requested.filter((type) => !MOVEMENT_TYPES.includes(type));

  if (requested.length === 0 || unknown.length > 0) {
    return { error: `Movement types must be any of: ${MOVEMENT_TYPES.join(', ')}` };
  }

  return { types: requested };
};

const sumStage = (field) => ({
  $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } }
});

const serialRange = (doc) => ({
  prefix: doc.prefix,
  serialFrom: doc.serialFrom,
  serialTo: doc.serialTo
});

const packOf = (doc) => (doc.pack
  ? { id: doc.pack._id, name: doc.pack.name, bottlesPerCase: doc.pack.bottlesPerCase }
  : null);

/**
 * Operations overview: period totals against the preceding period, EAL stock
 * broken down by pack, dispatch notes still waiting on EAL links, and a merged
 * feed of issuance, usage and linking activity.
 */
export const getDashboardData = async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    if (period.error) {
      return res.status(400).json({ message: period.error });
    }

    const { scope, error: scopeError } = resolveScope(req.query);
    if (scopeError) {
      return res.status(400).json({ message: scopeError });
    }

    const { types: movementTypes, error: typesError } = resolveMovementTypes(req.query.types);
    if (typesError) {
      return res.status(400).json({ message: typesError });
    }

    const { start, end, prevStart, prevEnd } = period;
    const movementLimit = readLimit(req.query.limit, MOVEMENT_LIMIT_DEFAULT, MOVEMENT_LIMIT_MAX);
    const notesLimit = readLimit(req.query.notesLimit, NOTES_LIMIT_DEFAULT, NOTES_LIMIT_MAX);

    const inPeriod = (field) => ({ [field]: { $gte: start, $lte: end } });
    const inPrevious = (field) => ({ [field]: { $gte: prevStart, $lte: prevEnd } });

    // A note is short of labels while its linked case count is below its total.
    const incompleteLinking = {
      $expr: {
        $lt: [
          { $add: [{ $ifNull: ['$EALIssuedTotalQuantity', 0] }, LINK_TOLERANCE] },
          '$totalQuantity'
        ]
      }
    };

    const [issuanceRollup, usageRollup, dispatchRollup] = await Promise.all([
      EALIssuance.aggregate([
        { $match: scope },
        {
          $facet: {
            issuedInPeriod: [{ $match: inPeriod('dateIssued') }, sumStage('issuedQuantity')],
            issuedInPrevious: [{ $match: inPrevious('dateIssued') }, sumStage('issuedQuantity')],
            // Stock is not stored per day, so a point in time is rebuilt as
            // everything issued by then less everything applied by then.
            issuedUpToEnd: [{ $match: { dateIssued: { $lte: end } } }, sumStage('issuedQuantity')],
            issuedUpToPrevEnd: [{ $match: { dateIssued: { $lte: prevEnd } } }, sumStage('issuedQuantity')],
            openRanges: [{ $match: { balanceQuantity: { $gt: 0 } } }, { $count: 'count' }],
            byPack: [
              { $match: { balanceQuantity: { $gt: 0 } } },
              {
                $group: {
                  _id: { pack: '$pack', market: '$market' },
                  labels: { $sum: '$balanceQuantity' }
                }
              },
              {
                $lookup: {
                  from: 'packs',
                  localField: '_id.pack',
                  foreignField: '_id',
                  as: 'pack'
                }
              },
              { $unwind: '$pack' },
              { $sort: { labels: -1 } }
            ]
          }
        }
      ]),

      EALUsage.aggregate([
        { $match: scope },
        {
          $facet: {
            appliedInPeriod: [{ $match: inPeriod('dateUsed') }, sumStage('usedQuantity')],
            appliedInPrevious: [{ $match: inPrevious('dateUsed') }, sumStage('usedQuantity')],
            usedUpToEnd: [{ $match: { dateUsed: { $lte: end } } }, sumStage('usedQuantity')],
            usedUpToPrevEnd: [{ $match: { dateUsed: { $lte: prevEnd } } }, sumStage('usedQuantity')]
          }
        }
      ]),

      Dispatch.aggregate([
        { $match: scope },
        {
          $facet: {
            dispatchedInPeriod: [
              { $match: { status: { $in: DISPATCHED_STATUSES }, ...inPeriod('dateDispatched') } },
              sumStage('totalQuantity')
            ],
            dispatchedInPrevious: [
              { $match: { status: { $in: DISPATCHED_STATUSES }, ...inPrevious('dateDispatched') } },
              sumStage('totalQuantity')
            ],
            awaitingLinking: [
              { $match: { status: { $in: OPEN_STATUSES }, ...incompleteLinking } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  casesOutstanding: {
                    $sum: {
                      $subtract: ['$totalQuantity', { $ifNull: ['$EALIssuedTotalQuantity', 0] }]
                    }
                  }
                }
              }
            ]
          }
        }
      ])
    ]);

    const issuanceFacets = first(issuanceRollup) || {};
    const usageFacets = first(usageRollup) || {};
    const dispatchFacets = first(dispatchRollup) || {};

    const total = (rows) => round(first(rows)?.total || 0);
    const count = (rows) => first(rows)?.count || 0;

    const issued = total(issuanceFacets.issuedInPeriod);
    const issuedPrevious = total(issuanceFacets.issuedInPrevious);
    const applied = total(usageFacets.appliedInPeriod);
    const appliedPrevious = total(usageFacets.appliedInPrevious);
    const dispatched = total(dispatchFacets.dispatchedInPeriod);
    const dispatchedPrevious = total(dispatchFacets.dispatchedInPrevious);

    const onHand = round(
      total(issuanceFacets.issuedUpToEnd) - total(usageFacets.usedUpToEnd)
    );
    const onHandPrevious = round(
      total(issuanceFacets.issuedUpToPrevEnd) - total(usageFacets.usedUpToPrevEnd)
    );

    // Labels issued in an earlier period are applied in this one, so measure
    // consumption against everything that was available to consume rather than
    // against this period's issuances alone.
    const availableLabels = round(onHandPrevious + issued);

    // Share of the whole so the bars can be drawn without a second pass.
    const stockRows = issuanceFacets.byPack || [];
    const stockTotal = stockRows.reduce((sum, row) => sum + row.labels, 0);

    const stockByPack = stockRows.map((row) => {
      const bottlesPerCase = row.pack?.bottlesPerCase || 0;
      return {
        pack: {
          id: row._id.pack,
          name: row.pack?.name || null,
          bottlesPerCase
        },
        market: row._id.market,
        labels: round(row.labels),
        cases: bottlesPerCase > 0 ? round(row.labels / bottlesPerCase) : null,
        sharePct: stockTotal > 0 ? round((row.labels / stockTotal) * 100, 1) : 0
      };
    });

    const awaitingTotals = first(dispatchFacets.awaitingLinking);
    const wants = (type) => movementTypes.includes(type);

    const [openNotes, recentIssuances, recentUsages, recentLinks] = await Promise.all([
      Dispatch.find({ ...scope, status: { $in: OPEN_STATUSES }, ...incompleteLinking })
        .populate('company', 'name')
        .populate('deliveryTo', 'name')
        .sort({ dateDispatched: 1 })
        .limit(notesLimit),

      wants('issuance')
        ? EALIssuance.find({ ...scope, ...inPeriod('dateIssued') })
          .populate('company', 'name')
          .populate('pack', 'name bottlesPerCase')
          .populate('createdBy', 'fullName')
          .sort({ dateIssued: -1, createdAt: -1 })
          .limit(movementLimit)
        : [],

      wants('usage')
        ? EALUsage.find({ ...scope, ...inPeriod('dateUsed') })
          .populate('company', 'name')
          .populate('pack', 'name bottlesPerCase')
          .populate('item', 'name')
          .populate('createdBy', 'fullName')
          .sort({ dateUsed: -1, createdAt: -1 })
          .limit(movementLimit)
        : [],

      wants('dispatch-link')
        ? EALDispatch.find({ ...scope, ...inPeriod('dateDispatched') })
          .populate('company', 'name')
          .populate('pack', 'name bottlesPerCase')
          .populate('item', 'name')
          .populate('createdBy', 'fullName')
          .sort({ dateDispatched: -1, createdAt: -1 })
          .limit(movementLimit)
        : []
    ]);

    const now = Date.now();

    const notes = openNotes.map((note) => {
      const linked = round(note.EALIssuedTotalQuantity || 0);
      return {
        id: note._id,
        company: note.company?.name || null,
        depot: note.deliveryTo?.name || null,
        market: note.market,
        dateDispatched: note.dateDispatched,
        status: note.status,
        cases: round(note.totalQuantity),
        linkedCases: linked,
        outstandingCases: round(note.totalQuantity - linked),
        linkedPct: note.totalQuantity > 0
          ? round((linked / note.totalQuantity) * 100, 1)
          : 0,
        ageDays: Math.max(0, Math.floor((now - new Date(note.dateDispatched).getTime()) / 86400000))
      };
    });

    const movements = [
      ...recentIssuances.map((row) => ({
        type: 'issuance',
        event: 'Issuance received',
        at: row.dateIssued,
        recordedAt: row.createdAt,
        company: row.company?.name || null,
        pack: packOf(row),
        item: null,
        market: row.market,
        ...serialRange(row),
        quantity: row.issuedQuantity,
        unit: 'labels',
        status: row.balanceQuantity > 0 ? 'posted' : 'exhausted',
        user: row.createdBy?.fullName || null
      })),
      ...recentUsages.map((row) => ({
        type: 'usage',
        event: 'Usage recorded',
        at: row.dateUsed,
        recordedAt: row.createdAt,
        company: row.company?.name || null,
        pack: packOf(row),
        item: row.item?.name || null,
        market: row.market,
        ...serialRange(row),
        quantity: row.usedQuantity,
        unit: 'labels',
        status: 'posted',
        user: row.createdBy?.fullName || null
      })),
      ...recentLinks.map((row) => ({
        type: 'dispatch-link',
        event: 'EAL linked',
        at: row.dateDispatched,
        recordedAt: row.createdAt,
        company: row.company?.name || null,
        pack: packOf(row),
        item: row.item?.name || null,
        market: row.market,
        ...serialRange(row),
        quantity: row.usedQuantity,
        unit: 'labels',
        status: 'linked',
        dispatchId: row.dispatchId,
        user: row.createdBy?.fullName || null
      }))
    ]
      .sort((a, b) => {
        const byDate = new Date(b.at) - new Date(a.at);
        return byDate !== 0 ? byDate : new Date(b.recordedAt) - new Date(a.recordedAt);
      })
      .slice(0, movementLimit);

    return res.status(200).json({
      period: {
        startDate: start,
        endDate: end,
        previous: { startDate: prevStart, endDate: prevEnd }
      },
      scope: {
        company: req.query.company || null,
        market: scope.market || null
      },
      kpis: {
        labelsOnHand: {
          value: onHand,
          unit: 'labels',
          previous: onHandPrevious,
          changePct: changePct(onHand, onHandPrevious),
          openRanges: first(issuanceFacets.openRanges)?.count || 0
        },
        issued: {
          value: issued,
          unit: 'labels',
          previous: issuedPrevious,
          changePct: changePct(issued, issuedPrevious),
          count: count(issuanceFacets.issuedInPeriod)
        },
        applied: {
          value: applied,
          unit: 'labels',
          previous: appliedPrevious,
          changePct: changePct(applied, appliedPrevious),
          count: count(usageFacets.appliedInPeriod),
          utilisationPct: availableLabels > 0 ? round((applied / availableLabels) * 100, 1) : null
        },
        dispatched: {
          value: dispatched,
          unit: 'cases',
          previous: dispatchedPrevious,
          changePct: changePct(dispatched, dispatchedPrevious),
          count: count(dispatchFacets.dispatchedInPeriod)
        }
      },
      // Reconciles exactly: opening + issued - applied === closing.
      stockMovement: {
        opening: onHandPrevious,
        issued,
        applied,
        closing: onHand,
        unit: 'labels'
      },
      stockByPack,
      awaitingLinking: {
        count: awaitingTotals?.count || 0,
        casesOutstanding: round(awaitingTotals?.casesOutstanding || 0),
        notes
      },
      recentMovement: movements
    });

  } catch (error) {
    console.error('Failed to build dashboard data:', error);
    return res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
};
