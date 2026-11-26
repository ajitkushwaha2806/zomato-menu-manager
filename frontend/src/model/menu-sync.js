import mongoose from "mongoose";

const MenuSyncSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
            index: true,
        },
        restaurantName: {
            type: String,
            default: "",
            index: true,
        },
        platform: {
            type: String,
            default: "",
            index: true,
        },
        accountName: {
            type: String,
            default: null,
        },
        taskId: {
            type: String,
            default: null,
        },
        user: {
            type: String,
            default: "Team Member",
        },
        userEmail: {
            type: String,
            default: "",
        },
        itemCount: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "completed",
                "failed",
                "completed_with_errors",
            ],
            default: "pending",
            index: true,
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
