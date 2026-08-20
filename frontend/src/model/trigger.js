import mongoose from "mongoose";

const TriggerSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
            index: true,
        },
        platform: {
            type: String,
            required: true,
        },
        taskId: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            default: "SUCCESS",
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
