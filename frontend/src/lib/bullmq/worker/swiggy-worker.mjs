import axios from "axios";
import dotenv from "dotenv";
import Redis from "ioredis";
import { Worker } from "bullmq";

dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error("Missing REDIS_URL");
}

if (!process.env.NEXT_PUBLIC_BASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_BASE_URL");
}

const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

/**
 * Build axios config with the Swiggy account name header so that
 * the internal Next.js API routes can authenticate via the correct
 * Swiggy credentials stored in MongoDB.
 */
function buildConfig(accountName, extra = {}) {
    return {
        headers: {
            "x-swiggy-account": accountName || "",
            "Content-Type": "application/json",
        },
        timeout: 30000,
        ...extra,
    };
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

const worker = new Worker(
    "swiggyProcessorQueue",
    async (job) => {
        const {
            resId,
            syncId,
            type,
            action,
            payload,
            accountName,
        } = job.data;

        if (!resId) throw new Error("Missing resId");
        if (!syncId) throw new Error("Missing syncId");
        if (!accountName) throw new Error("Missing accountName — cannot authenticate with Swiggy");

        console.log(`[${job.id}] Starting sync`, { syncId, resId, type, accountName });

        const cfg = buildConfig(accountName);

        if (type === "category") {
            await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/process/category`,
                { syncId, action, payload },
                cfg
            );
            return;
        }

        if (type === "sub_category") {
            await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/process/sub-category`,
                { syncId, action, payload },
                cfg
            );
            return;
        }

        if (type === "menu_sync") {
            const { data } = await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/category`,
                { syncId, type, accountName },
                cfg
            );
            return data;
        }

        if (type === "sub_category_sync") {
            const { data } = await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/sub-category`,
                { syncId, type, accountName },
                cfg
            );
            return data;
        }

        if (type === "item_sync") {
            const { data } = await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/item`,
                { syncId, type, accountName },
                cfg
            );
            return data;
        }

        if (type === "item") {
            await axios.post(
                `${BASE_URL}/api/menu/${resId}/swiggy/queue-changes/process/item`,
                { syncId, action, payload },
                cfg
            );
            return;
        }

        throw new Error(`Unknown job type: ${type}`);
    },
    {
        connection,
        concurrency: 1,
    }
);

worker.on("completed", (job) => {
    console.log(`✅ [${job.id}] Completed`);
});

worker.on("failed", (job, err) => {
    console.error(`❌ [${job?.id}] Failed:`, err.message);
});

console.log("🚀 Swiggy Menu Sync Worker Started");