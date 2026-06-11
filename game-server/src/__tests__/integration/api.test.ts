import http from 'http'
import { handleRequest } from '../../api/router'

// Mock DynamoDB so tests don't hit real AWS
jest.mock('../../db/dynamodb', () => ({
  putRoom:          jest.fn().mockResolvedValue(undefined),
  getRoom:          jest.fn(),
  getPlayersInRoom: jest.fn().mockResolvedValue([]),
  putPlayer:        jest.fn().mockResolvedValue(undefined),
  setRoomStatus:    jest.fn().mockResolvedValue(undefined),
}))

// Mock RoomRegistry so tests don't need Redis
jest.mock('../../cluster/RoomRegistry', () => ({
  assignRoom:    jest.fn().mockResolvedValue('ws://localhost:4000'),
  getRoomServer: jest.fn().mockResolvedValue('ws://localhost:4000'),
  releaseRoom:   jest.fn().mockResolvedValue(undefined),
}))

import { getRoom } from '../../db/dynamodb'
const mockGetRoom = getRoom as jest.Mock

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(method: string, url: string, body?: object): http.IncomingMessage {
  const req = Object.assign(
    new (require('stream').Readable)(),
    { method, url, headers: { 'content-type': 'application/json' } },
  ) as http.IncomingMessage

  if (body) {
    const str = JSON.stringify(body)
    req.push(str)
    req.push(null)
  } else {
    req.push(null)
  }
  return req
}

function makeRes(): { res: http.ServerResponse; data: () => string; status: () => number } {
  let statusCode = 200
  let body = ''

  const res = {
    writeHead: (code: number) => { statusCode = code },
    end: (payload: string) => { body = payload },
  } as unknown as http.ServerResponse

  return { res, data: () => body, status: () => statusCode }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  test('creates room with valid biome', async () => {
    const req = makeReq('POST', '/api/rooms', { hostId: 'user1', biome: 'dark_forest' })
    const { res, data, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(201)
    const body = JSON.parse(data())
    expect(body.roomId).toMatch(/^[A-Z0-9]{6}$/)
    expect(body.wsUrl).toBe('ws://localhost:4000')
  })

  test('returns unique roomId each call', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const req = makeReq('POST', '/api/rooms', { hostId: 'u', biome: 'ancient_castle' })
      const { res, data } = makeRes()
      await handleRequest(req, res)
      ids.add(JSON.parse(data()).roomId)
    }
    expect(ids.size).toBe(5)
  })
})

describe('GET /api/rooms/:id', () => {
  test('returns room info when room exists', async () => {
    mockGetRoom.mockResolvedValueOnce({
      roomId: 'ABC123', status: 'lobby',
      theme: 'dark_forest', hostId: 'u1',
      currentRoomId: 'forest_clearing',
      createdAt: new Date().toISOString(),
      mapSeed: 'seed', bossDefeated: false,
    })

    const req = makeReq('GET', '/api/rooms/ABC123')
    const { res, data, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(200)
    const body = JSON.parse(data())
    expect(body.roomId).toBe('ABC123')
    expect(body.biome).toBe('dark_forest')
    expect(body.status).toBe('lobby')
    expect(body.players).toEqual([])
  })

  test('returns 404 when room not found', async () => {
    mockGetRoom.mockResolvedValueOnce(null)

    const req = makeReq('GET', '/api/rooms/NOTEXIST')
    const { res, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(404)
  })
})

describe('POST /api/players', () => {
  test('registers player when room is in lobby', async () => {
    mockGetRoom.mockResolvedValueOnce({
      roomId: 'ROOM01', status: 'lobby',
      theme: 'ancient_castle', hostId: 'u',
      currentRoomId: 'entrance_hall',
      createdAt: new Date().toISOString(),
      mapSeed: 'x', bossDefeated: false,
    })

    const req = makeReq('POST', '/api/players', {
      roomId: 'ROOM01', name: 'Mohit', class: 'warrior',
    })
    const { res, data, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(201)
    const body = JSON.parse(data())
    expect(body.playerId).toBeTruthy()
    expect(body.spawnX).toBe(320)
    expect(body.spawnY).toBe(320)
  })

  test('returns 404 when room does not exist', async () => {
    mockGetRoom.mockResolvedValueOnce(null)

    const req = makeReq('POST', '/api/players', {
      roomId: 'GHOST', name: 'X', class: 'mage',
    })
    const { res, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(404)
  })

  test('returns 409 when room already started', async () => {
    mockGetRoom.mockResolvedValueOnce({
      roomId: 'STARTED', status: 'active',
      theme: 'dark_forest', hostId: 'u',
      currentRoomId: 'forest_clearing',
      createdAt: new Date().toISOString(),
      mapSeed: 'x', bossDefeated: false,
    })

    const req = makeReq('POST', '/api/players', {
      roomId: 'STARTED', name: 'Late', class: 'rogue',
    })
    const { res, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(409)
  })
})

describe('GET /api/rooms/:id/server', () => {
  test('returns wsUrl for existing room', async () => {
    const req = makeReq('GET', '/api/rooms/ANYROOM/server')
    const { res, data, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(200)
    expect(JSON.parse(data()).wsUrl).toBe('ws://localhost:4000')
  })
})

describe('POST /api/rooms/:id (start)', () => {
  test('starts lobby room successfully', async () => {
    mockGetRoom.mockResolvedValueOnce({
      roomId: 'LOBBY1', status: 'lobby',
      theme: 'frozen_tundra', hostId: 'u',
      currentRoomId: 'tundra_outpost',
      createdAt: new Date().toISOString(),
      mapSeed: 'x', bossDefeated: false,
    })

    const req = makeReq('POST', '/api/rooms/LOBBY1')
    const { res, data, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(200)
    expect(JSON.parse(data()).success).toBe(true)
  })

  test('returns 409 when room already active', async () => {
    mockGetRoom.mockResolvedValueOnce({
      roomId: 'ACTIVE1', status: 'active',
      theme: 'volcanic_caverns', hostId: 'u',
      currentRoomId: 'lava_entrance',
      createdAt: new Date().toISOString(),
      mapSeed: 'x', bossDefeated: false,
    })

    const req = makeReq('POST', '/api/rooms/ACTIVE1')
    const { res, status } = makeRes()
    await handleRequest(req, res)

    expect(status()).toBe(409)
  })
})

describe('CORS', () => {
  test('OPTIONS returns 204 with CORS headers', async () => {
    const req = makeReq('OPTIONS', '/api/rooms')
    let statusCode = 0
    const res = {
      writeHead: (code: number) => { statusCode = code },
      end: jest.fn(),
    } as unknown as http.ServerResponse

    await handleRequest(req, res)
    expect(statusCode).toBe(204)
  })
})

describe('404', () => {
  test('unknown route returns 404', async () => {
    const req = makeReq('GET', '/api/nonexistent')
    const { res, status } = makeRes()
    await handleRequest(req, res)
    expect(status()).toBe(404)
  })
})
