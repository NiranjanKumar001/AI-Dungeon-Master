export type PlayerClass = "warrior" | "mage" | "rogue";

export interface Player {
    id: string,
    name: string,
    playerClass: PlayerClass
    x: number,
    y: number,
    hp: number,
    maxHp: number
    keys?: string[]
}

// Client → Server messages
export type ClientMessage = JoinRoomMessage | InputMessage;

export interface JoinRoomMessage {
    type: "JOIN_ROOM",
    roomId: string,
    name: string,
    playerClass: PlayerClass
}

export interface InputMessage {
  type: 'INPUT'
  keys: string[]
}

// Server → Client messages
export type ServerMessage = WelcomeMessage | PlayerJoinedMessage | RoomStateMessage | StateMessage | PlayerLeftMessage;

export interface WelcomeMessage {
    type: "WELCOME",
    playerId: string
}

export interface PlayerJoinedMessage {
    type: "PLAYER_JOINED",
    player: Player
}

export interface RoomStateMessage {
    type: "ROOM_STATE",
    players: Player[]
}

export interface StateMessage {
    type: 'STATE'
    players: Player[]
}

export interface PlayerLeftMessage {
    type: "PLAYER_LEFT",
    id: string
}