import mongoose from "mongoose";

const MigrationRequestSchema = new mongoose.Schema(
  {
    zomatoResId: {
      type: String,
      required: true,
      index: true,
    },
    zomatoResName: {
      type: String,
      required: true,
    },
    swiggyResId: {
      type: String,
      required: true,
      index: true,
    },
    swiggyResName: {
      type: String,
      required: true,
    },
    zomatoAccess: {
      type: Boolean,
      required: true,
    },
    swiggyAccess: {
      type: Boolean,
      required: true,
    },
    priceHandling: {
      type: {
        type: String,
        enum: ["percent", "flat"],
        required: true,
      },
      value: {
        type: Number,
        required: true,
      },
    },
    priceRaw: {
      type: String,
      required: true,
    },
    submittedBy: {
      type: String,
      required: true,
    },
    remarks: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "action_required", "completed", "failed"],
      default: "pending",
      index: true,
    },
    currentStep: {
      type: String,
      enum: ["ZOMATO_CREATE", "ZOMATO_IMPORT", "ZOMATO_AI", "ZOMATO_PRICE", "SWIGGY_CREATE", "SWIGGY_IMPORT", "SWIGGY_CLEAR", "SWIGGY_SYNC", "CHECK_IMAGES", "CHECK_ITEMS", "VALIDATE_APPROVAL", "COMPLETED"],
      default: "ZOMATO_CREATE",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.MigrationRequest ||
  mongoose.model("MigrationRequest", MigrationRequestSchema);
