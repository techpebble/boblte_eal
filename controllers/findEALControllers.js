import EALUsage from "../models/eal_usages.js";
import EALIssuance from "../models/eal_issuances.js";
import Dispatch from "../models/dispatch.js";
import EALDispatch from "../models/eal_dispatches.js";


export const getEALData = async (req, res) => {
    try {
        let serial;
        const filter = {};

        if (!req.query.ealNumber) {
            return res.status(400).json({
                error: 'ealNumber query parameter is required'
            });
        }

        // This regex matches a prefix of letters and a serial of digits
        const match = req.query.ealNumber.match(/^([a-zA-Z]+)(\d+)$/);

        if (match) {
            filter.prefix = match[1]; // captures the prefix (case-preserved)
            serial = parseInt(match[2], 10); // numeric serial
        } else {
            serial = parseInt(req.query.ealNumber, 10);
        }

        // Apply filters based on query parameters
        if (req.query.company) filter.company = req.query.company;
        if (req.query.market) filter.market = req.query.market;
        if (req.query.pack) filter.pack = req.query.pack;

        // Find all issuance records that match the prefix and contain the serial
        const issuances = await EALIssuance.find({
            ...filter,
            serialFrom: { $lte: serial },
            serialTo: { $gte: serial }
        }).populate('createdBy', 'fullName email').sort({ dateIssued: -1 });

        if (!issuances || issuances.length === 0) {
            return res.status(404).json({
                error: 'EAL issuance not found'
            });
        }

        // Find all usages that contain the serial
        const usages = await EALUsage.find({
            ...filter,
            serialFrom: { $lte: serial },
            serialTo: { $gte: serial }
        }).populate('createdBy', 'fullName email').populate('item', 'name');

        // Find all eal dispatch records that contain the serial
        const ealDispatches = await EALDispatch.find({
            ...filter,
            serialFrom: { $lte: serial },
            serialTo: { $gte: serial }
        }).populate('createdBy', 'fullName email');

        // If there are dispatches, fetch the related Dispatch documents (may be multiple)
        const dispatchIds = Array.from(new Set(ealDispatches.map(d => String(d.dispatchId)).filter(Boolean)));
        const dispatches = dispatchIds.length > 0
            ? await Dispatch.find({ _id: { $in: dispatchIds } })
            : [];

        // Build response arrays
        const issuanceData = issuances.map(i => ({
            id: i._id,
            dateIssued: i.dateIssued,
            serialFrom: i.serialFrom,
            serialTo: i.serialTo,
            issuedQuantity: i.issuedQuantity,
            balanceQuantity: i.balanceQuantity,
            usedSerialRanges: i.usedSerialRanges,
            createdBy: i.createdBy,
            createdAt: i.createdAt,
            company: i.company,
            market: i.market,
            pack: i.pack,
            prefix: i.prefix
        }));

        const usageData = usages.map(u => ({
            id: u._id,
            dateUsed: u.dateUsed,
            serialFrom: u.serialFrom,
            serialTo: u.serialTo,
            usedQuantity: u.usedQuantity,
            balanceQuantity: u.balanceQuantity,
            usedQuantityInCases: u.usedQuantityInCases,
            balanceQuantityInCases: u.balanceQuantityInCases,
            item: u.item,
            createdBy: u.createdBy,
            createdAt: u.createdAt,
            issuanceId: u.issuanceId
        }));

        const ealDispatchData = ealDispatches.map(d => ({
            id: d._id,
            dateDispatched: d.dateDispatched,
            serialFrom: d.serialFrom,
            serialTo: d.serialTo,
            usedQuantity: d.usedQuantity,
            usedQuantityInCases: d.usedQuantityInCases,
            createdBy: d.createdBy,
            createdAt: d.createdAt,
            dispatchId: d.dispatchId
        }));

        const dispatchData = dispatches.map(d => ({
            id: d._id,
            date: d.date,
            // include relevant fields as needed
            ...d.toObject()
        }));

        const respondData = {
            serial: serial || null,
            prefix: issuances[0] ? issuances[0].prefix : null,
            issuance: issuanceData,
            usage: usageData,
            ealDispatches: ealDispatchData,
            dispatches: dispatchData
        };

        res.status(200).json({ respondData });

    } catch (error) {
        return res.status(500).json({
            error: 'Failed to fetch EAL data',
            message: error.message
        });
    }
}