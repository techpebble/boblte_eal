import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  itemCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  pack: { type: mongoose.Schema.Types.ObjectId, ref: 'packs', required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local', required: true },
  bottlesPerCase: { type: Number, required: true },
  brand: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const Item = mongoose.model('items', ItemSchema);
export default Item;