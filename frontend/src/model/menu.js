import mongoose from "mongoose";

const MenuSchema = new mongoose.Schema(
    {
        resId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: false,
        },

        platform: {
            type: String,
            default: "auto",
            enum: ['swiggy', 'zomato', 'petpooja', "auto"],
            index: true,
        },

        taskId: {
            type: String,
            unique: true,
            sparse: true,
        },

        menu: mongoose.Schema.Types.Mixed,
        addons: mongoose.Schema.Types.Mixed,
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.Menu ||
    mongoose.model(
        "Menu",
        MenuSchema
    );