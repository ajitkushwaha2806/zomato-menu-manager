import mongoose from "mongoose";

const MenuSyncSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
        },

        accountName: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "completed",
                "failed",
            ],
            default: "pending",
        },

        updated_menu: {
            type: Object,
            required: true,
        },

        error: String,
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.MenuSync ||
    mongoose.model("MenuSync", MenuSyncSchema);