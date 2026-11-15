import mongoose from "mongoose";

const OwnlyAccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    cookie: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.OwnlyAccount ||
  mongoose.model("OwnlyAccount", OwnlyAccountSchema);

