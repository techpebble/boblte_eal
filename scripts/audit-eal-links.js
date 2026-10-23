/**
 * Reports dispatch notes whose label links cannot be unlinked.
 *
 * A link stands for one dispatch row per production run its range was split
 * across. Unlinking picks those rows back up and refuses unless they account
 * for the whole link, so a link with a gap, a double count or no rows at all
 * will now be refused by name instead of failing as a 404. This finds those
 * links so they can be looked at before anyone tries.
 *
 * Reads only — it changes nothing. Run it with
 *
 *   node scripts/audit-eal-links.js
 *
 * from the backend folder. Pass --all to list every link it checked, not
 * just the ones with something wrong.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Dispatch from '../models/dispatch.js';
import EALDispatch from '../models/eal_dispatches.js';
// Imported so the company, delivery and item schemas are registered before
// the populate below asks for them.
import '../models/company.js';
import '../models/delivery.js';
import '../models/item.js';
import { coverageRefusal } from '../utils/serialRanges.js';

const verbose = process.argv.includes('--all');

const serial = (value) => String(value).padStart(10, '0');

const run = async () => {
    await connectDB();

    const dispatches = await Dispatch.find({ 'items.EALLinks.0': { $exists: true } })
        .populate('company', 'name code')
        .populate('deliveryTo', 'name')
        .populate({ path: 'items.item', select: 'itemCode name alias bottlesPerCase' })
        .sort({ dateDispatched: 1 });

    console.log(`notes with labels linked: ${dispatches.length}\n`);

    let checked = 0;
    let bad = 0;
    let spanning = 0;
    let orphans = 0;
    let note = 0;

    for (const dispatch of dispatches) {
        note += 1;
        if (note % 25 === 0) process.stdout.write(`  ... ${note} of ${dispatches.length} notes\n`);

        // One query per note rather than one per link: against a hosted
        // cluster the round trips cost far more than the rows do.
        const rows = await EALDispatch.find({ dispatchId: dispatch._id })
            .sort({ serialFrom: 1 })
            .select('item prefix serialFrom serialTo usedQuantity usageId createdAt createdBy')
            .lean();

        const spoken = new Set();

        for (const item of dispatch.items) {
            const itemId = String(item.item?._id ?? item.item);
            const goods = item.item?.alias || item.item?.name || itemId;

            for (const link of item.EALLinks) {
                checked += 1;

                const inside = rows.filter((row) =>
                    String(row.item) === itemId &&
                    row.prefix === link.prefix &&
                    row.serialFrom >= link.serialFrom &&
                    row.serialTo <= link.serialTo);

                inside.forEach((row) => spoken.add(String(row._id)));

                const refusal = coverageRefusal(inside, link.serialFrom, link.serialTo);
                if (inside.length > 1 && !refusal) spanning += 1;

                const where = `${dispatch.company?.code || dispatch.company?.name || dispatch.company} ` +
                    `note ${dispatch._id} (${dispatch.status}) ${goods} ` +
                    `${link.prefix} ${serial(link.serialFrom)}-${serial(link.serialTo)}`;

                if (refusal) {
                    bad += 1;
                    console.log(`PROBLEM  ${where}`);
                    console.log(`         ${refusal}`);
                    for (const row of inside) {
                        console.log(`         row ${serial(row.serialFrom)}-${serial(row.serialTo)} ` +
                            `(${row.usedQuantity} labels, run ${row.usageId ?? 'none'}, ` +
                            `made ${row.createdAt?.toISOString?.() ?? row.createdAt})`);
                    }
                    continue;
                }

                if (verbose) {
                    const across = inside.length > 1 ? ` across ${inside.length} production runs` : '';
                    console.log(`ok       ${where}${across}`);
                }
            }
        }

        // Rows on this note that no link accounts for. Unlinking never sees
        // these, so they sit there counting against nothing.
        const loose = rows.filter((row) => !spoken.has(String(row._id)));
        if (loose.length) {
            orphans += loose.length;
            console.log(`ORPHANS  ${dispatch.company?.code || dispatch.company} note ${dispatch._id} ` +
                `(${dispatch.status}): ${loose.length} dispatch row(s) with no link on the note`);
            for (const row of loose.slice(0, 10)) {
                console.log(`         row ${row.prefix} ${serial(row.serialFrom)}-${serial(row.serialTo)} ` +
                    `(${row.usedQuantity} labels, run ${row.usageId ?? 'none'}, ` +
                    `made ${row.createdAt?.toISOString?.() ?? row.createdAt})`);
            }
            if (loose.length > 10) console.log(`         ... and ${loose.length - 10} more`);
        }
    }

    console.log(`\nlinks checked ${checked}`);
    console.log(`links spanning more than one production run ${spanning}`);
    console.log(`links that cannot be unlinked as they stand ${bad}`);
    console.log(`dispatch rows no link accounts for ${orphans}`);
    if (bad > 0 || orphans > 0) {
        console.log('\nNothing was changed. Each line above says which labels are at fault.');
    }

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('audit-eal-links failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
