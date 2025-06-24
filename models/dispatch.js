import mongoose from 'mongoose';

const DispatchItemsSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'items', required: true },
  quantityInCases: { type: Number, required: true },
  EALIssuedQuantity: { type: Number, default: 0, required: true },
  EALLinks: [{
    prefix: { type: String },
    serialFrom: { type: Number },
    serialTo: { type: Number },
  }]
}, { });

const DispatchSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local' },
  dateDispatched: { type: Date, required: true },
  deliveryTo: { type: mongoose.Schema.Types.ObjectId, ref: 'deliveries', required: true },
  items: [DispatchItemsSchema],
  totalQuantity: { type: Number, required: true },
  status: { type: String, enum: ['draft', 'final', 'loaded', 'dispatched', 'delivered'], default: 'draft' },
  EALIssuedTotalQuantity: { type: Number, default: 0 },
  vehicleDetails: {
    vehicleNumber: { type: String },
    driverName: { type: String },
    driverContact: { type: String }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const Dispatch = mongoose.model('dispatches', DispatchSchema);
export default Dispatch;