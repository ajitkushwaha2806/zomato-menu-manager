import { ownlyProcessorQueue } from "../queue/ownly-processor.js";

export const ownlyProcessorJob = async ({
    resId,
    type,
    syncId,
    action,
    payload,
    accountName,
}) => {
    try {
        const job = await ownlyProcessorQueue.add(
            "ownly-processor",
            {
                resId,
                type,
                syncId,
                action,
                payload,
                accountName,
            },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 3000,
                },
                removeOnComplete: 1000,
            }
        );

        console.log(`✅ Ownly processor queued: ${type} ${action || ""} (Job ID: ${job.id})`);
        return job;
    } catch (error) {
        console.error(`❌ Failed to queue Ownly processor:`, error);
        throw error;
    }
};

