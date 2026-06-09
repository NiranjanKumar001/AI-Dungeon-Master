import { WebSocket } from 'ws'
import { v4 as uuid } from 'uuid'
import type {
  GameState, BiomeType, PlayerState, PlayerClass,
  EnemyState, NarrationEventType,
} from '../types'
import { loadBiome, loadZone } from '../maps/MapLoader'

const MAX_HP: Record<PlayerClass, number> = { warrior: 100, mage: 70, rogue: 85 }

const ENEMY_HP: Record<string, number> = {
  goblin: 30,
  goblin_captain: 60,
  troll: 120,
  shadow: 50,
  boss: 500,
}

class RoomManager {
  private states = new Map<string, GameState>()

  getOrCreate(roomId: string, biome: BiomeType = 'ancient_castle'): GameState {
    const existing = this.states.get(roomId)
    if (existing) return existing

    const biomeDef = loadBiome(biome)
    const roomDef  = loadZone(biome, biomeDef.startZone)

    const state: GameState = {
      roomId,
      biome,
      biomeDef,
      tick: 0,
      players: {},
      enemies: {},
      projectiles: {},
      activeHitboxes: [],
      inputBuffer: {},
      roomDef,
      prevSnapshot: null,
      narrationActive: false,
      lastNarrationTime: {} as Record<NarrationEventType, number>,
      pendingEffects: [],
    }

    for (const spawn of roomDef.enemySpawns) {
      const enemyId = uuid()
      const hp = ENEMY_HP[spawn.type] ?? 30
      const enemy: EnemyState = {
        id: enemyId,
        type: spawn.type,
        x: spawn.x,
        y: spawn.y,
        hp,
        maxHp: hp,
        facing: 0,
        aiState: spawn.stationary ? 'idle' : 'patrol',
        patrolPath: spawn.patrol ?? [],
        patrolIndex: 0,
        spawnPoint: { x: spawn.x, y: spawn.y },
        alertTimer: 0,
        attackTimer: 0,
        isAlive: true,
      }
      state.enemies[enemyId] = enemy
    }

    this.states.set(roomId, state)
    console.log(`[room] Created: ${roomId} (${biome} → ${biomeDef.startZone})`)
    return state
  }

  addPlayer(
    state: GameState,
    playerId: string,
    name: string,
    cls: PlayerClass,
    ws: WebSocket,
  ): PlayerState {
    const maxHp = MAX_HP[cls]
    const player: PlayerState = {
      id: playerId,
      name,
      class: cls,
      x: 320,
      y: 320,
      hp: maxHp,
      maxHp,
      stamina: 100,
      facing: 0,
      animation: 'idle',
      isAlive: true,
      attackCooldownMs: 0,
      abilityCooldowns: { Q: 0, E: 0 },
      statusEffects: [],
      inventory: [],
      hotbar: [null, null, null, null, null],
      lastInputSeq: 0,
      lastInputTime: Date.now(),
      ws,
    }
    state.players[playerId] = player
    state.inputBuffer[playerId] = []
    return player
  }

  removePlayer(state: GameState, playerId: string): void {
    delete state.players[playerId]
    delete state.inputBuffer[playerId]
  }

  get(roomId: string): GameState | undefined {
    return this.states.get(roomId)
  }

  delete(roomId: string): void {
    this.states.delete(roomId)
  }

  size(): number {
    return this.states.size
  }
}

export const roomManager = new RoomManager()
