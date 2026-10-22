import mongoose from 'mongoose';
import Role from '../models/role.js';
import User from '../models/user.js';
import { PERMISSIONS, ADMIN_ROLE_NAME, unknownPermissions } from '../config/permissions.js';

/**
 * The permissions this app defines, grouped the way the screen shows them.
 * The list is fixed in code: roles are made of these, so a client never has
 * to guess at a key.
 */
export const getPermissionCatalogue = async (req, res) => {
    const groups = [];

    for (const permission of PERMISSIONS) {
        let group = groups.find((entry) => entry.name === permission.group);
        if (!group) {
            group = { name: permission.group, permissions: [] };
            groups.push(group);
        }
        group.permissions.push({
            key: permission.key,
            label: permission.label,
            note: permission.note ?? null
        });
    }

    return res.status(200).json({ count: PERMISSIONS.length, data: groups });
};

/** Every role, with how many people hold each one. */
export const getAllRoles = async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();
        const counts = await User.aggregate([
            { $group: { _id: '$role', total: { $sum: 1 } } }
        ]);
        const byRole = new Map(counts.map((row) => [String(row._id), row.total]));

        return res.status(200).json({
            count: roles.length,
            data: roles.map((role) => ({ ...role, userCount: byRole.get(String(role._id)) || 0 }))
        });
    } catch (error) {
        console.error('Failed to fetch roles:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const getRoleByID = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid role ID' });
        }

        const role = await Role.findById(id);
        if (!role) return res.status(404).json({ message: 'Role not found' });

        const userCount = await User.countDocuments({ role: id });
        return res.status(200).json({ ...role.toObject(), userCount });
    } catch (error) {
        console.error('Failed to fetch role:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const addRole = async (req, res) => {
    try {
        const { name, description, permissions = [] } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Give the role a name' });
        }

        const unknown = unknownPermissions(permissions);
        if (unknown.length > 0) {
            return res.status(400).json({ message: `Unknown permission(s): ${unknown.join(', ')}` });
        }

        if (await Role.findOne({ name: String(name).trim() })) {
            return res.status(400).json({ message: 'A role with that name already exists' });
        }

        const role = await Role.create({
            name: String(name).trim(),
            description: description ? String(description).trim() : undefined,
            permissions,
            // Only the seeded Administrator is ever a system role.
            isSystem: false,
            createdBy: req.user?._id
        });

        return res.status(201).json({ message: 'Role created', data: role });
    } catch (error) {
        console.error('Failed to create role:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const updateRoleByID = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid role ID' });
        }

        const role = await Role.findById(id);
        if (!role) return res.status(404).json({ message: 'Role not found' });

        // The system role is what guarantees a way back in after a mistake in
        // some other role, so it cannot be narrowed or renamed.
        if (role.isSystem) {
            return res.status(400).json({
                message: `${role.name} cannot be changed. It is what keeps a way back in if another role is set up wrongly.`
            });
        }

        const { name, description, permissions } = req.body;

        if (name !== undefined) {
            if (!String(name).trim()) {
                return res.status(400).json({ message: 'Give the role a name' });
            }
            const clash = await Role.findOne({ name: String(name).trim(), _id: { $ne: id } });
            if (clash) return res.status(400).json({ message: 'A role with that name already exists' });
            role.name = String(name).trim();
        }

        if (description !== undefined) role.description = String(description).trim();

        if (permissions !== undefined) {
            const unknown = unknownPermissions(permissions);
            if (unknown.length > 0) {
                return res.status(400).json({ message: `Unknown permission(s): ${unknown.join(', ')}` });
            }

            // Taking roles:manage off the last role that still grants it would
            // leave nobody able to put it back.
            const losingRoleAdmin = role.permissions.includes('roles:manage') && !permissions.includes('roles:manage');
            if (losingRoleAdmin && !(await anotherRoleCanManageRoles(id))) {
                return res.status(400).json({
                    message: 'This is the only role left that can manage roles. Give that permission to another role first.'
                });
            }

            role.permissions = permissions;
        }

        await role.save();
        return res.status(200).json({ message: 'Role updated', data: role });
    } catch (error) {
        console.error('Failed to update role:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const deleteRoleByID = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid role ID' });
        }

        const role = await Role.findById(id);
        if (!role) return res.status(404).json({ message: 'Role not found' });

        if (role.isSystem) {
            return res.status(400).json({ message: `${role.name} cannot be removed` });
        }

        // A user whose role vanished could not be loaded, so move people off
        // it first rather than leaving them pointing at nothing.
        const holders = await User.countDocuments({ role: id });
        if (holders > 0) {
            return res.status(400).json({
                message: `${holders} ${holders === 1 ? 'person holds' : 'people hold'} this role. Move them to another role first.`,
                userCount: holders
            });
        }

        if (role.permissions.includes('roles:manage') && !(await anotherRoleCanManageRoles(id))) {
            return res.status(400).json({
                message: 'This is the only role left that can manage roles.'
            });
        }

        await Role.findByIdAndDelete(id);
        return res.status(200).json({ message: 'Role removed', data: { id } });
    } catch (error) {
        console.error('Failed to delete role:', error);
        return res.status(500).json({ message: error.message });
    }
};

/** Is there a role other than `excludeId` that can still manage roles? */
const anotherRoleCanManageRoles = async (excludeId) => {
    const other = await Role.findOne({
        _id: { $ne: excludeId },
        $or: [{ isSystem: true }, { permissions: 'roles:manage' }]
    });
    return Boolean(other);
};
