# Game Server

Authoritative Node.js/TypeScript WebSocket game server for AI Dungeon Master. Runs the game loop, owns all physics and combat, broadcasts state to clients, and manages horizontal scaling via Redis.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How It Works](#how-it-works)
3. [Tech Stack](#tech-stack)
4. [File Structure](#file-structure)
5. [Components](#components)
   - [Entry Point](#entry-point)
   - [REST API](#rest-api)
   - [WebSocket Protocol](#websocket-protocol)
   - [Game Loop](#game-loop)
   - [Room Manager](#room-manager)
   - [Map System](#map-system)
   - [Database Layer](#database-layer)
   - [Scaling Layer](#scaling-layer)
6. [Message Schema](#message-schema)
7. [Database Schema](#database-schema)
8. [Scaling Architecture](#scaling-architecture)
9. [Environment Variables](#environment-variables)
10. [Local Development](#local-development)
11. [Docker Deployment](#docker-deployment)
12. [What's Not Built Yet](#whats-not-built-yet)

---

## Architecture Overview

```
                         CLIENTS
                    (Browser / Next.js)
                           │
              ┌────────────┴────────────┐
              │ REST (lobby mgmt)       │ WebSocket (live gameplay)
              ▼                         ▼
       ┌─────────────┐       ┌─────────────────────┐
       │  REST API   │       │   Game Server N      │
       │  /api/*     │       │                      │
       └──────┬──────┘       │  RoomManager         │
              │              │  GameLoop (20Hz)      │
              ▼              │  MapLoader            │
       ┌─────────────┐       └──────────┬───────────┘
       │  DynamoDB   │                  │ async writes
       │  Rooms      │◄─────────────────┘
       │  Players    │
       │  GameLog    │
       │  EnemyState │
       └─────────────┘

       ┌──────────────────────────────────────┐
       │             Redis                    │
       │  Room registry  → which server       │
       │  Server heartbeats → health + load   │
       └──────────────────────────────────────┘
```

**Key principle: the server is the single source of truth.** Clients send inputs only. Server computes all positions, combat, and physics. Clients render whatever the server says.

---

## How It Works

### Joining a Room

```
1. Client → POST /api/rooms
     Server: queries Redis for least-loaded game server
     Server: assigns room to that server (stored in Redis)
     Server: writes room row to DynamoDB
     ← { roomId, wsUrl: "ws://game-server-1:4000" }

2. Client → POST /api/players
     Server: validates room is in lobby state
     Server: writes player row to DynamoDB
     ← { playerId, spawnX: 320, spawnY: 320 }

3. Client → new WebSocket(wsUrl)
     ← { type: "WELCOME", playerId }

4. Client → { type: "JOIN_ROOM", roomId, name, class }
     Server: creates GameState for room (loads map JSON)
     Server: spawns enemies from room definition
     Server: adds player to GameState
     Server: starts 20Hz game loop
     ← { type: "LOAD_ROOM", mapData: { tiles, doors, enemies, items } }
     ← { type: "ROOM_STATE", players: [...existing players] }
```

### Every 50ms (Game Tick)

```
tick()
 │
 ├─ for each player: drain inputBuffer
 │    applyInput():
 │      check seq number (discard stale inputs)
 │      keys → dx/dy (WASD or Arrow keys)
 │      normalize diagonal movement
 │      axis-separated wall collision (player slides along walls)
 │      update animation: idle / walk
 │      update facing from mouseX/mouseY
 │
 ├─ tick down attack + ability cooldowns
 │
 └─ broadcastState()
      build StateSnapshot { tick, players[], enemies[], projectiles[], effects[] }
      JSON.stringify once
      send to every connected socket in room
```

### Client Rendering

Client receives `STATE` at 20Hz and re-draws sprites at the new positions. The tile map from `LOAD_ROOM` is drawn once and stays static. Player/enemy sprites are drawn on top every frame.

```
LOAD_ROOM.mapData.tiles[row][col]
  0 → floor sprite at (col×32, row×32)
  1 → wall sprite  at (col×32, row×32)
  2 → pit sprite
  5 → spike sprite

STATE.players[].{ x, y } → draw player sprite
STATE.enemies[].{ x, y } → draw enemy sprite
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript (CommonJS, strict) |
| WebSocket | `ws` library |
| HTTP | Node.js `http` (no Express) |
| Database | AWS DynamoDB via `@aws-sdk/lib-dynamodb` |
| Cache / Registry | Redis via `ioredis` |
| Container | Docker (multi-stage build) |
| AI Narration | Google Gemini API (free tier) — not yet wired |

---

## File Structure

```
game-server/
├── src/
│   ├── index.ts                   Entry point: HTTP + WS server, player lifecycle
│   ├── types.ts                   All shared interfaces, message types, GameState
│   │
│   ├── api/
│   │   └── router.ts              REST API handler (no Express, plain http)
│   │
│   ├── db/
│   │   ├── dynamodb.ts            DynamoDB table helpers (put/get/update per table)
│   │   ├── redis.ts               ioredis client (two instances: commands + pubsub)
│   │   └── setup.ts               One-time script: creates all 4 DynamoDB tables
│   │
│   ├── cluster/
│   │   ├── Heartbeat.ts           Announces this server to Redis every 5s
│   │   └── RoomRegistry.ts        Assign rooms to servers, lookup, release
│   │
│   ├── game/
│   │   ├── RoomManager.ts         Map<roomId, GameState>, player spawn/remove
│   │   └── GameLoop.ts            20Hz setInterval, input processing, STATE broadcast
│   │
│   └── maps/
│       ├── MapLoader.ts           Loads room JSON from disk
│       └── rooms/
│           └── entrance_hall.json 20×15 tile map, 3 enemy spawns, 2 items, 1 door
│
├── Dockerfile                     Multi-stage build (builder + runner)
├── docker-compose.yml             Redis + 2 game server instances for local testing
├── .env.example                   All required environment variables
├── tsconfig.json                  CommonJS, es2020, strict
└── package.json                   Scripts: dev, build, start, db:setup
```

---

## Components

### Entry Point

**`src/index.ts`**

Starts a single `http.createServer` that serves both REST requests and WebSocket upgrades on the same port. On startup it connects to Redis and begins the heartbeat.

Responsibilities:
- Accept WebSocket connections, assign `playerId`
- Route `JOIN_ROOM` → RoomManager + GameLoop
- Route `INPUT` → push to `state.inputBuffer[playerId]`
- On disconnect → remove player, stop loop if room empty, release room from Redis

### REST API

**`src/api/router.ts`**

Plain `http.IncomingMessage` handler, no Express. All routes under `/api/`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/rooms` | Create room, assign to least-loaded server |
| `GET` | `/api/rooms/:id` | Room info + player list (lobby polling) |
| `POST` | `/api/rooms/:id` | Start room (lobby → active) |
| `POST` | `/api/players` | Register player into a room |
| `GET` | `/api/rooms/:id/server` | Which WS server hosts this room |

### WebSocket Protocol

All messages are JSON. See [Message Schema](#message-schema) below.

**Client → Server** (inputs only, never positions):

| Type | When | Key Fields |
|---|---|---|
| `JOIN_ROOM` | After character select | `roomId, name, class` |
| `INPUT` | Every frame (keys held) | `keys[], mouseX, mouseY, seq` |
| `ATTACK` | Left click | `direction, seq` |
| `ABILITY` | Q or E key | `slot, targetX, targetY, seq` |
| `INTERACT` | Near object | `objectId, seq` |
| `USE_ITEM` | Hotbar key | `hotbarSlot, seq` |
| `DROP_ITEM` | G key | `itemId, seq` |
| `BETRAY` | Near ally | `targetPlayerId, seq` |

**Server → Client**:

| Type | When |
|---|---|
| `WELCOME` | On connect |
| `LOAD_ROOM` | On join — full map data |
| `ROOM_STATE` | On join — existing players |
| `STATE` | Every 50ms — positions of everything |
| `PLAYER_JOINED` | New player enters |
| `PLAYER_LEFT` | Player disconnects |
| `PLAYER_DIED` | HP reaches 0 |
| `NARRATION` | AI-generated story text |
| `INVENTORY_UPDATE` | After item pickup/use/drop |
| `GAME_OVER` | Victory or all dead |

### Game Loop

**`src/game/GameLoop.ts`**

One `setInterval(50ms)` per active room. Runs entirely in-memory — no async operations inside the tick.

```
tick()
  for each player
    drain inputBuffer → applyInput()
      seq check (discard stale)
      WASD → dx/dy at class speed (warrior 3px, mage 2.5px, rogue 4px)
      diagonal normalization: multiply by 1/√2
      isWall(newX, y) → block or allow X axis
      isWall(x, newY) → block or allow Y axis
      facing = atan2(mouseY - y, mouseX - x)
  tick down cooldowns
  broadcastState() → JSON once, send to all sockets
```

**Wall collision is axis-separated** so players slide along walls instead of stopping dead on diagonal contact.

**DynamoDB writes never happen inside the tick.** Position persistence is fire-and-forget, called outside the loop on significant events.

### Room Manager

**`src/game/RoomManager.ts`**

Holds all active `GameState` objects in a `Map<roomId, GameState>`. One `GameState` per room, lives entirely in memory.

On `getOrCreate()`:
- Loads room definition from MapLoader
- Spawns all enemies from `roomDef.enemySpawns`
- Initialises empty input buffers

On `addPlayer()`:
- Creates full `PlayerState` with class-specific `maxHp`
- Registers an empty input buffer for the player
- Spawn point: (320, 320) — centre of entrance hall

On `removePlayer()`:
- Deletes player from `GameState.players`
- Deletes input buffer entry

### Map System

**`src/maps/MapLoader.ts`** + **`src/maps/rooms/*.json`**

Maps are JSON files loaded from disk at room creation. Each map defines:

```
RoomDefinition {
  id, name, width, height
  tiles: TileValue[][]     — 2D grid, 0=floor 1=wall 2=pit 3=destructible 4=plate 5=spike
  doors: Door[]            — exits to other rooms (pixel coordinates)
  enemySpawns: []          — type, position, patrol path
  items: []                — type, position
  ambientNarration: string — seed text for Gemini
  theme: GameTheme
}
```

**`entrance_hall.json`** — 20×15 tiles (640×480px at 32px/tile):
- Walled border with floor interior
- 4 pillar obstacles at corners
- 2 patrolling goblins (square patrol paths)
- 1 stationary goblin captain
- 1 health potion + 1 iron sword
- 1 door → throne_room (right wall, row 7)

### Database Layer

**`src/db/dynamodb.ts`** — wrapper over `@aws-sdk/lib-dynamodb`

All writes inside the game loop are fire-and-forget (`void asyncFn()`). Never `await` inside a tick.

**`src/db/redis.ts`** — two ioredis instances

Two separate connections are required because a Redis connection in subscribe mode cannot issue regular commands.

```typescript
redis    // for SET, GET, pipeline, KEYS — regular commands
redisSub // reserved for SUBSCRIBE — dedicated subscribe connection
```

### Scaling Layer

**`src/cluster/Heartbeat.ts`**

Every 5 seconds, writes three Redis keys with TTL 15s:

```
server:{SERVER_ID}:url   = "ws://game-server-1:4000"
server:{SERVER_ID}:rooms = 47
server:{SERVER_ID}:max   = 100
```

If the server process dies, keys expire after 15s and it vanishes from the registry automatically.

**`src/cluster/RoomRegistry.ts`**

```
assignRoom(roomId)
  → KEYS server:*:rooms     scan all live servers
  → pipeline GET all room + max + url values
  → pick server where rooms/max is lowest
  → SET room:{roomId}:url = serverUrl  EX 3600
  → return serverUrl

getRoomServer(roomId)
  → GET room:{roomId}:url
  → return url (or null if expired/unknown)

releaseRoom(roomId)
  → DEL room:{roomId}:url
  → called when last player leaves
```

---

## Message Schema

### Client → Server

```typescript
// Every frame — keys currently held
{ type: "INPUT", keys: ["w","d"], mouseX: 412, mouseY: 300, seq: 147 }

// Basic attack
{ type: "ATTACK", direction: 45, seq: 148 }

// Ability (Q slot)
{ type: "ABILITY", slot: "Q", targetX: 500, targetY: 200, seq: 149 }

// Interact with door/chest
{ type: "INTERACT", objectId: "door_throne", seq: 150 }

// Use hotbar item
{ type: "USE_ITEM", hotbarSlot: 0, seq: 151 }
```

`seq` — monotonically increasing per client. Server discards any message where `seq <= lastInputSeq`. Prevents stale inputs from lagged packets from overriding newer ones.

### Server → Client

```typescript
// Sent once on WebSocket connect
{ type: "WELCOME", playerId: "uuid" }

// Sent on JOIN_ROOM — full map for rendering
{
  type: "LOAD_ROOM",
  roomId: "entrance_hall",
  mapData: {
    tiles: [[1,1,...],[1,0,...]], // 2D array, draw with 32px tiles
    doors: [{ id, x, y, leadsTo, locked }],
    enemySpawns: [...],
    items: [...]
  },
  spawnPoints: { "playerId": { x: 320, y: 320 } }
}

// Broadcast every 50ms — main game state
{
  type: "STATE",
  tick: 1042,
  players: [{ id, name, class, x, y, hp, maxHp, facing, animation, statusEffects, isAlive }],
  enemies: [{ id, type, x, y, hp, maxHp, facing, aiState, isAlive }],
  projectiles: [{ id, type, x, y }],
  effects: [{ type: "damage_number", value: 25, targetId, x, y }]
}
```

---

## Database Schema

### Rooms table
PK: `roomId`

| Field | Type | Notes |
|---|---|---|
| roomId | String | 6-char e.g. "DRK4X9" |
| hostId | String | creator's playerId |
| theme | String | horror / fantasy / scifi / mystery |
| status | String | lobby → active → ended |
| currentRoomId | String | which dungeon room party is in |
| createdAt | String | ISO timestamp |
| bossDefeated | Boolean | |

### Players table
PK: `playerId`, SK: `roomId`
GSI: `roomId-index` (PK: roomId) — for querying all players in a room

| Field | Type | Notes |
|---|---|---|
| playerId | String | UUID |
| roomId | String | |
| name | String | character name |
| class | String | warrior / mage / rogue |
| hp / maxHp | Number | |
| x / y | Number | last persisted position |
| inventory | List | Item[] |
| stats | Map | str, mag, agi |
| kills / deaths / damageDealt | Number | session stats |

### GameLog table
PK: `roomId`, SK: `timestamp`

Append-only log of narration events, deaths, and combat moments. Used post-session and for Gemini context.

### EnemyState table
PK: `roomId`, SK: `enemyId`

Persisted enemy HP and state. Written on significant changes (enemy dies, room transitions). Not written every tick.

---

## Scaling Architecture

### How Rooms Get Assigned to Servers

```
POST /api/rooms
  └─► RoomRegistry.assignRoom(roomId)
        └─► scan Redis: all server:*:rooms keys
            pick server with lowest rooms/max load ratio
            SET room:{roomId}:url = that server's WS URL
            return URL to client

Client uses that URL to connect directly.
No proxying. No relay. Zero Redis traffic during gameplay.
```

### How Dead Servers Are Detected

```
Server process runs → heartbeat writes keys every 5s (TTL=15s)
Server process dies → heartbeat stops → keys expire after 15s
New room requests → KEYS server:*:rooms returns no dead servers
```

### Horizontal Scale-Out

```
New ECS task starts
  └─► process boots → heartbeat begins
      └─► server:newId:rooms = 0 appears in Redis
          └─► RoomRegistry sees it as least loaded
              └─► new rooms start routing to it
```

### Scale Numbers

| Server size | Rooms | Players |
|---|---|---|
| t3.medium | ~100 rooms | ~400 players |
| For 1M players | 2,500 instances | ECS auto-scaling group |

Redis is only touched at room join — never during the 20Hz game loop — so Redis is never a bottleneck.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SERVER_PORT` | Yes | HTTP + WS port (default 4000) |
| `SERVER_ID` | No | Unique ID for this instance (auto UUID if missing) |
| `SERVER_PUBLIC_URL` | Yes (prod) | External WS URL clients connect to |
| `MAX_ROOMS_PER_SERVER` | No | Soft cap for load balancing (default 100) |
| `AWS_REGION` | Yes | DynamoDB region |
| `AWS_ACCESS_KEY_ID` | Yes | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS credentials |
| `DYNAMODB_ROOMS_TABLE` | Yes | Table name (default Rooms) |
| `DYNAMODB_PLAYERS_TABLE` | Yes | Table name (default Players) |
| `DYNAMODB_GAMELOG_TABLE` | Yes | Table name (default GameLog) |
| `DYNAMODB_ENEMIES_TABLE` | Yes | Table name (default EnemyState) |
| `REDIS_URL` | No | Redis connection string (single-server mode if missing) |
| `GEMINI_API_KEY` | No | For AI narration (not yet wired) |

---

## Local Development

**Prerequisites:** Node.js 20, AWS credentials, Redis (optional)

```bash
# Install dependencies
cd game-server
npm install

# Copy env file and fill in values
cp .env.example .env

# Create DynamoDB tables (one-time)
npm run db:setup

# Start dev server (ts-node, hot-ish reload)
npm run dev
```

Server starts at `ws://localhost:4000` and `http://localhost:4000/api`.

**Test WebSocket in browser (about:blank tab):**
```javascript
const ws = new WebSocket('ws://localhost:4000')
ws.onopen = () => ws.send(JSON.stringify({
  type: 'JOIN_ROOM', roomId: 'TEST01', name: 'Mohit', class: 'warrior'
}))
ws.onmessage = e => console.log(JSON.parse(e.data))
// → WELCOME, LOAD_ROOM, ROOM_STATE, then STATE every 50ms

// Send movement input
ws.send(JSON.stringify({ type: 'INPUT', keys: ['w','d'], mouseX: 400, mouseY: 300, seq: 1 }))
```

**Test REST API:**
```bash
# Create room
curl -X POST http://localhost:4000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"hostId":"test","theme":"fantasy"}'

# Find which server hosts the room
curl http://localhost:4000/api/rooms/ROOMID/server

# Register player
curl -X POST http://localhost:4000/api/players \
  -H "Content-Type: application/json" \
  -d '{"roomId":"ROOMID","name":"Mohit","class":"warrior"}'
```

---

## Docker Deployment

**Local multi-server test (2 servers + Redis):**

```bash
# Copy .env to game-server/ (docker-compose reads it for AWS creds)
cp .env game-server/.env

cd game-server
docker compose up --build
```

This starts:
- `redis` on port 6379
- `game-server-1` on port 4001 (`SERVER_PUBLIC_URL=ws://localhost:4001`)
- `game-server-2` on port 4002 (`SERVER_PUBLIC_URL=ws://localhost:4002`)

Creating a room will route to whichever server has fewer rooms. Rooms on port 4001 and 4002 are independent processes with shared Redis registry.

**Production (AWS ECS):**

Each ECS task runs one container from this Dockerfile. Set these env vars per task:
- `SERVER_ID` = ECS task ID (inject via task metadata)
- `SERVER_PUBLIC_URL` = public-facing URL for this task (via NLB target or Route53)
- `REDIS_URL` = ElastiCache endpoint

Auto-scaling policy: scale out when average `rooms/MAX_ROOMS_PER_SERVER` > 0.7.

---

## What's Not Built Yet

| System | Files | What it adds |
|---|---|---|
| Enemy AI | `game/EnemyManager.ts` | Patrol → alert → chase → attack state machine |
| Combat | `game/Combat.ts` | ATTACK hitboxes, damage formula, PLAYER_DIED |
| Projectiles | `game/Projectile.ts` | Mage fireballs, rogue daggers, movement + collision |
| AI Narration | `narration/Narrator.ts` | Gemini API, event detection, floating text |
| More maps | `maps/rooms/throne_room.json` | Room transitions via doors |
| Redis pub/sub | — | Currently unused — reserved for future cross-server chat/events |
