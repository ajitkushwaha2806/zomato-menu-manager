import { Queue } from "bullmq";
import { redisConnection } from "../redis.js";

export const swiggyProcessorQueue = new Queue("swiggyProcessorQueue", {
    connection: redisConnection,
});