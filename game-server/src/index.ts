import 'dotenv/config'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuid } from 'uuid'
import { handleRequest } from './api/router'
import { roomManager } from './game/RoomManager'
import { startLoop, stopLoop } from './game/GameLoop'
import { connectRedis } from './db/redis'
import { startHeartbeat } from './cluster/Heartbeat'
import { releaseRoom } from './cluster/RoomRegistry'
import { toPublic } from './types'
import type { ClientMessage, GameState } from './types'

const PORT = parseInt(process.env['SERVER_PORT'] ?? '4000', 10)

const server = http.createServer(async (req, res) => {
  await handleRequest(req, res)
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws: WebSocket) => {
  const playerId = uuid()
  let currentRoomId: string | null = null

  console.log(`[+] ${playerId} connected`)
  send(ws, { type: 'WELCOME', playerId })

  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'JOIN_ROOM': {
        currentRoomId = msg.roomId
        const state = roomManager.getOrCreate(msg.roomId, msg.biome)
        const player = roomManager.addPlayer(state, playerId, msg.name, msg.class, ws)

        broadcastExcept(state, playerId, { type: 'PLAYER_JOINED', player: toPublic(player) })

        // Send map definition so client can render tiles, doors, etc.
        send(ws, {
          type: 'LOAD_ROOM',
          roomId: state.roomDef.id,
          mapData: state.roomDef,
          spawnPoints: { [playerId]: { x: player.x, y: player.y } },
        })

        const others = Object.values(state.players)
          .filter(p => p.id !== playerId)
          .map(toPublic)
        send(ws, { type: 'ROOM_STATE', players: others })

        startLoop(state)
        console.log(`[=] ${msg.name} (${msg.class}) → room ${msg.roomId}`)
        break
      }

      case 'INPUT': {
        if (!currentRoomId) break
        const state = roomManager.get(currentRoomId)
        if (!state) break
        state.inputBuffer[playerId]?.push(msg)
        break
      }

      case 'ATTACK':
      case 'ABILITY':
      case 'INTERACT':
      case 'USE_ITEM':
      case 'DROP_ITEM':
      case 'BETRAY': {
        if (!currentRoomId) break
        const state = roomManager.get(currentRoomId)
        if (!state) break
        state.inputBuffer[playerId]?.push(msg)
        break
      }
    }
  })

  ws.on('close', () => {
    console.log(`[-] ${playerId} disconnected`)
    if (!currentRoomId) return

    const state = roomManager.get(currentRoomId)
    if (!state) return

    roomManager.removePlayer(state, playerId)
    broadcastAll(state, { type: 'PLAYER_LEFT', id: playerId })

    if (Object.keys(state.players).length === 0) {
      stopLoop(currentRoomId)
      roomManager.delete(currentRoomId)
      releaseRoom(currentRoomId)
      console.log(`[x] Room ${currentRoomId} closed`)
    }
  })

  ws.on('error', (err: Error) => console.error('WS error:', err))
})

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

function broadcastExcept(state: GameState, exceptId: string, data: object): void {
  const str = JSON.stringify(data)
  for (const p of Object.values(state.players)) {
    if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(str)
  }
}

function broadcastAll(state: GameState, data: object): void {
  const str = JSON.stringify(data)
  for (const p of Object.values(state.players)) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(str)
  }
}

server.listen(PORT, () => {
  console.log(`Game server running`)
  console.log(`  WS  — ws://localhost:${PORT}`)
  console.log(`  API — http://localhost:${PORT}/api`)

  // Connect to Redis then start announcing this server to the registry
  connectRedis()
    .then(() => startHeartbeat(() => roomManager.size()))
    .catch(err => console.warn('[redis] unavailable, running single-server mode:', (err as Error).message))
})
