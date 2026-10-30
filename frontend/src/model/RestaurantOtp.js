import mongoose from "mongoose";

const RestaurantOtpSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
            index: true,
        },
        resName: {
            type: String,
        },
        otp: {
            type: String,
            required: true,
        },
        requestedBy: {
            type: String,
        },
        userEmail: {
            type: String,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        verifiedAt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: "1h" }, // TTL index: auto delete after 1 hour
        },
    },
    { timestamps: true }
);

const RestaurantOtp = mongoose.models.RestaurantOtp || mongoose.model("RestaurantOtp", RestaurantOtpSchema);
export default RestaurantOtp;

