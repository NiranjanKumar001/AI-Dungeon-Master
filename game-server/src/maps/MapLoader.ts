import fs from 'fs'
import path from 'path'
import type { RoomDefinition, BiomeDef, BiomeType } from '../types'

const BIOMES_DIR = path.join(__dirname, 'biomes')

export function loadBiome(biomeId: BiomeType): BiomeDef {
  const filePath = path.join(BIOMES_DIR, biomeId, 'biome.json')
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BiomeDef
}

export function loadZone(biomeId: BiomeType, zoneId: string): RoomDefinition {
  const filePath = path.join(BIOMES_DIR, biomeId, `${zoneId}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RoomDefinition
}
