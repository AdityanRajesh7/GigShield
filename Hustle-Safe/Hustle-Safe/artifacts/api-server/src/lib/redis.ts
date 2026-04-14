import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true, // Don't crash immediately if Redis is unreachable
});

redis.on("error", (err) => {
  logger.error(err, "Redis Client Error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis gracefully");
});
