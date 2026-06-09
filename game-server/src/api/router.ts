import http from 'http'
import { v4 as uuid } from 'uuid'
import { putRoom, getRoom, getPlayersInRoom, putPlayer, setRoomStatus } from '../db/dynamodb'
import { assignRoom, getRoomServer } from '../cluster/RoomRegistry'
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  RegisterPlayerRequest,
  RegisterPlayerResponse,
  StartRoomResponse,
  RoomInfoResponse,
  PlayerClass,
  BiomeType,
} from '../types'

const SPAWN_POINT = { x: 320, y: 320 }
const MAX_HP: Record<PlayerClass, number> = { warrior: 100, mage: 70, rogue: 85 }
const BASE_STATS: Record<PlayerClass, { str: number; mag: number; agi: number }> = {
  warrior: { str: 8, mag: 2, agi: 5 },
  mage:    { str: 3, mag: 9, agi: 6 },
  rogue:   { str: 5, mag: 4, agi: 9 },
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end',  () => resolve(data))
    req.on('error', reject)
  })
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateRoom(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as CreateRoomRequest
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
  const wsUrl  = await assignRoom(roomId)  // picks least-loaded server, stores in Redis

  await putRoom({
    roomId,
    hostId:        body.hostId,
    theme:         body.biome,
    status:        'lobby',
    currentRoomId: 'entrance_hall',
    createdAt:     new Date().toISOString(),
    mapSeed:       uuid(),
    bossDefeated:  false,
  })

  json(res, 201, { roomId, wsUrl } satisfies CreateRoomResponse)
}

async function handleGetRoom(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  roomId: string,
): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) { json(res, 404, { error: 'Room not found' }); return }

  const players = await getPlayersInRoom(roomId)

  json(res, 200, {
    roomId:  room.roomId,
    status:  room.status,
    biome:   room.theme as BiomeType,
    players: players.map(p => ({ name: p.name, class: p.class })),
  } satisfies RoomInfoResponse)
}

async function handleRegisterPlayer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as RegisterPlayerRequest
  const { roomId, name } = body
  const cls = body.class as PlayerClass

  const room = await getRoom(roomId)
  if (!room) { json(res, 404, { error: 'Room not found' }); return }
  if (room.status !== 'lobby') { json(res, 409, { error: 'Game already started' }); return }

  const playerId = uuid()
  const maxHp    = MAX_HP[cls] ?? 100

  await putPlayer({
    playerId,
    roomId,
    name,
    class:       cls,
    hp:          maxHp,
    maxHp,
    x:           SPAWN_POINT.x,
    y:           SPAWN_POINT.y,
    inventory:   [],
    stats:       BASE_STATS[cls],
    isAlive:     true,
    kills:       0,
    deaths:      0,
    damageDealt: 0,
    connectionId: '',
  })

  json(res, 201, {
    playerId,
    spawnX: SPAWN_POINT.x,
    spawnY: SPAWN_POINT.y,
  } satisfies RegisterPlayerResponse)
}

async function handleStartRoom(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  roomId: string,
): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) { json(res, 404, { error: 'Room not found' }); return }
  if (room.status !== 'lobby') { json(res, 409, { error: 'Room already started' }); return }

  await setRoomStatus(roomId, 'active')
  json(res, 200, { success: true } satisfies StartRoomResponse)
}

// ── Main request handler (export and mount in index.ts) ───────────────────────

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? 'GET'
  const url    = req.url    ?? '/'

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end()
    return
  }

  try {
    if (method === 'POST' && url === '/api/rooms') {
      await handleCreateRoom(req, res)
      return
    }

    const roomMatch = url.match(/^\/api\/rooms\/([^/]+)$/)
    if (roomMatch) {
      const roomId = roomMatch[1] as string
      if (method === 'GET') { await handleGetRoom(req, res, roomId); return }
      if (method === 'POST') { await handleStartRoom(req, res, roomId); return }
    }

    // GET /api/rooms/:id/server — returns which WS server hosts this room
    const serverMatch = url.match(/^\/api\/rooms\/([^/]+)\/server$/)
    if (serverMatch && method === 'GET') {
      const roomId  = serverMatch[1] as string
      const wsUrl   = await getRoomServer(roomId)
      if (!wsUrl) { json(res, 404, { error: 'Room not assigned to any server' }); return }
      json(res, 200, { wsUrl })
      return
    }

    if (method === 'POST' && url === '/api/players') {
      await handleRegisterPlayer(req, res)
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('[API error]', err)
    json(res, 500, { error: 'Internal server error' })
  }
}
