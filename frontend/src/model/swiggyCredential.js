import mongoose from "mongoose";

const SwiggyCredentialSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        username: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.SwiggyCredential ||
    mongoose.model("SwiggyCredential", SwiggyCredentialSchema);
