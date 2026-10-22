import mongoose from 'mongoose';
import User from '../models/user.js';
import Role from '../models/role.js';
import { companyScope, companyRefusal } from '../middleware/authMiddleware.js';

const SAFE_FIELDS = '-password';

/**
 * Could this app still be administered if `user` were taken out of the
 * reckoning? Used before anything that would stop someone managing roles,
 * so the last way in cannot be closed by accident.
 */
const anotherActiveRoleAdmin = async (excludeUserId) => {
    const adminRoles = await Role.find({
        $or: [{ isSystem: true }, { permissions: 'roles:manage' }]
    }).select('_id');

    const count = await User.countDocuments({
        _id: { $ne: excludeUserId },
        isActive: { $ne: false },
        role: { $in: adminRoles.map((role) => role._id) }
    });

    return count > 0;
};

export const getAllUsers = async (req, res) => {
    try {
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.isActive === 'false') filter.isActive = false;
        else if (req.query.isActive !== 'all') filter.isActive = { $ne: false };

        // Without companies:all a person sees only their own company, whatever
        // the query asked for.
        Object.assign(filter, companyScope(req));

        const users = await User.find(filter)
            .select(SAFE_FIELDS)
            .populate('role', 'name permissions isSystem')
            .populate('company', 'name')
            .sort({ fullName: 1 });

        return res.status(200).json({ count: users.length, data: users });
    } catch (error) {
        console.error('Failed to fetch users:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const getUserByID = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        const user = await User.findOne({ _id: id, ...companyScope(req) })
            .select(SAFE_FIELDS)
            .populate('role', 'name permissions isSystem')
            .populate('company', 'name');

        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json(user);
    } catch (error) {
        console.error('Failed to fetch user:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const updateUserByID = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        const user = await User.findOne({ _id: id, ...companyScope(req) });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { fullName, email, mobile, role, company } = req.body;

        if (role !== undefined && String(role) !== String(user.role)) {
            const target = await Role.findById(role);
            if (!target) return res.status(400).json({ message: 'Pick a role that exists' });

            // Moving the last person who can manage roles onto a role that
            // cannot would leave nobody able to undo it.
            const losesAdmin = !(target.isSystem || target.permissions.includes('roles:manage'));
            if (losesAdmin && !(await anotherActiveRoleAdmin(id))) {
                return res.status(400).json({
                    message: 'This is the last active person who can manage roles. Give someone else that first.'
                });
            }

            user.role = role;
        }

        if (fullName !== undefined) user.fullName = String(fullName).trim();
        if (email !== undefined) user.email = String(email).trim();
        if (mobile !== undefined) user.mobile = String(mobile).trim();
        if (company !== undefined) {
            const refusal = companyRefusal(req, company);
            if (refusal) return res.status(403).json({ message: refusal });
            user.company = company;
        }

        await user.save();

        const saved = await User.findById(id)
            .select(SAFE_FIELDS)
            .populate('role', 'name permissions isSystem')
            .populate('company', 'name');

        return res.status(200).json({ message: 'User updated', data: saved });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || 'value';
            return res.status(400).json({ message: `That ${field} is already used by another user` });
        }
        console.error('Failed to update user:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * Users are switched off rather than deleted: their name is on every
 * issuance, usage and dispatch they ever recorded, and removing the row
 * would leave those pointing at nothing.
 */
export const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive boolean is required' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        const user = await User.findOne({ _id: id, ...companyScope(req) });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!isActive) {
            if (String(id) === String(req.user?._id)) {
                return res.status(400).json({ message: 'You cannot switch off your own account' });
            }
            if (!(await anotherActiveRoleAdmin(id))) {
                return res.status(400).json({
                    message: 'This is the last active person who can manage roles.'
                });
            }
        }

        user.isActive = isActive;
        await user.save();

        return res.status(200).json({
            message: `User ${isActive ? 'activated' : 'deactivated'}`,
            data: { id, isActive }
        });
    } catch (error) {
        console.error('Failed to update user status:', error);
        return res.status(500).json({ message: error.message });
    }
};

/** Sets a new password for someone who has lost theirs. */
export const resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        if (!password || String(password).length < 8) {
            return res.status(400).json({ message: 'The new password must be at least 8 characters' });
        }

        const user = await User.findOne({ _id: id, ...companyScope(req) });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Assigning and saving so the model's hashing hook runs; a direct
        // update would store it in the clear.
        user.password = String(password);
        await user.save();

        return res.status(200).json({ message: `Password reset for ${user.fullName}` });
    } catch (error) {
        console.error('Failed to reset password:', error);
        return res.status(500).json({ message: error.message });
    }
};
