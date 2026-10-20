import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  itemCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  // A short name to show in tables and pickers in place of the full one,
  // which runs to things like "ORIGINAL CHOICE DELUXE WHISKY 90ML TETRAPAK
  // x 96". Optional: without it the full name is shown.
  alias: { type: String },
  description: { type: String },
  pack: { type: mongoose.Schema.Types.ObjectId, ref: 'packs', required: true },
  market: { type: String, enum: ['local', 'export'], default: 'local', required: true },
  bottlesPerCase: { type: Number, required: true },
  brand: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies', required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { timestamps: true });

const Item = mongoose.model('items', ItemSchema);
export default Item;