import mongoose from "mongoose";

const BypassTriggerRecordSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
        },
        resName: {
            type: String,
            required: true,
        },
        requestedBy: {
            type: String,
            required: true,
        },
        userEmail: {
            type: String,
        },
        reason: {
            type: String,
        },
        user: {
            type: String,
        }
    },
    { timestamps: true }
);

const BypassTriggerRecord = mongoose.models.BypassTriggerRecord || mongoose.model("BypassTriggerRecord", BypassTriggerRecordSchema);
export default BypassTriggerRecord;
