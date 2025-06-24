import mongoose from 'mongoose';

const EALDispatchSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  dateDispatched: { type: Date, required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local' },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'items', required: true },
  pack: { type: mongoose.Schema.Types.ObjectId, ref: 'packs', required: true },
  prefix: { type: String, required: true },
  serialFrom: { type: Number, required: true },
  serialTo: { type: Number, required: true },
  usedQuantity: { type: Number, required: true },
  usedQuantityInCases: { type: Number, required: true },
  dispatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'dispatches' },
  usageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ealusages' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const EALDispatch = mongoose.model('ealdispatches', EALDispatchSchema);
export default EALDispatch;