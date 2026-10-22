import mongoose from 'mongoose';
import { PERMISSION_KEYS } from '../config/permissions.js';

const RoleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  permissions: {
    type: [String],
    default: [],
    validate: {
      validator: (keys) => keys.every((key) => PERMISSION_KEYS.includes(key)),
      message: (props) =>
        `Unknown permission(s): ${props.value.filter((k) => !PERMISSION_KEYS.includes(k)).join(', ')}`
    }
  },
  // The Administrator role carries this. It always holds every permission and
  // is refused edits and deletion, so there is always a way back in after a
  // mistake in some other role.
  isSystem: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }
}, { timestamps: true });

/** Does this role allow `key`? A system role allows everything. */
RoleSchema.methods.allows = function allows(key) {
  return this.isSystem || this.permissions.includes(key);
};

const Role = mongoose.model('roles', RoleSchema);
export default Role;
