import type { WebSocket } from 'ws'

// ── Primitive types ───────────────────────────────────────────────────────────

export type PlayerClass   = 'warrior' | 'mage' | 'rogue'
export type EnemyType     = 'goblin' | 'goblin_captain' | 'troll' | 'shadow' | 'boss'
export type EnemyAIState  = 'idle' | 'patrol' | 'alert' | 'chase' | 'attack' | 'return'
export type StatusEffect  = 'stunned' | 'slowed' | 'burning' | 'poisoned' | 'invisible' | 'boosted'
export type TileValue     = 0 | 1 | 2 | 3 | 4 | 5
export type GameTheme     = 'horror' | 'fantasy' | 'scifi' | 'mystery'
export type BiomeType     = 'dark_forest' | 'ancient_castle' | 'cursed_swamp' | 'volcanic_caverns' | 'frozen_tundra'

export interface BiomeDef {
  id: BiomeType
  name: string
  description: string
  theme: GameTheme
  startZone: string
  zones: string[]
  enemyPool: EnemyType[]
  ambientNarration: string
}
export type ItemType      = 'health_potion' | 'iron_key' | 'iron_sword' | 'dagger' | 'spellbook'
export type ProjectileType = 'arrow' | 'fireball' | 'dagger'
export type HitboxShape   = 'arc' | 'rect'
export type EffectType    = 'damage_number' | 'hit_flash' | 'heal_number'
export type GameOutcome   = 'victory' | 'defeat'

export type NarrationEventType =
  | 'player_killed_enemy'
  | 'player_took_heavy_hit'
  | 'player_died'
  | 'player_entered_new_room'
  | 'boss_appeared'
  | 'player_betrayed_ally'
  | 'all_enemies_cleared'
  | 'player_near_death'
  | 'player_idle_too_long'

// ── Item ─────────────────────────────────────────────────────────────────────

export interface Item {
  id: string
  type: ItemType
  quantity: number
}

// ── Player ───────────────────────────────────────────────────────────────────

export interface PlayerState {
  id: string
  name: string
  class: PlayerClass
  x: number
  y: number
  hp: number
  maxHp: number
  stamina: number
  facing: number            // degrees 0-359
  animation: string         // 'idle' | 'walk' | 'attack' | 'die'
  isAlive: boolean
  attackCooldownMs: number  // ms remaining until next basic attack allowed
  abilityCooldowns: { Q: number; E: number }
  statusEffects: StatusEffect[]
  inventory: Item[]
  hotbar: (Item | null)[]   // fixed 5 slots
  lastInputSeq: number
  lastInputTime: number     // unix ms — used for idle detection
  ws: WebSocket             // server-only, never broadcast
}

// Subset broadcast to other clients — strips ws and private fields
export interface PlayerPublic {
  id: string
  name: string
  class: PlayerClass
  x: number
  y: number
  hp: number
  maxHp: number
  facing: number
  animation: string
  statusEffects: StatusEffect[]
  isAlive: boolean
}

export function toPublic(p: PlayerState): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    class: p.class,
    x: p.x,
    y: p.y,
    hp: p.hp,
    maxHp: p.maxHp,
    facing: p.facing,
    animation: p.animation,
    statusEffects: p.statusEffects,
    isAlive: p.isAlive,
  }
}

// ── Enemy ─────────────────────────────────────────────────────────────────────

export interface EnemyState {
  id: string
  type: EnemyType
  x: number
  y: number
  hp: number
  maxHp: number
  facing: number
  aiState: EnemyAIState
  patrolPath: { x: number; y: number }[]
  patrolIndex: number
  spawnPoint: { x: number; y: number }
  alertTimer: number   // ms countdown while in ALERT state
  attackTimer: number  // ms until next attack fires
  isAlive: boolean
}

// Subset broadcast to clients
export type EnemyPublic = Pick<
  EnemyState,
  'id' | 'type' | 'x' | 'y' | 'hp' | 'maxHp' | 'facing' | 'aiState' | 'isAlive'
>

// ── Projectile ────────────────────────────────────────────────────────────────

export interface Projectile {
  id: string
  ownerId: string
  type: ProjectileType
  x: number
  y: number
  vx: number          // pixels per tick
  vy: number
  damage: number
  radius: number
  expiresAt: number   // tick number
}

export type ProjectilePublic = Pick<Projectile, 'id' | 'type' | 'x' | 'y'>

// ── Hitbox (transient — created and resolved within the same tick) ─────────────

export interface Hitbox {
  shape: HitboxShape
  ownerId: string
  damage: number
  // arc fields
  originX?: number
  originY?: number
  radius?: number
  angle?: number      // degrees
  sweep?: number      // degrees total arc width
  // rect fields
  x?: number
  y?: number
  width?: number
  height?: number
  requiresBehind?: boolean
  hitIds: Set<string> // entity ids already damaged this swing (prevent multi-hit)
}

// ── Effects (visual feedback broadcast with STATE) ────────────────────────────

export interface Effect {
  type: EffectType
  value?: number
  targetId?: string
  x?: number
  y?: number
  color?: string
}

// ── Map / Room ────────────────────────────────────────────────────────────────

export interface Door {
  id: string
  x: number
  y: number
  leadsTo: string
  locked: boolean
}

export interface EnemySpawn {
  type: EnemyType
  x: number
  y: number
  patrol: { x: number; y: number }[] | null
  stationary?: boolean
}

export interface ItemSpawn {
  type: ItemType
  x: number
  y: number
}

export interface RoomDefinition {
  id: string
  name: string
  width: number
  height: number
  tiles: TileValue[][]
  doors: Door[]
  enemySpawns: EnemySpawn[]
  items: ItemSpawn[]
  ambientNarration: string
  theme: GameTheme
}

// ── Client → Server messages ──────────────────────────────────────────────────

export interface MsgJoinRoom {
  type: 'JOIN_ROOM'
  roomId: string
  name: string
  class: PlayerClass
  biome?: BiomeType
}

export interface MsgInput {
  type: 'INPUT'
  keys: string[]
  mouseX: number
  mouseY: number
  seq: number
}

export interface MsgAttack {
  type: 'ATTACK'
  direction: number
  seq: number
}

export interface MsgAbility {
  type: 'ABILITY'
  slot: 'Q' | 'E'
  targetX: number
  targetY: number
  seq: number
}

export interface MsgInteract {
  type: 'INTERACT'
  objectId: string
  seq: number
}

export interface MsgUseItem {
  type: 'USE_ITEM'
  hotbarSlot: number
  seq: number
}

export interface MsgDropItem {
  type: 'DROP_ITEM'
  itemId: string
  seq: number
}

export interface MsgBetray {
  type: 'BETRAY'
  targetPlayerId: string
  seq: number
}

export type ClientMessage =
  | MsgJoinRoom
  | MsgInput
  | MsgAttack
  | MsgAbility
  | MsgInteract
  | MsgUseItem
  | MsgDropItem
  | MsgBetray

// ── Server → Client messages ──────────────────────────────────────────────────

export interface MsgWelcome {
  type: 'WELCOME'
  playerId: string
}

export interface MsgRoomState {
  type: 'ROOM_STATE'
  players: PlayerPublic[]
}

export interface StateSnapshot {
  type: 'STATE'
  tick: number
  players: PlayerPublic[]
  enemies: EnemyPublic[]
  projectiles: ProjectilePublic[]
  effects: Effect[]
}

export interface MsgPlayerJoined {
  type: 'PLAYER_JOINED'
  player: PlayerPublic
}

export interface MsgPlayerLeft {
  type: 'PLAYER_LEFT'
  id: string
}

export interface MsgPlayerDied {
  type: 'PLAYER_DIED'
  playerId: string
  killedBy: string
}

export interface MsgNarration {
  type: 'NARRATION'
  text: string
  duration: number
}

export interface MsgLoadRoom {
  type: 'LOAD_ROOM'
  roomId: string
  mapData: RoomDefinition
  spawnPoints: Record<string, { x: number; y: number }>
}

export interface MsgInventoryUpdate {
  type: 'INVENTORY_UPDATE'
  playerId: string
  inventory: Item[]
  hotbar: (Item | null)[]
}

export interface MsgGameOver {
  type: 'GAME_OVER'
  outcome: GameOutcome
  stats: Record<string, unknown>
}

export type ServerMessage =
  | MsgWelcome
  | MsgRoomState
  | StateSnapshot
  | MsgPlayerJoined
  | MsgPlayerLeft
  | MsgPlayerDied
  | MsgNarration
  | MsgLoadRoom
  | MsgInventoryUpdate
  | MsgGameOver

// ── Game State (per room, server-only) ───────────────────────────────────────

export interface GameState {
  roomId: string
  biome: BiomeType
  biomeDef: BiomeDef  // loaded once at room creation, holds theme + zone list
  tick: number
  players: Record<string, PlayerState>
  enemies: Record<string, EnemyState>
  projectiles: Record<string, Projectile>
  activeHitboxes: Hitbox[]
  inputBuffer: Record<string, ClientMessage[]>
  roomDef: RoomDefinition
  prevSnapshot: StateSnapshot | null
  narrationActive: boolean
  lastNarrationTime: Record<NarrationEventType, number>
  pendingEffects: Effect[]
}

// ── Narration event ───────────────────────────────────────────────────────────

export interface NarrationEvent {
  type: NarrationEventType
  involvedPlayers: string[]
  involvedEnemies?: string[]
  context: Record<string, unknown>
}

// ── REST API shapes ───────────────────────────────────────────────────────────

export interface CreateRoomRequest  { hostId: string; biome: BiomeType }
export interface CreateRoomResponse { roomId: string; wsUrl: string }

export interface RegisterPlayerRequest  { roomId: string; name: string; class: PlayerClass }
export interface RegisterPlayerResponse { playerId: string; spawnX: number; spawnY: number }

export interface StartRoomResponse { success: boolean }

export interface RoomInfoResponse {
  roomId: string
  status: 'lobby' | 'active' | 'ended'
  biome: BiomeType
  players: { name: string; class: PlayerClass }[]
}
