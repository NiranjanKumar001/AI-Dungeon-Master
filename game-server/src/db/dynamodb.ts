import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  PlayerClass,
  BiomeType,
  EnemyAIState,
  EnemyType,
  NarrationEventType,
  Item,
} from '../types'

// ── Client setup ──────────────────────────────────────────────────────────────

const raw = new DynamoDBClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
})

const db = DynamoDBDocumentClient.from(raw, {
  marshallOptions:   { removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
})

const TABLES = {
  rooms:   process.env['DYNAMODB_ROOMS_TABLE']   ?? 'Rooms',
  players: process.env['DYNAMODB_PLAYERS_TABLE'] ?? 'Players',
  log:     process.env['DYNAMODB_GAMELOG_TABLE'] ?? 'GameLog',
  enemies: process.env['DYNAMODB_ENEMIES_TABLE'] ?? 'EnemyState',
} as const

// ── Room helpers ──────────────────────────────────────────────────────────────

export interface RoomRow {
  roomId: string
  hostId: string
  theme: BiomeType
  status: 'lobby' | 'active' | 'ended'
  currentRoomId: string
  createdAt: string
  mapSeed: string
  bossDefeated: boolean
}

export async function putRoom(row: RoomRow): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLES.rooms, Item: row }))
}

export async function getRoom(roomId: string): Promise<RoomRow | null> {
  const res = await db.send(new GetCommand({
    TableName: TABLES.rooms,
    Key: { roomId },
  }))
  return (res.Item as RoomRow) ?? null
}

export async function setRoomStatus(
  roomId: string,
  status: RoomRow['status'],
): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLES.rooms,
    Key: { roomId },
    UpdateExpression: 'SET #s = :s',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status },
  }))
}

// ── Player helpers ────────────────────────────────────────────────────────────

export interface PlayerRow {
  playerId: string
  roomId: string
  name: string
  class: PlayerClass
  hp: number
  maxHp: number
  x: number
  y: number
  inventory: Item[]
  stats: { str: number; mag: number; agi: number }
  isAlive: boolean
  kills: number
  deaths: number
  damageDealt: number
  connectionId: string
}

export async function putPlayer(row: PlayerRow): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLES.players, Item: row }))
}

export async function getPlayer(
  playerId: string,
  roomId: string,
): Promise<PlayerRow | null> {
  const res = await db.send(new GetCommand({
    TableName: TABLES.players,
    Key: { playerId, roomId },
  }))
  return (res.Item as PlayerRow) ?? null
}

export async function getPlayersInRoom(roomId: string): Promise<PlayerRow[]> {
  const res = await db.send(new QueryCommand({
    TableName:                 TABLES.players,
    IndexName:                 'roomId-index',
    KeyConditionExpression:    'roomId = :r',
    ExpressionAttributeValues: { ':r': roomId },
  }))
  return (res.Items ?? []) as PlayerRow[]
}

export async function updatePlayerPosition(
  playerId: string,
  roomId: string,
  x: number,
  y: number,
): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLES.players,
    Key: { playerId, roomId },
    UpdateExpression: 'SET x = :x, y = :y',
    ExpressionAttributeValues: { ':x': x, ':y': y },
  }))
}

export async function updatePlayerHp(
  playerId: string,
  roomId: string,
  hp: number,
  isAlive: boolean,
): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLES.players,
    Key: { playerId, roomId },
    UpdateExpression: 'SET hp = :hp, isAlive = :a',
    ExpressionAttributeValues: { ':hp': hp, ':a': isAlive },
  }))
}

export async function incrementPlayerStat(
  playerId: string,
  roomId: string,
  field: 'kills' | 'deaths' | 'damageDealt',
  amount: number,
): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLES.players,
    Key: { playerId, roomId },
    UpdateExpression: 'ADD #f :n',
    ExpressionAttributeNames:  { '#f': field },
    ExpressionAttributeValues: { ':n': amount },
  }))
}

export async function deletePlayer(
  playerId: string,
  roomId: string,
): Promise<void> {
  await db.send(new DeleteCommand({
    TableName: TABLES.players,
    Key: { playerId, roomId },
  }))
}

// ── Game log helpers ──────────────────────────────────────────────────────────

export interface GameLogRow {
  roomId: string
  timestamp: string
  type: 'narration' | 'event' | 'death' | 'combat'
  content: string
  eventType?: NarrationEventType
  involvedPlayers: string[]
  hpSnapshot: Record<string, number>
}

export async function appendLog(row: GameLogRow): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLES.log, Item: row }))
}

// ── Enemy state helpers ───────────────────────────────────────────────────────

export interface EnemyRow {
  roomId: string
  enemyId: string
  type: EnemyType
  hp: number
  x: number
  y: number
  state: EnemyAIState
  isAlive: boolean
}

export async function putEnemy(row: EnemyRow): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLES.enemies, Item: row }))
}

export async function updateEnemyState(
  roomId: string,
  enemyId: string,
  hp: number,
  x: number,
  y: number,
  state: EnemyAIState,
  isAlive: boolean,
): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLES.enemies,
    Key: { roomId, enemyId },
    UpdateExpression: 'SET hp = :hp, x = :x, y = :y, #s = :s, isAlive = :a',
    ExpressionAttributeNames:  { '#s': 'state' },
    ExpressionAttributeValues: { ':hp': hp, ':x': x, ':y': y, ':s': state, ':a': isAlive },
  }))
}

export async function getEnemiesInRoom(roomId: string): Promise<EnemyRow[]> {
  const res = await db.send(new QueryCommand({
    TableName:                 TABLES.enemies,
    KeyConditionExpression:    'roomId = :r',
    ExpressionAttributeValues: { ':r': roomId },
  }))
  return (res.Items ?? []) as EnemyRow[]
}
