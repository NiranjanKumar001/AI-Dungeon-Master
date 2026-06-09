import { redis } from '../db/redis'
import { v4 as uuid } from 'uuid'

// Each server instance gets a unique ID — ECS can override via SERVER_ID env var
export const SERVER_ID  = process.env['SERVER_ID']           ?? uuid()
export const SERVER_URL = process.env['SERVER_PUBLIC_URL']   ?? `ws://localhost:${process.env['SERVER_PORT'] ?? 4000}`
export const MAX_ROOMS  = parseInt(process.env['MAX_ROOMS_PER_SERVER'] ?? '100', 10)

const TTL_SECS  = 15    // auto-expire after 3 missed heartbeats = dead server
const INTERVAL  = 5000  // 5s between heartbeats

export function startHeartbeat(getRoomCount: () => number): void {
  const beat = async () => {
    try {
      await redis.pipeline()
        .set(`server:${SERVER_ID}:url`,   SERVER_URL,     'EX', TTL_SECS)
        .set(`server:${SERVER_ID}:rooms`, getRoomCount(), 'EX', TTL_SECS)
        .set(`server:${SERVER_ID}:max`,   MAX_ROOMS,      'EX', TTL_SECS)
        .exec()
    } catch {
      // Redis unavailable — single-server mode, ignore
    }
  }

  beat()
  setInterval(beat, INTERVAL).unref() // unref so it doesn't block process exit
  console.log(`[heartbeat] ${SERVER_ID} (max ${MAX_ROOMS} rooms) → Redis every ${INTERVAL}ms`)
}
