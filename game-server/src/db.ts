import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb"
import dotenv from "dotenv"

dotenv.config()

// create the dynamodb client using credentials from .env
const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
})

// DocumentClient makes it easier — no need to write { S: "value" }, just plain objects
const db = DynamoDBDocumentClient.from(client)

// table names — must match exactly what is in AWS DynamoDB console
const ROOMS_TABLE = "Rooms"
const PLAYERS_TABLE = "Players"

// save a room when it is created
export async function saveRoom(roomId: string) {
  try {
    await db.send(new PutCommand({
      TableName: ROOMS_TABLE,
      Item: { roomId, createdAt: new Date().toISOString() },
    }))
  } catch (e) {
    console.error("saveRoom failed:", e)
  }
}

// save a player when they join a room
export async function savePlayer(playerId: string, roomId: string, name: string, playerClass: string, hp: number) {
  try {
    await db.send(new PutCommand({
      TableName: PLAYERS_TABLE,
      Item: { playerId, roomId, name, class: playerClass, hp, joinedAt: new Date().toISOString() },
    }))
  } catch (e) {
    console.error("savePlayer failed:", e)
  }
}

// remove a player when they disconnect
// Players table has partition key (playerId) + sort key (roomId) — both required for delete
export async function deletePlayer(playerId: string, roomId: string) {
  try {
    await db.send(new DeleteCommand({
      TableName: PLAYERS_TABLE,
      Key: { playerId, roomId },
    }))
  } catch (e) {
    console.error("deletePlayer failed:", e)
  }
}

// remove a room when it becomes empty
export async function deleteRoom(roomId: string) {
  try {
    await db.send(new DeleteCommand({
      TableName: ROOMS_TABLE,
      Key: { roomId },
    }))
  } catch (e) {
    console.error("deleteRoom failed:", e)
  }
}