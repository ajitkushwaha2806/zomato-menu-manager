import { Queue } from "bullmq";
import { redisConnection } from "../redis.js";

export const ownlyProcessorQueue = new Queue("ownlyProcessorQueue", {
    connection: redisConnection,
});

