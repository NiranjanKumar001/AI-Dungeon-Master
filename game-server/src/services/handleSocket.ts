import { WebSocket } from "ws";
import { ClientMessage, Player } from "../../../shared/src/types";
import { deletePlayer, savePlayer, saveRoom } from "../db";
import { sendMessage } from "../utility/utility";

// interface/types
interface ServerPlayer extends Player {
    ws: WebSocket
}

interface Room {
    players: Record<string, ServerPlayer>
}

const rooms: Record<string, Room> = {}
const CLASS_HP: Record<string, number> = { warrior: 100, mage: 70, rogue: 85 };

function broadcast(roomId: string, data: any) {
    const room = rooms[roomId]
    if (!room) return

    const players = room.players;
    for(const player in players) {
        const playerSocket = players[player].ws;
        if (playerSocket.readyState === WebSocket.OPEN) {
            sendMessage(playerSocket, {type: "PLAYER_LEFT", id: data});
        }
    }
}

export function handleMessage(socket: any, msg: ClientMessage) {
    if (msg.type === "JOIN_ROOM") {
        const { roomId, name, playerClass } = msg;
        const playerInfo: Player = {
            id: socket.id,
            name: name,
            playerClass: playerClass,
            x: 320,
            y: 320,
            hp: CLASS_HP[playerClass],
            maxHp: CLASS_HP[playerClass],
        }

        // create a room
        if (!rooms[roomId]) {
            rooms[roomId] = { players: {} }
            saveRoom(roomId)  // persist room to dynamodb
        }

        rooms[roomId].players[socket.id] = { ...playerInfo, ws: socket };

        console.log(`${name} joined room ${roomId}`);
        savePlayer(socket.id, roomId, name, playerClass, CLASS_HP[playerClass] ?? 100);

        console.log("Got it");
        for (const id in rooms[roomId].players) {
            if (id == socket.id) continue;
            const other = rooms[roomId].players[id];
            if (other.ws.readyState === WebSocket.OPEN) {
                sendMessage(other.ws, { type: "PLAYER_JOINED", player: playerInfo });
            }
        }
        
        console.log("Got it 2");
        sendMessage(socket, {
            type: "ROOM_STATE", players: Object.values(rooms[roomId].players).map((p: Player) => ({
                id: p.id, name: p.name, playerClass: p.playerClass, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
            }))
        });
    } 

    if(msg.type === "INPUT") {
        for(const roomId in rooms) {
            const player = rooms[roomId].players[socket.id];
            if(player) {
                player.keys = msg.keys;
                break;
            }
        }
    }
}

export function handleClose(socket: any) {
    for(const roomId in rooms) {
        const room = rooms[roomId];

        if(room.players[socket.id]) {
            const name = room.players[socket.id].name;

            // remove them from the room
            delete room.players[socket.id];
            deletePlayer(socket.id, roomId);
            console.log(`${name} left room ${roomId}`)

            // broadcast to everyone else
            broadcast(roomId, {type: "PLAYER_LEFT", id: socket.id});
        }
    }
}