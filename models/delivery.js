
import mongoose from 'mongoose';

const DeliverySchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true }, // e.g., "MM", "JDPL"
  address: { type: String },
}, { timestamps: true });

const Delivery = mongoose.model('deliveries', DeliverySchema);
export default Delivery;