import { WebSocket } from "ws";
import { ServerMessage } from "../../../shared/src/types";

export function sendMessage(socket: WebSocket, message: ServerMessage) {
    socket.send(JSON.stringify(message));
}