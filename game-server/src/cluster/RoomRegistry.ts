import { redis } from '../db/redis'
import { SERVER_URL } from './Heartbeat'

const ROOM_TTL = 3600 // 1 hour

// Called at POST /api/rooms — picks least-loaded server, stores assignment
export async function assignRoom(roomId: string): Promise<string> {
  try {
    const serverUrl = await pickLeastLoaded()
    await redis.set(`room:${roomId}:url`, serverUrl, 'EX', ROOM_TTL)
    console.log(`[registry] Room ${roomId} → ${serverUrl}`)
    return serverUrl
  } catch {
    // Redis unavailable — single server mode
    return SERVER_URL
  }
}

// Called at GET /api/rooms/:id/server — tells client which WS server to connect to
export async function getRoomServer(roomId: string): Promise<string | null> {
  try {
    return await redis.get(`room:${roomId}:url`)
  } catch {
    return SERVER_URL
  }
}

// Called when room closes — free up the slot in registry
export async function releaseRoom(roomId: string): Promise<void> {
  try {
    await redis.del(`room:${roomId}:url`)
  } catch {
    // ignore
  }
}

async function pickLeastLoaded(): Promise<string> {
  // All live servers have heartbeat keys — expired servers are invisible
  const roomKeys = await redis.keys('server:*:rooms')
  if (roomKeys.length === 0) return SERVER_URL

  const pipeline = redis.pipeline()
  roomKeys.forEach(k => pipeline.get(k))
  roomKeys.forEach(k => pipeline.get(k.replace(':rooms', ':max')))
  roomKeys.forEach(k => pipeline.get(k.replace(':rooms', ':url')))
  const results = await pipeline.exec() ?? []

  const n = roomKeys.length
  let bestUrl   = SERVER_URL
  let bestScore = Infinity

  for (let i = 0; i < n; i++) {
    const rooms = parseInt((results[i]?.[1]       as string) ?? '999', 10)
    const max   = parseInt((results[n + i]?.[1]   as string) ?? '100', 10)
    const url   =          (results[2 * n + i]?.[1] as string) ?? ''
    if (!url) continue

    const load = rooms / max  // 0.0 → 1.0
    if (load < bestScore) {
      bestScore = load
      bestUrl   = url
    }
  }

  return bestUrl
}
