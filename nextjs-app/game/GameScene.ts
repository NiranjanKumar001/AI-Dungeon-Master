export function createGameScene(Phaser: any) {
    return class GameScene extends Phaser.Scene {
        preload() {
            const wallGfx = this.make.graphics({ add: false })
            wallGfx.fillStyle(0x4a3728);
            wallGfx.fillRect(0, 0, 64, 64);

            wallGfx.lineStyle(2, 0x2a1710);
            wallGfx.strokeRect(1, 1, 62, 62);

            wallGfx.lineStyle(1, 0x2a1710, 0.6)

            wallGfx.lineBetween(0, 21, 64, 21)
            wallGfx.lineBetween(0, 42, 64, 42)
        }
    }
}