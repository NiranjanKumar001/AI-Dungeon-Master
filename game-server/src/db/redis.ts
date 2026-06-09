import Redis from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

const opts = {
  lazyConnect:          true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue:   false,
  connectTimeout:       5000,
}

export const redis    = new Redis(REDIS_URL, opts)
export const redisSub = new Redis(REDIS_URL, { ...opts, maxRetriesPerRequest: null })

redis.on('connect', () => console.log('[redis] connected'))
redis.on('error',   e  => console.error('[redis] error:', e.message))
redisSub.on('error', e => console.error('[redis-sub] error:', e.message))

export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), redisSub.connect()])
}
