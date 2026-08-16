import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: false,
        },
        platform: {
            type: String,
            default: "swiggy",
            enum: ['swiggy', 'zomato', 'petpooja', 'auto'],
            index: true,
        },
        credentials: {
            phone: { type: String, default: null },
            password: { type: String, default: null },
        },
        session: {
            cookie: { type: String, default: null },
            accessToken: { type: String, default: null },
            updatedAt: { type: Date, default: null },
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.Restaurant ||
    mongoose.model("Restaurant", RestaurantSchema);
