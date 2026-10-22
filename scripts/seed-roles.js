/**
 * Seeds the built-in roles and points every user at one.
 *
 * Safe to run more than once: roles are matched by name and users that
 * already hold a role are left alone. Run it with
 *
 *   node scripts/seed-roles.js
 *
 * from the backend folder. Pass --dry to see what it would do and change
 * nothing.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/role.js';
import User from '../models/user.js';
import { ADMIN_ROLE_NAME, BUILT_IN_ROLES, PERMISSION_KEYS } from '../config/permissions.js';

const dryRun = process.argv.includes('--dry');
const say = (...args) => console.log(dryRun ? '[dry]' : '     ', ...args);

const run = async () => {
    await connectDB();

    // 1. The built-in roles. Administrator always carries every permission,
    //    including any added since it was seeded.
    for (const definition of BUILT_IN_ROLES) {
        const existing = await Role.findOne({ name: definition.name });

        if (!existing) {
            if (!dryRun) await Role.create(definition);
            say(`created role "${definition.name}" with ${definition.permissions.length} permission(s)`);
            continue;
        }

        if (definition.name === ADMIN_ROLE_NAME) {
            const missing = PERMISSION_KEYS.filter((key) => !existing.permissions.includes(key));
            if (missing.length > 0) {
                if (!dryRun) {
                    existing.permissions = PERMISSION_KEYS;
                    existing.isSystem = true;
                    await existing.save();
                }
                say(`topped up "${definition.name}" with ${missing.length} new permission(s): ${missing.join(', ')}`);
            } else {
                say(`role "${definition.name}" already complete`);
            }
            continue;
        }

        say(`role "${definition.name}" already exists, left as it is`);
    }

    const admin = await Role.findOne({ name: ADMIN_ROLE_NAME });
    if (!admin && !dryRun) throw new Error('Administrator role missing after seeding');

    // 2. Users. The role field used to hold a string; anything that is not an
    //    ObjectId still needs moving across. Read raw so Mongoose does not try
    //    to cast the old value to the new type.
    const raw = mongoose.connection.collection('users');
    const users = await raw.find({}).project({ fullName: 1, role: 1, legacyRole: 1 }).toArray();

    const snapshot = users.map((u) => ({
        _id: String(u._id),
        fullName: u.fullName,
        role: u.role instanceof mongoose.Types.ObjectId ? String(u.role) : u.role,
        legacyRole: u.legacyRole ?? null
    }));
    const file = path.join(process.cwd(), 'scripts', `role-migration-${Date.now()}.rollback.json`);
    if (!dryRun) fs.writeFileSync(file, JSON.stringify(snapshot, null, 1));
    say(`snapshot of ${snapshot.length} user(s) ${dryRun ? 'would be' : ''} written to ${path.basename(file)}`);

    let moved = 0;
    let already = 0;
    for (const user of users) {
        const isObjectId = user.role instanceof mongoose.Types.ObjectId;
        if (isObjectId) { already += 1; continue; }

        // Everyone becomes Administrator, which is what they effectively were:
        // nothing has ever checked the old string. Narrowing people down to
        // real roles is a decision for a person, not a migration.
        if (!dryRun) {
            await raw.updateOne(
                { _id: user._id },
                { $set: { role: admin._id, legacyRole: user.legacyRole ?? user.role ?? null } }
            );
        }
        moved += 1;
    }

    say(`users moved to "${ADMIN_ROLE_NAME}": ${moved}`);
    say(`users already holding a role: ${already}`);

    if (!dryRun) {
        const bad = await raw.countDocuments({ role: { $type: 'string' } });
        const withoutRole = await raw.countDocuments({ role: { $exists: false } });
        console.log(`\nverify: users still holding a text role ${bad}, users with no role ${withoutRole}`);
        console.log(`verify: roles in the database ${await Role.countDocuments()}`);
    }

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('seed-roles failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
