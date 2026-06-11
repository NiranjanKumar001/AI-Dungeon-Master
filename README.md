# AI Dungeon Master

Real-time 2D multiplayer action game where Claude AI watches gameplay and narrates dramatic moments.

2-6 players fight through a dungeon. The game engine handles all physics and combat. Claude watches what actually happens and narrates key moments as floating text on screen.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 + React 19 + Phaser.js |
| Styling | Tailwind CSS 4 |
| Game server | Node.js + WebSocket (`ws`) |
| AI narrator | Claude API (claude-sonnet-4-6) |
| Narration queue | AWS SQS + Lambda |
| Storage | DynamoDB + Redis (ElastiCache) |

## Structure

```
AI-Dungeon-Master/
├── nextjs-app/      # Next.js frontend + Phaser.js game canvas
└── game-server/     # Node.js authoritative game server (TypeScript)
```

## How it works

**Game loop** — server runs at 20 ticks/second. Each tick: process player inputs, step enemy AI, resolve hitboxes, detect events, broadcast state to all clients.

**Client** — Phaser.js handles rendering and input only. All game logic is server-authoritative. Clients do local prediction and reconcile with server state.

**Narration** — an event detector watches each tick for significant moments (player kill, death, room entered, boss appeared, betrayal). On event: push to SQS → Lambda calls Claude API → narration broadcast to all clients via WebSocket.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| `Left click` | Attack |
| `Hold left click` | Charged attack (2.5x damage) |
| `Right click` | Block / parry |
| `Space` | Jump / dodge |
| `Shift` | Sprint |
| `Ctrl` | Sneak |
| `Q` / `E` | Class abilities |
| `R` | Ranged attack |
| `F` | Execute (enemy < 15% HP) |
| `X` | Betray nearby teammate |
| `H` | Revive downed teammate |
| `Tab` | Inventory |
| `1-5` | Hotbar |

## Classes

**Warrior** — Shield bash (stun 1.5s), War cry (+20% party damage), Shield wall (90% DR)

**Mage** — Fireball (AoE), Freeze (80% slow 3s), Magic shield (absorb one hit), Detect magic

**Rogue** — Backstab (3x damage from behind), Smoke bomb, Picklock, Pickpocket

## Getting started

### Prerequisites

- Node.js 18+
- Anthropic API key
- AWS account (DynamoDB, SQS, ElastiCache)

### Install

```bash
# Frontend
cd nextjs-app
npm install
cp .env.example .env.local   # fill in values

# Game server
cd ../game-server
npm install
cp .env.example .env         # fill in values
```

### Run locally

```bash
# Terminal 1 — game server
cd game-server
npm run dev

# Terminal 2 — frontend
cd nextjs-app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

**nextjs-app/.env.local**
```
VITE_SERVER_WS_URL=ws://localhost:4000
VITE_SERVER_HTTP_URL=http://localhost:4000
```

**game-server/.env**
```
ANTHROPIC_API_KEY=sk-ant-...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DYNAMODB_ROOMS_TABLE=Rooms
DYNAMODB_PLAYERS_TABLE=Players
DYNAMODB_GAMELOG_TABLE=GameLog
SQS_NARRATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/NarrationQueue
REDIS_URL=redis://your-elasticache-endpoint:6379
SERVER_PORT=4000
TICK_RATE=20
```

## WebSocket protocol

**Client → Server**
```js
{ type: "INPUT",    keys: ["W","D"], mouseX: 400, mouseY: 220, seq: 1547 }
{ type: "ATTACK",   direction: 135, seq: 1548 }
{ type: "ABILITY",  slot: "Q", targetX: 380, targetY: 190, seq: 1549 }
{ type: "INTERACT", objectId: "chest_2", seq: 1550 }
{ type: "USE_ITEM", hotbarSlot: 1, seq: 1551 }
{ type: "BETRAY",   targetPlayerId: "p_raj", seq: 1552 }
```

**Server → Client**
```js
// authoritative state — every 50ms
{ type: "STATE", tick: 8734, players: [...], enemies: [...], projectiles: [...], effects: [...] }

// Claude narration — on key events
{ type: "NARRATION", text: "...", duration: 6000 }

// Room transition
{ type: "LOAD_ROOM", roomId: "throne_room", mapData: {...} }
```

## Narration events

Claude is called only on significant events, with per-event cooldowns:

| Event | Cooldown |
|---|---|
| Enemy killed | 3s |
| Player took heavy hit (25%+ HP) | 5s |
| Player died | immediate |
| New room entered | immediate |
| Boss appeared | immediate |
| Player betrayed ally | immediate |
| All enemies cleared | 2s |
| Player idle 60s | 30s |

## Deploy

**Game server** — EC2 t3.small (needs persistent uptime for the game loop, Lambda won't work)

```bash
npm install -g pm2
pm2 start dist/index.js --name game-server
pm2 startup && pm2 save
```

**Frontend** — Vercel

```bash
cd nextjs-app && vercel --prod
```
