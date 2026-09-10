import mongoose from "mongoose";

const MenuUploadJobSchema = new mongoose.Schema(
    {
        job_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        job_type: {
            type: String,
            default: "menu_upload",
        },
        restaurant_id: {
            type: String,
            required: true,
            index: true,
        },
        upload_type: {
            type: String,
            default: "images",
        },
        platform: {
            type: String,
            default: "zomato",
            index: true,
        },
        status: {
            type: String,
            default: "queued",
            index: true,
        },
        files: {
            type: Array,
            default: [],
        },
        total_files: {
            type: Number,
            default: 0,
        },
        raw_text: {
            type: String,
            default: null,
        },
        proposed_changes: {
            type: Array,
            default: [],
        },
        progress: {
            type: Number,
            default: 0,
        },
        step: {
            type: String,
            default: null,
        },
        error: {
            type: String,
            default: null,
        },
        chain_outputs: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
        started_at: {
            type: Date,
            default: null,
        },
        completed_at: {
            type: Date,
            default: null,
        },
    },
    {
        collection: "menu_upload_jobs",
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
        strict: false,
    }
);

export default mongoose.models.MenuUploadJob ||
    mongoose.model("MenuUploadJob", MenuUploadJobSchema);
