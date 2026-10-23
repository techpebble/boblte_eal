import mongoose from 'mongoose';
import SerialRangeSchema from './serial_range.js';

const EALUsageSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  dateUsed: { type: Date, required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local' },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'items', required: true },
  pack: { type: mongoose.Schema.Types.ObjectId, ref: 'packs', required: true },
  prefix: { type: String, required: true },
  serialFrom: { type: Number, required: true },
  serialTo: { type: Number, required: true },
  usedSerialRanges: [SerialRangeSchema],
  usedQuantity: { type: Number, required: true },
  usedQuantityInCases: { type: Number, required: true },
  balanceQuantityInCases: { type: Number, default: function () {
    return this.usedQuantityInCases;
  }},
  issuanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ealissuances', required: true },
  balanceQuantity: { type: Number, default: function () {
    return this.usedQuantity;
  }},
  // Typed rather than scanned. The app has always said a typed serial is
  // flagged for a supervisor; until now it told no one. Kept on the record
  // so that claim is true and so the entries can be looked over.
  enteredByHand: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const EALUsage = mongoose.model('ealusages', EALUsageSchema);
export default EALUsage;