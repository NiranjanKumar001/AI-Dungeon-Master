import { loadBiome, loadZone } from '../../maps/MapLoader'
import type { BiomeType } from '../../types'

const ALL_BIOMES: BiomeType[] = [
  'dark_forest',
  'ancient_castle',
  'cursed_swamp',
  'volcanic_caverns',
  'frozen_tundra',
]

describe('MapLoader', () => {
  describe('loadBiome()', () => {
    test.each(ALL_BIOMES)('loads %s manifest without error', (biome) => {
      const def = loadBiome(biome)
      expect(def.id).toBe(biome)
      expect(def.name).toBeTruthy()
      expect(def.theme).toMatch(/^(horror|fantasy|scifi|mystery)$/)
      expect(def.startZone).toBeTruthy()
      expect(def.zones.length).toBeGreaterThan(0)
      expect(def.enemyPool.length).toBeGreaterThan(0)
      expect(def.zones).toContain(def.startZone)
    })

    test('throws on unknown biome', () => {
      expect(() => loadBiome('nonexistent' as BiomeType)).toThrow()
    })
  })

  describe('loadZone()', () => {
    test.each(ALL_BIOMES)('loads start zone of %s', (biome) => {
      const def      = loadBiome(biome)
      const zoneDef  = loadZone(biome, def.startZone)

      expect(zoneDef.id).toBe(def.startZone)
      expect(zoneDef.width).toBeGreaterThan(0)
      expect(zoneDef.height).toBeGreaterThan(0)
      expect(zoneDef.tiles.length).toBe(zoneDef.height)
      expect(zoneDef.tiles[0].length).toBe(zoneDef.width)
    })

    test('tile grid dimensions match width/height', () => {
      const zone = loadZone('ancient_castle', 'entrance_hall')
      expect(zone.tiles).toHaveLength(zone.height)
      zone.tiles.forEach(row => expect(row).toHaveLength(zone.width))
    })

    test('border tiles are all walls', () => {
      const zone = loadZone('ancient_castle', 'entrance_hall')
      const { tiles, width, height } = zone

      // top row all walls
      tiles[0].forEach(t => expect(t).toBe(1))
      // bottom row all walls
      tiles[height - 1].forEach(t => expect(t).toBe(1))
      // left column — row 0 and height-1 already checked, check interior
      for (let r = 1; r < height - 1; r++) expect(tiles[r][0]).toBe(1)
    })

    test('spawn point (320,320) is on a floor tile', () => {
      const zone = loadZone('ancient_castle', 'entrance_hall')
      const TILE  = 32
      const col   = Math.floor(320 / TILE)
      const row   = Math.floor(320 / TILE)
      expect(zone.tiles[row][col]).toBe(0)
    })

    test('throws on unknown zone', () => {
      expect(() => loadZone('dark_forest', 'nonexistent_zone')).toThrow()
    })

    test('each biome start zone has at least one enemy spawn', () => {
      ALL_BIOMES.forEach(biome => {
        const def  = loadBiome(biome)
        const zone = loadZone(biome, def.startZone)
        expect(zone.enemySpawns.length).toBeGreaterThan(0)
      })
    })

    test('enemy types in zone belong to biome enemyPool', () => {
      ALL_BIOMES.forEach(biome => {
        const def  = loadBiome(biome)
        const zone = loadZone(biome, def.startZone)
        zone.enemySpawns.forEach(spawn => {
          expect(def.enemyPool).toContain(spawn.type)
        })
      })
    })
  })
})
