export function createGameScene(Phaser: any) {
    return class GameScene extends Phaser.Scene {
        private player!: Phaser.Physics.Arcade.Sprite
        private walls!: Phaser.Physics.Arcade.StaticGroup
        private keys!: Record<string, Phaser.Input.Keyboard.Key>
        private nameLabel!: Phaser.GameObjects.Text
        private hpText!: Phaser.GameObjects.Text
        private mapData!: number[][]
        private hp!: number
        private maxHp!: number

        constructor() {
            super({ key: "GameScene" });
        }

        preload() {
            const wallGfx = this.make.graphics({ add: false })
            wallGfx.fillStyle(0x4a3728)
            wallGfx.fillRect(0, 0, 64, 64)

            wallGfx.lineStyle(2, 0x2a1710)
            wallGfx.strokeRect(1, 1, 62, 62)

            wallGfx.lineStyle(1, 0x2a1710, 0.6)
            wallGfx.lineBetween(0, 21, 64, 21)
            wallGfx.lineBetween(0, 42, 64, 42)
            wallGfx.lineBetween(32, 0, 32, 21)
            wallGfx.lineBetween(16, 21, 16, 42)
            wallGfx.lineBetween(48, 21, 48, 42)
            wallGfx.lineBetween(32, 42, 32, 64)

            wallGfx.generateTexture('wall', 64, 64)
            wallGfx.destroy()

            const floorGfx = this.make.graphics({ add: false })
            floorGfx.fillStyle(0x1e1a12)
            floorGfx.fillRect(0, 0, 64, 64)
            floorGfx.lineStyle(1, 0x2a2416, 0.35)
            floorGfx.strokeRect(0, 0, 64, 64)
            floorGfx.generateTexture('floor', 64, 64)
            floorGfx.destroy()

            const playerColors: Record<string, number> = {
                warrior: 0xe74c3c,
                mage: 0x3498db,
                rogue: 0x2ecc71,
            }

            const playerClass = localStorage.getItem("playerClass") || "warrior"
            const bodyColor = playerColors[playerClass] || 0x9b59b6;

            const playerGfx = this.make.graphics({ add: false })
            playerGfx.fillStyle(bodyColor)
            playerGfx.fillRect(4, 8, 40, 36)
            playerGfx.fillStyle(0xffd9a0)
            playerGfx.fillRect(14, 2, 20, 16)
            playerGfx.fillStyle(0x222222)
            playerGfx.fillRect(18, 6, 4, 4)
            playerGfx.fillRect(26, 6, 4, 4)
            playerGfx.generateTexture('player', 48, 48)
            playerGfx.destroy()
        }

        create() {
            const TILE = 64;

            this.mapData = [
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

            // Draw floor tiles first (bottom visual layer — no physics)
            for (let row = 0; row < this.mapData.length; row++) {
                for (let col = 0; col < this.mapData[row].length; col++) {
                    const x = col * TILE + TILE / 2
                    const y = row * TILE + TILE / 2
                    this.add.image(x, y, 'floor')
                }
            }

            this.walls = this.physics.add.staticGroup()

            for (let row = 0; row < this.mapData.length; row++) {
                for (let col = 0; col < this.mapData[row].length; col++) {
                    if (this.mapData[row][col] === 1) {
                        const x = col * TILE + TILE / 2
                        const y = row * TILE + TILE / 2
                        this.walls.create(x, y, 'wall')
                    }
                }
            }

            this.player = this.physics.add.sprite(TILE * 5, TILE * 5, "player");
            this.player.setCollideWorldBounds(true);
            this.physics.add.collider(this.player, this.walls);

            const mapW = this.mapData[0].length * TILE;
            const mapH = this.mapData.length * TILE;
            this.physics.world.setBounds(0, 0, mapW, mapH);

            this.cameras.main.setBounds(0, 0, mapW, mapH);
            this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

            this.keys = {
                W: this.input.keyboard!.addKey('W'),
                A: this.input.keyboard!.addKey('A'),
                S: this.input.keyboard!.addKey('S'),
                D: this.input.keyboard!.addKey('D'),
                SHIFT: this.input.keyboard!.addKey('SHIFT'),
            }

            const playerName = localStorage.getItem('playerName') || 'Hero';
            const playerClass = localStorage.getItem('playerClass') || 'warrior';
            const mapHpMap: Record<string, number> = { warrior: 100, mage: 70, rogue: 85 };
            this.hp = mapHpMap[playerClass] || 100;
            this.maxHp = this.hp;

            this.nameLabel = this.add.text(0, 0, playerName, {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5, 1).setDepth(10)

            this.hpText = this.add.text(
                16, 16,
                `${playerName}  (${playerClass})     ❤️  ${this.hp} / ${this.maxHp}`,
                {
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2,
                }
            ).setScrollFactor(0).setDepth(20)

            this.add.text(16, 44, 'WASD: Move   |   Shift: Sprint', {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#666666',
            }).setScrollFactor(0).setDepth(20)
        }

        update() {
            const isSprinting = this.keys.SHIFT.isDown;
            const speed = isSprinting ? 260 : 160;

            this.player.setVelocity(0);

            const goLeft = this.keys.A.isDown;
            const goRight = this.keys.D.isDown;
            const goUp = this.keys.W.isDown;
            const goDown = this.keys.S.isDown;

            if (goLeft) this.player.setVelocityX(-speed)
            if (goRight) this.player.setVelocityX(+speed)
            if (goUp) this.player.setVelocityY(-speed)
            if (goDown) this.player.setVelocityY(+speed)

            if ((goLeft || goRight) && (goUp || goDown)) {
                this.player.body!.velocity.normalize().scale(speed)
            }

            this.nameLabel.setPosition(
                this.player.x,
                this.player.y - 28
            )
        }
    }
}