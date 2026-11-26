import mongoose from "mongoose";

const TriggerSchema = new mongoose.Schema(
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
            required: true,
            index: true,
        },
        taskId: {
            type: String,
            default: "OTP_VERIFIED",
        },
        status: {
            type: String,
            default: "SUCCESS",
            index: true,
        },
        actionType: {
            type: String,
            default: "MENU_TRIGGER",
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
        error: {
            type: String,
            default: null,
        }
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.Trigger || mongoose.model("Trigger", TriggerSchema);
