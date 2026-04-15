import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let _redis: Redis | null = null;
let _redisAvailable = false;

function createRedis(): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,         // Don't connect immediately
    enableOfflineQueue: false, // Fail fast when disconnected — lets try/catch work
    maxRetriesPerRequest: 0,   // Don't retry — return error immediately
    retryStrategy: (times) => {
      // Back off and keep trying in the background, but don't block commands
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 200, 3000);
    },
  });

  client.on("connect", () => {
    _redisAvailable = true;
    logger.info("Connected to Redis");
  });

  client.on("error", (err) => {
    _redisAvailable = false;
    // Log but don't crash — error is handled by the caller
    logger.warn({ code: (err as any).code }, "Redis unavailable — fraud caching disabled");
  });

  client.on("close", () => {
    _redisAvailable = false;
  });

  return client;
}

// Lazy singleton
export function getRedis(): Redis {
  if (!_redis) {
    _redis = createRedis();
  }
  return _redis;
}

export function isRedisAvailable(): boolean {
  return _redisAvailable;
}

// Convenience export for callers that already import `redis`
export const redis = {
  async get(key: string): Promise<string | null> {
    if (!isRedisAvailable()) return null;
    try {
      return await getRedis().get(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string, ...args: any[]): Promise<void> {
    if (!isRedisAvailable()) return;
    try {
      // @ts-ignore
      await getRedis().set(key, value, ...args);
    } catch {
      // swallow — caching is best-effort
    }
  },
};

// Attempt to connect in the background — don't await, don't crash if it fails
getRedis().connect().catch(() => {
  logger.warn("Redis not reachable on startup — will retry in background");
});
