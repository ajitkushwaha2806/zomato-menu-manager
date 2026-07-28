import { swiggyProcessorQueue } from "../queue/swiggy-processor";

export const swiggyProcessorJob = async ({
    resId,
    type,
    syncId,
    action,
    payload,
    accountName,
}) => {
    try {
        const job = await swiggyProcessorQueue.add(
            "swiggy-processor",
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
                    delay: 5000,
                },
                removeOnComplete: 1000
            }
        );

        console.log(
            `✅ Swiggy processor queued`
        );

        return job;
    } catch (error) {
        console.error(
            `❌ Failed to queue swiggy processor`,
            error
        );

        throw error;
    }
};