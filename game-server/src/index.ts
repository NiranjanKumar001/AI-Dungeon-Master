import http from "http"
import { WebSocketServer, WebSocket } from "ws"
import { saveRoom, savePlayer, deletePlayer, deleteRoom } from "./db"

// create a basic http server (needed to attach websocket server to it)
const server = http.createServer()

// create the websocket server on top of the http server
const wss = new WebSocketServer({ server })

// this holds all the active rooms and their players in memory
// Structure: { [roomId]: { players: { [id]: { name, class, x, y, hp, maxHp, ws } } } }
const rooms: any = {}

// max hp for each character class (matches the frontend character select screen)
const CLASS_HP: any = { warrior: 100, mage: 70, rogue: 85 }

// this function sends a message to every player in a room
// we need this because unlike socket.io, raw websocket has no built-in broadcast
function broadcast(roomId: string, data: any) {
  const room = rooms[roomId]
  if (!room) return
  for (const id in room.players) {
    const player = room.players[id]
    // only send if the connection is still open
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(data))
    }
  }
}

// this runs every time a new player connects to the websocket server
wss.on("connection", (socket: any) => {

  // give this socket a unique id (like socket.id in socket.io)
  socket.id = Math.random().toString(36).slice(2, 10)
  console.log("socket connected:", socket.id)

  // tell the player their own id so the frontend knows who they are
  // server → frontend: { "type": "WELCOME", "playerId": "jkdtk5j2" }
  socket.send(JSON.stringify({ type: "WELCOME", playerId: socket.id }))

  // listen for messages sent by this player
  socket.on("message", (raw: any) => {
    const msg = JSON.parse(raw)

    // ── player wants to join a room ───────────────────────────────────────────
    // frontend → server: { "type": "JOIN_ROOM", "roomId": "ABC123", "name": "Hero", "playerClass": "warrior" }
    if (msg.type === "JOIN_ROOM") {
      const { roomId, name, playerClass } = msg

      // create the room if it doesn't exist yet
      if (!rooms[roomId]) {
        rooms[roomId] = { players: {} }
        saveRoom(roomId)  // persist room to dynamodb
      }

      // add this player to the room
      rooms[roomId].players[socket.id] = {
        id: socket.id,
        name,
        class: playerClass,
        x: 320,          // spawn position in pixels (tile 5 x 64px)
        y: 320,          // spawn position in pixels (tile 5 x 64px)
        hp: CLASS_HP[playerClass] ?? 100,
        maxHp: CLASS_HP[playerClass] ?? 100,
        ws: socket,      // store the socket so we can send messages to this player later
      }

      console.log(`${name} joined room ${roomId}`)
      savePlayer(socket.id, roomId, name, playerClass, CLASS_HP[playerClass] ?? 100)  // persist player to dynamodb

      // tell everyone already in the room that a new player arrived
      // server → everyone else: { "type": "PLAYER_JOINED", "id": "jkdtk5j2", "name": "Hero", "class": "warrior", "x": 320, "y": 320 }
      for (const id in rooms[roomId].players) {
        if (id === socket.id) continue  // skip the new player themselves
        const other = rooms[roomId].players[id]
        if (other.ws.readyState === WebSocket.OPEN) {
          other.ws.send(JSON.stringify({ type: "PLAYER_JOINED", id: socket.id, name, class: playerClass, x: 320, y: 320 }))
        }
      }

      // send the new player the list of everyone already in the room
      // server → new player: { "type": "ROOM_STATE", "players": [{ "id": "abc", "name": "Hero", "x": 320, "y": 320, ... }] }
      socket.send(JSON.stringify({
        type: "ROOM_STATE",
        players: Object.values(rooms[roomId].players).map((p: any) => ({
          id: p.id, name: p.name, class: p.class, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
        })),
      }))
    }

    // ── player moved — update position and tell everyone else ─────────────────
    // frontend → server: { "type": "PLAYER_MOVE", "roomId": "ABC123", "x": 400, "y": 300 }
    if (msg.type === "PLAYER_MOVE") {
      const { roomId, x, y } = msg

      // update their position on the server
      if (rooms[roomId]?.players[socket.id]) {
        rooms[roomId].players[socket.id].x = x
        rooms[roomId].players[socket.id].y = y
      }

      // broadcast new position to everyone else in the room
      // server → everyone else: { "type": "PLAYER_MOVED", "id": "jkdtk5j2", "x": 400, "y": 300 }
      for (const id in rooms[roomId]?.players) {
        if (id === socket.id) continue  // don't send back to the player who moved
        const other = rooms[roomId].players[id]
        if (other.ws.readyState === WebSocket.OPEN) {
          other.ws.send(JSON.stringify({ type: "PLAYER_MOVED", id: socket.id, x, y }))
        }
      }
    }
  })

  // ── player disconnected ───────────────────────────────────────────────────
  socket.on("close", () => {

    // find which room this player was in
    for (const roomId in rooms) {
      const room = rooms[roomId]

      if (room.players[socket.id]) {
        const { name } = room.players[socket.id]

        // remove them from the room
        delete room.players[socket.id]
        deletePlayer(socket.id, roomId)  // remove player from dynamodb
        console.log(`${name} left room ${roomId}`)

        // tell everyone else in the room this player left
        // server → everyone else: { "type": "PLAYER_LEFT", "id": "jkdtk5j2" }
        broadcast(roomId, { type: "PLAYER_LEFT", id: socket.id })

        // if the room is now empty, delete it to free memory
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId]
          deleteRoom(roomId)  // remove room from dynamodb
          console.log(`Room ${roomId} deleted — no players left`)
        }

        break // stop looking once we found the room
      }
    }
  })
})

// start the server on port 4000
const PORT = 4000
server.listen(PORT, () => console.log(`Game server running on port ${PORT}`))
