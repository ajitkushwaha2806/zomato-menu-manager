import mongoose from "mongoose";

const OutletTransferSchema = new mongoose.Schema(
    {
        fromResId: {
            type: String,
            required: true,
            index: true,
        },
        fromResName: {
            type: String,
            required: true,
        },
        toResId: {
            type: String,
            required: true,
            index: true,
        },
        toResName: {
            type: String,
            required: true,
        },
        platform: {
            type: String,
            default: "zomato",
        },
        status: {
            type: String,
            default: "COMPLETED",
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        }
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.OutletTransfer ||
    mongoose.model("OutletTransfer", OutletTransferSchema);
