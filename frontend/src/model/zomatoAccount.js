import mongoose from "mongoose";

const ZomatoAccountSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        cookie: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.ZomatoAccount ||
    mongoose.model("ZomatoAccount", ZomatoAccountSchema);
