import axios from "axios";
import dotenv from "dotenv";
import Redis from "ioredis";
import { Worker } from "bullmq";

dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error("Missing REDIS_URL");
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:2000";

const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

function buildConfig(accountName, extra = {}) {
    return {
        headers: {
            "x-ownly-account": accountName || "",
            "Content-Type": "application/json",
        },
        timeout: 35000,
        ...extra,
    };
}

const worker = new Worker(
    "ownlyProcessorQueue",
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

        console.log(`[${job.id}] ⏳ Starting Ownly job`, { syncId, resId, type, action: action || "" });

        const cfg = buildConfig(accountName);

        if (type === "menu_sync" || type === "item_sync") {
            const { data } = await axios.post(
                `${BASE_URL}/api/menu/${resId}/ownly/queue-changes/item`,
                { syncId, type, accountName },
                cfg
            );
            return data;
        }

        if (type === "item") {
            const { data } = await axios.post(
                `${BASE_URL}/api/menu/${resId}/ownly/queue-changes/process/item`,
                { syncId, action, payload, accountName },
                cfg
            );
            return data;
        }

        throw new Error(`Unknown Ownly job type: ${type}`);
    },
    {
        connection,
        concurrency: 2,
    }
);

worker.on("completed", (job) => {
    console.log(`✅ [${job.id}] Ownly Job Completed`);
});

worker.on("failed", (job, err) => {
    console.error(`❌ [${job?.id}] Ownly Job Failed:`, err.message);
});

console.log("🚀 Ownly Menu Sync Worker Started");

