import { WebSocket } from 'ws'
import type {
  GameState, PlayerState, MsgInput,
  StateSnapshot, EnemyPublic,
} from '../types'
import { toPublic } from '../types'

const TICK_MS = 50 // 20 Hz
const TILE_SIZE = 32

const SPEED: Record<string, number> = { warrior: 3, mage: 2.5, rogue: 4 }

const loops = new Map<string, ReturnType<typeof setInterval>>()

export function startLoop(state: GameState): void {
  if (loops.has(state.roomId)) return
  const timer = setInterval(() => tick(state), TICK_MS)
  loops.set(state.roomId, timer)
  console.log(`[loop] Started: ${state.roomId}`)
}

export function stopLoop(roomId: string): void {
  const t = loops.get(roomId)
  if (!t) return
  clearInterval(t)
  loops.delete(roomId)
  console.log(`[loop] Stopped: ${roomId}`)
}

function tick(state: GameState): void {
  state.tick++

  // Process input buffer for each player
  for (const [playerId, inputs] of Object.entries(state.inputBuffer)) {
    const player = state.players[playerId]
    if (!player || !player.isAlive) { state.inputBuffer[playerId] = []; continue }

    for (const msg of inputs) {
      if (msg.type === 'INPUT') applyInput(state, player, msg)
    }
    state.inputBuffer[playerId] = []
  }

  // Tick down cooldowns
  for (const player of Object.values(state.players)) {
    if (player.attackCooldownMs > 0) player.attackCooldownMs -= TICK_MS
    if (player.abilityCooldowns.Q > 0) player.abilityCooldowns.Q -= TICK_MS
    if (player.abilityCooldowns.E > 0) player.abilityCooldowns.E -= TICK_MS
  }

  broadcastState(state)
}

function applyInput(state: GameState, player: PlayerState, msg: MsgInput): void {
  if (msg.seq <= player.lastInputSeq) return
  player.lastInputSeq = msg.seq
  player.lastInputTime = Date.now()

  const speed = SPEED[player.class] ?? 3
  const keys = msg.keys.map(k => k.toLowerCase())

  let dx = 0
  let dy = 0
  if (keys.includes('w') || keys.includes('arrowup'))    dy -= speed
  if (keys.includes('s') || keys.includes('arrowdown'))  dy += speed
  if (keys.includes('a') || keys.includes('arrowleft'))  dx -= speed
  if (keys.includes('d') || keys.includes('arrowright')) dx += speed

  // Normalize diagonal so speed is consistent
  if (dx !== 0 && dy !== 0) {
    const f = 1 / Math.sqrt(2)
    dx *= f
    dy *= f
  }

  // Update facing from mouse
  if (msg.mouseX !== undefined && msg.mouseY !== undefined) {
    player.facing = Math.round(
      Math.atan2(msg.mouseY - player.y, msg.mouseX - player.x) * (180 / Math.PI),
    )
  }

  // Axis-separated collision so players slide along walls
  const newX = player.x + dx
  const newY = player.y + dy
  if (!isWall(state, newX, player.y)) player.x = newX
  if (!isWall(state, player.x, newY)) player.y = newY

  player.animation = (dx !== 0 || dy !== 0) ? 'walk' : 'idle'
}

function isWall(state: GameState, x: number, y: number): boolean {
  const { tiles, width, height } = state.roomDef
  const col = Math.floor(x / TILE_SIZE)
  const row = Math.floor(y / TILE_SIZE)
  if (col < 0 || row < 0 || col >= width || row >= height) return true
  return tiles[row]?.[col] === 1
}

function broadcastState(state: GameState): void {
  const snapshot: StateSnapshot = {
    type: 'STATE',
    tick: state.tick,
    players: Object.values(state.players).map(toPublic),
    enemies: Object.values(state.enemies)
      .filter(e => e.isAlive)
      .map(e => ({
        id: e.id, type: e.type,
        x: e.x, y: e.y,
        hp: e.hp, maxHp: e.maxHp,
        facing: e.facing,
        aiState: e.aiState,
        isAlive: e.isAlive,
      })) as EnemyPublic[],
    projectiles: Object.values(state.projectiles).map(p => ({
      id: p.id, type: p.type, x: p.x, y: p.y,
    })),
    effects: state.pendingEffects.splice(0),
  }

  const str = JSON.stringify(snapshot)
  for (const player of Object.values(state.players)) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(str)
    }
  }

  state.prevSnapshot = snapshot
}
