import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const globalForRedis = global;

export const redisConnection =
    globalForRedis.redisConnection ||
    new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
    });

if (process.env.NODE_ENV !== "production") {
    globalForRedis.redisConnection = redisConnection;
}
