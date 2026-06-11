import http from "http"
import { WebSocketServer, WebSocket } from "ws"
import { saveRoom, savePlayer, deletePlayer, deleteRoom } from "./db"
import { ClientMessage, Player, ServerMessage, WelcomeMessage } from "../../shared/src/types";
import { sendMessage } from "./utility/utility";
import { handleClose, handleMessage } from "./services/handleSocket";

// creating a server
const server = http.createServer();

// create the websocket server on top of the http server
const wss = new WebSocketServer({ server })

wss.on("connection", (socket: any) => {
    socket.id = Math.random().toString(36).slice(2, 10)
    console.log("socket connected:", socket.id)

    // sending the welcome message to the user
    sendMessage(socket, { type: "WELCOME", playerId: socket.id });

    // listen for messages sent by this player
    socket.on("message", (raw: any) => {
        const msg: ClientMessage = JSON.parse(raw)
        handleMessage(socket, msg);
    })

    // ── player disconnected ───────────────────────────────────────────────────
    socket.on("close", () => {
        handleClose(socket);
    })
})

// start the server on port 4000
const PORT = 4000
server.listen(PORT, () => console.log(`Game server running on port ${PORT}`))
