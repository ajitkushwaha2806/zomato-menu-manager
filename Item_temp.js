import mongoose, { Schema, Types } from "mongoose";

const VariantOptionSchema = new Schema({
  name: {
    type: String,
    required: [true, "Option name is required (e.g., Regular)"],
    trim: true,
  },
  price: {
    type: Number,
    required: [true, "Option price is required"],
    min: [0, "Price cannot be negative"],
  },
});

const VariantSchema = new Schema({
  property_name: {
    type: String,
    required: [true, "Variant name is required (e.g., Size)"],
    trim: true,
  },
  options: {
    type: [VariantOptionSchema],
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: "At least one option is required for the variant",
    },
  },
});

const MenuItemSchema = new Schema(
  {
    restaurant: {
      type: Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    category: {
      type: Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    subCategory: {
      type: Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image: {
      type: Schema.Types.ObjectId,
      ref: "ImageAsset",
      default: null,
    },
    base_price: {
      type: Number,
      required: [true, "Base price is required"],
      min: [0, "Price cannot be negative"],
    },
    addonGroups: [{
      type: Types.ObjectId,
      ref: "AddonGroup",
    }],

    variants: [VariantSchema],
    dietaryType: {
      type: String,
      enum: ["veg", "non-veg", "egg", "vegan"],
      required: true,
      index: true,
    },
    isAvailable: { type: Boolean, default: true, index: true },
    preparationTime: { type: Number, default: 15 },
    displayOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

MenuItemSchema.pre("validate", function () {
  if (this.variants && this.variants.length > 0) {
    let lowestPrice = Infinity;
    this.variants.forEach((variant) => {
      variant.options.forEach((option) => {
        if (option.price < lowestPrice) {
          lowestPrice = option.price;
        }
      });
    });

    if (lowestPrice !== Infinity) {
      this.base_price = lowestPrice;
    }
  }
});

MenuItemSchema.index({ restaurant: 1, category: 1, displayOrder: 1 });
export default mongoose.models.MenuItem || mongoose.model("MenuItem", MenuItemSchema);