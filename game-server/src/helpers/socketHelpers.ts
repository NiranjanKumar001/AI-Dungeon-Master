// player radius is to check the wall, away from center, because player is located at center.
const TILE: number = 64
const PLAYER_RADIUS: number = 20

const MAP_DATA: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

export function isWalkable(x: number, y: number): boolean {
    const corners = [
        { x: x - PLAYER_RADIUS, y: y - PLAYER_RADIUS },  // top-left
        { x: x + PLAYER_RADIUS, y: y - PLAYER_RADIUS },  // top-right
        { x: x - PLAYER_RADIUS, y: y + PLAYER_RADIUS },   //bottom-left
        { x: x + PLAYER_RADIUS, y: y + PLAYER_RADIUS }  //bottom-right
    ]

    for (const corner of corners) {
        const col = Math.floor(corner.x / TILE);
        const row = Math.floor(corner.y / TILE);

        if (row < 0 || row >= MAP_DATA.length) return false;
        if (col < 0 || col >= MAP_DATA[0].length) return false;
        if (MAP_DATA[row][col] == 1) return false;
    }

    return true;
}

export function applyMovement(player: { x: number, y: number }, dx: number, dy: number) {
    const newX = player.x + dx
    const newY = player.y + dy

    if (isWalkable(newX, newY)) {
        player.x = newX
        player.y = newY
    } else if (isWalkable(newX, player.y)) {
        player.x = newX
    } else if (isWalkable(player.x, newY)) {
        player.y = newY
    }
}