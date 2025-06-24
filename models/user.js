import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'storekeeper', 'production', 'dispatch'], required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  password: { type: String, required: true, select: false},
  password: { type: String, required: true }, // Store hashed password
}, { timestamps: true });


// Hash password before saving
UserSchema.pre("save", async function(next) {
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