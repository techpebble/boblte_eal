import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // e.g., "MM", "JDPL"
  address: { type: String },
}, { timestamps: true });

const Company = mongoose.model('companies', CompanySchema);
export default Company;