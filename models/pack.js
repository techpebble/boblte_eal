import mongoose from 'mongoose';

const PackSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "750ml Bottle"
  bottlesPerCase: { type: Number, required: true }, // e.g. "12"
  pack: { type: Number, required: true }, // e.g. "750"
}, { timestamps: true });

const Pack = mongoose.model('packs', PackSchema);
export default Pack;