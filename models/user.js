import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true },
  // Roles are records now, so this points at one. The string each user had
  // before the change is kept in legacyRole rather than thrown away.
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'roles', required: true },
  legacyRole: { type: String },
  // Switched off rather than deleted: a user's name is on every record they
  // ever posted, and removing the row would leave those pointing at nothing.
  isActive: { type: Boolean, default: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });


// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});


// Compare Passwords
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('users', UserSchema);
export default User;