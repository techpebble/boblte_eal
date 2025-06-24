import mongoose from 'mongoose';
import SerialRangeSchema from './serial_range.js';

const EALIssuanceSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  dateIssued: { type: Date, required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local' },
  pack: { type: mongoose.Schema.Types.ObjectId, ref: 'packs', required: true },
  prefix: { type: String, required: true },
  serialFrom: { type: Number, required: true },
  serialTo: { type: Number, required: true },
  usedSerialRanges: [SerialRangeSchema],
  issuedQuantity: { type: Number, required: true },
  balanceQuantity: { type: Number, default: function () {
    return this.issuedQuantity;
  }},
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const EALIssuance = mongoose.model('ealissuances', EALIssuanceSchema);
export default EALIssuance;