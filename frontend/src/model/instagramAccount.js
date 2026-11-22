import mongoose from "mongoose";

const InstagramAccountSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
        },
        userId: {
            type: String,
            required: true,
        },
        accessToken: {
            type: String,
            required: true,
        },
        tokenExpiresAt: {
            type: Date,
        },
        connectedAt: {
            type: Date,
            default: Date.now,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        resId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.InstagramAccount ||
    mongoose.model("InstagramAccount", InstagramAccountSchema);

