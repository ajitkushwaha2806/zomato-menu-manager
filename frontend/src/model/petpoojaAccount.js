import mongoose from "mongoose";

const PetpoojaAccountSchema = new mongoose.Schema(
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

export default mongoose.models.PetpoojaAccount || mongoose.model("PetpoojaAccount", PetpoojaAccountSchema);
