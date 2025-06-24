import mongoose from 'mongoose';

const SerialRangeSchema = new mongoose.Schema({
  serialFrom: { type: Number, required: true },
  serialTo: { type: Number, required: true },
  total: {
    type: Number,
    required: true,
    validate: {
      validator: function (value) {
        return value === this.serialTo - this.serialFrom + 1;
      },
      message: 'Total must match the range (serialTo - serialFrom + 1)'
    }
  }
}, { _id: false });

export default SerialRangeSchema;
