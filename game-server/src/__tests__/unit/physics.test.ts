// Tests for movement physics extracted from GameLoop
// We test the logic directly by importing helpers

import { loadZone, loadBiome } from '../../maps/MapLoader'
import type { GameState, PlayerState, MsgInput } from '../../types'

const TILE = 32

// Inline the logic from GameLoop so tests don't need a WS server
function isWall(state: Pick<GameState, 'roomDef'>, x: number, y: number): boolean {
  const { tiles, width, height } = state.roomDef
  const col = Math.floor(x / TILE)
  const row = Math.floor(y / TILE)
  if (col < 0 || row < 0 || col >= width || row >= height) return true
  return tiles[row]?.[col] === 1
}

const SPEED: Record<string, number> = { warrior: 3, mage: 2.5, rogue: 4 }

function applyInput(
  state: Pick<GameState, 'roomDef'>,
  player: PlayerState,
  msg: MsgInput,
): void {
  if (msg.seq <= player.lastInputSeq) return
  player.lastInputSeq = msg.seq

  const speed = SPEED[player.class] ?? 3
  const keys  = msg.keys.map(k => k.toLowerCase())

  let dx = 0, dy = 0
  if (keys.includes('w')) dy -= speed
  if (keys.includes('s')) dy += speed
  if (keys.includes('a')) dx -= speed
  if (keys.includes('d')) dx += speed

  if (dx !== 0 && dy !== 0) {
    const f = 1 / Math.sqrt(2)
    dx *= f; dy *= f
  }

  const newX = player.x + dx
  const newY = player.y + dy
  if (!isWall(state, newX, player.y)) player.x = newX
  if (!isWall(state, player.x, newY)) player.y = newY

  player.animation = (dx !== 0 || dy !== 0) ? 'walk' : 'idle'
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeState(): Pick<GameState, 'roomDef'> {
  return { roomDef: loadZone('ancient_castle', 'entrance_hall') }
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1', name: 'Test', class: 'warrior',
    x: 320, y: 320,
    hp: 100, maxHp: 100,
    stamina: 100, facing: 0,
    animation: 'idle', isAlive: true,
    attackCooldownMs: 0,
    abilityCooldowns: { Q: 0, E: 0 },
    statusEffects: [], inventory: [],
    hotbar: [null, null, null, null, null],
    lastInputSeq: 0, lastInputTime: 0,
    ws: {} as never,
    ...overrides,
  }
}

function makeInput(keys: string[], seq = 1): MsgInput {
  return { type: 'INPUT', keys, mouseX: 320, mouseY: 320, seq }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isWall()', () => {
  const state = makeState()

  test('floor tile returns false', () => {
    expect(isWall(state, 320, 320)).toBe(false)
  })

  test('wall tile returns true', () => {
    // tile (0,0) is always a wall in entrance_hall
    expect(isWall(state, 0, 0)).toBe(true)
  })

  test('out of bounds returns true', () => {
    expect(isWall(state, -1, 320)).toBe(true)
    expect(isWall(state, 320, -1)).toBe(true)
    expect(isWall(state, 9999, 320)).toBe(true)
  })

  test('right border wall returns true', () => {
    // col 19 row 7 has a door opening (tile=0), col 19 row 0 is wall
    expect(isWall(state, 19 * TILE, 0)).toBe(true)
  })
})

describe('applyInput() — movement', () => {
  const state = makeState()

  test('W key moves player up', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput(['w']))
    expect(p.y).toBeLessThan(320)
    expect(p.x).toBe(320)
  })

  test('S key moves player down', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput(['s']))
    expect(p.y).toBeGreaterThan(320)
  })

  test('A key moves player left', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput(['a']))
    expect(p.x).toBeLessThan(320)
  })

  test('D key moves player right', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput(['d']))
    expect(p.x).toBeGreaterThan(320)
  })

  test('no keys keeps player stationary', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput([]))
    expect(p.x).toBe(320)
    expect(p.y).toBe(320)
  })
})

describe('applyInput() — diagonal normalisation', () => {
  const state = makeState()

  test('diagonal speed equals cardinal speed', () => {
    const cardinal  = makePlayer()
    const diagonal  = makePlayer()

    applyInput(state, cardinal, makeInput(['w']))
    applyInput(state, diagonal, makeInput(['w', 'd']))

    const cardinalDist = Math.abs(320 - cardinal.y)
    const diagDist     = Math.hypot(diagonal.x - 320, diagonal.y - 320)

    expect(diagDist).toBeCloseTo(cardinalDist, 0)
  })
})

describe('applyInput() — wall collision', () => {
  const state = makeState()

  test('player cannot move into left border wall', () => {
    // spawn near left wall — col 1 = x 32..63, col 0 is wall
    const p = makePlayer({ x: 36, y: 320 })
    const before = p.x
    applyInput(state, p, makeInput(['a']))
    // should slide along wall or stop — x must not go into col 0 (wall)
    expect(Math.floor(p.x / TILE)).toBeGreaterThanOrEqual(1)
    expect(p.x).toBeLessThanOrEqual(before) // didn't move through
  })

  test('player cannot move into top border wall', () => {
    const p = makePlayer({ x: 320, y: 36 })
    applyInput(state, p, makeInput(['w']))
    expect(Math.floor(p.y / TILE)).toBeGreaterThanOrEqual(1)
  })
})

describe('applyInput() — seq deduplication', () => {
  const state = makeState()

  test('stale seq is discarded', () => {
    const p = makePlayer({ lastInputSeq: 10 })
    applyInput(state, p, makeInput(['d'], 5)) // seq 5 < lastInputSeq 10
    expect(p.x).toBe(320) // no movement
  })

  test('equal seq is discarded', () => {
    const p = makePlayer({ lastInputSeq: 5 })
    applyInput(state, p, makeInput(['d'], 5))
    expect(p.x).toBe(320)
  })

  test('newer seq is processed', () => {
    const p = makePlayer({ lastInputSeq: 5 })
    applyInput(state, p, makeInput(['d'], 6))
    expect(p.x).toBeGreaterThan(320)
  })
})

describe('applyInput() — animation', () => {
  const state = makeState()

  test('moving sets animation to walk', () => {
    const p = makePlayer()
    applyInput(state, p, makeInput(['w']))
    expect(p.animation).toBe('walk')
  })

  test('no keys sets animation to idle', () => {
    const p = makePlayer({ animation: 'walk' })
    applyInput(state, p, makeInput([]))
    expect(p.animation).toBe('idle')
  })
})

describe('class speeds', () => {
  const state = makeState()

  test('rogue moves faster than warrior', () => {
    const warrior = makePlayer({ class: 'warrior' })
    const rogue   = makePlayer({ class: 'rogue' })
    applyInput(state, warrior, makeInput(['d'], 1))
    applyInput(state, rogue,   makeInput(['d'], 1))
    expect(rogue.x).toBeGreaterThan(warrior.x)
  })

  test('mage moves slower than warrior', () => {
    const warrior = makePlayer({ class: 'warrior' })
    const mage    = makePlayer({ class: 'mage' })
    applyInput(state, warrior, makeInput(['d'], 1))
    applyInput(state, mage,    makeInput(['d'], 1))
    expect(mage.x).toBeLessThan(warrior.x)
  })
})
