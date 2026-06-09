import { roomManager } from '../../game/RoomManager'
import type { BiomeType } from '../../types'

// fresh RoomManager per test — import re-runs the singleton
// so we work around it by deleting rooms after each test
afterEach(() => {
  // clean up any rooms created during test
  ;(roomManager as never as { states: Map<string, unknown> })
    .states.clear()
})

const DUMMY_WS = {
  readyState: 1,
  send: jest.fn(),
} as never

describe('RoomManager', () => {
  describe('getOrCreate()', () => {
    test('creates new GameState for unknown roomId', () => {
      const state = roomManager.getOrCreate('ROOM01', 'dark_forest')
      expect(state.roomId).toBe('ROOM01')
      expect(state.biome).toBe('dark_forest')
    })

    test('returns same state on second call', () => {
      const a = roomManager.getOrCreate('ROOM02', 'ancient_castle')
      const b = roomManager.getOrCreate('ROOM02', 'ancient_castle')
      expect(a).toBe(b)
    })

    test('loads correct start zone for each biome', () => {
      const biomeZone: Record<BiomeType, string> = {
        dark_forest:       'forest_clearing',
        ancient_castle:    'entrance_hall',
        cursed_swamp:      'swamp_edge',
        volcanic_caverns:  'lava_entrance',
        frozen_tundra:     'tundra_outpost',
      }

      Object.entries(biomeZone).forEach(([biome, zone]) => {
        const roomId = `TEST_${biome}`
        const state  = roomManager.getOrCreate(roomId, biome as BiomeType)
        expect(state.roomDef.id).toBe(zone)
      })
    })

    test('spawns enemies from room definition', () => {
      const state = roomManager.getOrCreate('ROOM_ENEMY', 'dark_forest')
      const enemies = Object.values(state.enemies)
      // forest_clearing has 3 enemy spawns
      expect(enemies.length).toBe(3)
      enemies.forEach(e => {
        expect(e.isAlive).toBe(true)
        expect(e.hp).toBeGreaterThan(0)
        expect(e.id).toBeTruthy()
      })
    })

    test('starts with empty players and inputBuffer', () => {
      const state = roomManager.getOrCreate('ROOM_EMPTY', 'frozen_tundra')
      expect(Object.keys(state.players)).toHaveLength(0)
      expect(Object.keys(state.inputBuffer)).toHaveLength(0)
    })

    test('tick starts at 0', () => {
      const state = roomManager.getOrCreate('ROOM_TICK', 'cursed_swamp')
      expect(state.tick).toBe(0)
    })

    test('biomeDef is stored on state', () => {
      const state = roomManager.getOrCreate('ROOM_BDEF', 'volcanic_caverns')
      expect(state.biomeDef.id).toBe('volcanic_caverns')
      expect(state.biomeDef.theme).toBe('fantasy')
    })
  })

  describe('addPlayer()', () => {
    test('adds player with correct class HP', () => {
      const state = roomManager.getOrCreate('ROOM_HP', 'ancient_castle')

      const warrior = roomManager.addPlayer(state, 'p1', 'Mohit', 'warrior', DUMMY_WS)
      const mage    = roomManager.addPlayer(state, 'p2', 'Raj',   'mage',    DUMMY_WS)
      const rogue   = roomManager.addPlayer(state, 'p3', 'Priya', 'rogue',   DUMMY_WS)

      expect(warrior.maxHp).toBe(100)
      expect(mage.maxHp).toBe(70)
      expect(rogue.maxHp).toBe(85)
    })

    test('player starts alive at spawn point', () => {
      const state  = roomManager.getOrCreate('ROOM_SPAWN', 'dark_forest')
      const player = roomManager.addPlayer(state, 'p1', 'Test', 'warrior', DUMMY_WS)

      expect(player.isAlive).toBe(true)
      expect(player.x).toBe(320)
      expect(player.y).toBe(320)
    })

    test('player appears in state.players', () => {
      const state = roomManager.getOrCreate('ROOM_ADD', 'cursed_swamp')
      roomManager.addPlayer(state, 'pX', 'A', 'warrior', DUMMY_WS)
      expect(state.players['pX']).toBeDefined()
    })

    test('inputBuffer entry created for player', () => {
      const state = roomManager.getOrCreate('ROOM_BUF', 'frozen_tundra')
      roomManager.addPlayer(state, 'pBuf', 'B', 'mage', DUMMY_WS)
      expect(state.inputBuffer['pBuf']).toEqual([])
    })

    test('hotbar starts empty (5 null slots)', () => {
      const state  = roomManager.getOrCreate('ROOM_HOT', 'ancient_castle')
      const player = roomManager.addPlayer(state, 'pH', 'C', 'rogue', DUMMY_WS)
      expect(player.hotbar).toHaveLength(5)
      player.hotbar.forEach(slot => expect(slot).toBeNull())
    })
  })

  describe('removePlayer()', () => {
    test('removes player from state', () => {
      const state = roomManager.getOrCreate('ROOM_REM', 'dark_forest')
      roomManager.addPlayer(state, 'pDel', 'Del', 'warrior', DUMMY_WS)
      roomManager.removePlayer(state, 'pDel')
      expect(state.players['pDel']).toBeUndefined()
      expect(state.inputBuffer['pDel']).toBeUndefined()
    })
  })

  describe('size()', () => {
    test('returns correct room count', () => {
      const before = roomManager.size()
      roomManager.getOrCreate('ROOM_SZ1', 'dark_forest')
      roomManager.getOrCreate('ROOM_SZ2', 'ancient_castle')
      expect(roomManager.size()).toBe(before + 2)
    })
  })

  describe('get() / delete()', () => {
    test('get returns state after creation', () => {
      roomManager.getOrCreate('ROOM_GET', 'dark_forest')
      expect(roomManager.get('ROOM_GET')).toBeDefined()
    })

    test('get returns undefined for unknown room', () => {
      expect(roomManager.get('NONEXISTENT')).toBeUndefined()
    })

    test('delete removes room', () => {
      roomManager.getOrCreate('ROOM_DEL', 'dark_forest')
      roomManager.delete('ROOM_DEL')
      expect(roomManager.get('ROOM_DEL')).toBeUndefined()
    })
  })
})
