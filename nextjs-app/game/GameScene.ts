import type { ClientMessage, PlayerClass, PlayerPublic, ServerMessage } from '../../game-server/src/types';

export function createGameScene(Phaser: any) {
    return class GameScene extends Phaser.Scene {
        myId: string | null = null
        playerName: string = ''
        playerClass: PlayerClass = 'warrior'
        roomId: string = 'DEFAULT'
        myHp: number = 0
        myMaxHp: number = 0
        mySprite!: Phaser.Physics.Arcade.Sprite
        myLabel!: Phaser.GameObjects.Text
        hpText!: Phaser.GameObjects.Text
        statusText!: Phaser.GameObjects.Text
        walls!: Phaser.Physics.Arcade.StaticGroup
        remotePlayers: Record<string, any> = {}
        keys!: Record<string, Phaser.Input.Keyboard.Key>
        mapData!: number[][]
        ws!: WebSocket
        _lastKeyStr: string = ''

        constructor() {
            super({ key: "GameScene" });
        }

        preload() {
            this._makeWallTexture();
            this._makeFloorTexture();
            this._makePlayerTexture('warrior', 0xe74c3c)
            this._makePlayerTexture('mage', 0x3498db)
            this._makePlayerTexture('rogue', 0x2ecc71)
        }

        create() {
            const TILE = 64;

            this.myId = null;  // Assigned by the server
            this.playerName = localStorage.getItem("playerName") || "Hero"
            this.playerClass = localStorage.getItem("playerClass") as PlayerClass || "warrior"
            this.roomId = localStorage.getItem("roomId") || "DEFAULT"

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

            // Adding current player
            this.mySprite = this.physics.add.sprite(TILE * 5, TILE * 5, this.playerClass);
            this.mySprite.setCollideWorldBounds(true);
            this.physics.add.collider(this.mySprite, this.walls);
            this.mySprite.setAlpha(0);

            // adding label name
            this.myLabel = this._makeLabel(this.playerName);

            // other remote players
            this.remotePlayers = {}

            // world bounds
            const mapW = this.mapData[0].length * TILE
            const mapH = this.mapData.length * TILE
            this.physics.world.setBounds(0, 0, mapW, mapH);

            // camera
            this.cameras.main.setBounds(0, 0, mapW, mapH);
            this.cameras.main.startFollow(this.mySprite, true, 0.08, 0.08);

            // keyboard keys
            this.keys = {
                "W": this.input.keyboard!.addKey("W"),
                "A": this.input.keyboard!.addKey("A"),
                "S": this.input.keyboard!.addKey("S"),
                "D": this.input.keyboard!.addKey("D"),
                "SHIFT": this.input.keyboard!.addKey("SHIFT")
            }

            // HUD - HP bar (top-left corner)
            const maxHp = {
                warrior: 100,
                mage: 70,
                rogue: 85
            }[this.playerClass] || 100;
            this.myHp = maxHp
            this.myMaxHp = maxHp

            this.hpText = this.add.text(16, 16,
                `${this.playerName} (${this.playerClass}) ❤️ ${this.myHp}/${this.myMaxHp}`,
                {
                    fontSize: '13px', fontFamily: 'monospace', color: '#fff',
                    stroke: '#000', strokeThickness: 2
                }
            ).setScrollFactor(0).setDepth(30);

            this.statusText = this.add.text(16, 38,
                'Connecting to server...',
                { fontSize: '11px', fontFamily: 'monospace', color: '#f59e0b' }
            ).setScrollFactor(0).setDepth(30);

            this._connectWebSocket()
        }

        update() {
            if (!this.myId) return;

            // Read held keys
            const heldKeys = [];
            if (this.keys.W.isDown) heldKeys.push("W");
            if (this.keys.A.isDown) heldKeys.push("A");
            if (this.keys.S.isDown) heldKeys.push("S");
            if (this.keys.D.isDown) heldKeys.push("D");

            // sending input to server
            // We only send when the key state has changed (not every single frame)
            // This reduces unnecessary network traffic
            const keyStr = heldKeys.sort().join(",");
            if (keyStr !== this._lastKeyStr) {
                this._lastKeyStr = keyStr;
                this._wsSend({ type: 'INPUT', keys: heldKeys });
            }

            // Keep name label above our sprite
            if (this.mySprite && this.myLabel) {
                this.myLabel.setPosition(
                    this.mySprite.x,
                    this.mySprite.y - 30
                )
            }

            // Update remote player labels
            for (const rp of Object.values(this.remotePlayers)) {
                if (rp.label && rp.sprite) {
                    rp.label.setPosition(rp.sprite.x, rp.sprite.y - 30);
                }
            }
        }

        _connectWebSocket() {
            const wsURL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

            try {
                this.ws = new WebSocket(wsURL);
            } catch (error) {
                this.statusText.setText('Connection failed — is the server running?')
                return
            }

            this.ws.onopen = () => {
                console.log('✅ Connected to game server')
                this.statusText.setText('Connected ✓')
                    .setColor('#22c55e')
                this._wsSend({ type: "JOIN_ROOM", roomId: this.roomId, name: this.playerName, class: this.playerClass });
            }

            this.ws.onmessage = (event) => {
                let msg;
                try { msg = JSON.parse(event.data) }
                catch { return }
                this._handleMessage(msg);
            }

            this.ws.onclose = () => {
                console.log('WebSocket closed')
                this.statusText.setText('Disconnected').setColor('#ef4444')
            }

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err)
                this.statusText.setText('Connection error').setColor('#ef4444')
            }
        }

        _handleMessage(msg: ServerMessage) {
            switch (msg.type) {
                case "WELCOME": {
                    this.myId = msg.playerId;
                    this.mySprite.setAlpha(1);
                    console.log('My player ID:', this.myId)
                    break
                }

                case "ROOM_STATE": {
                    for (const player of msg.players) {
                        this._addRemotePlayer(player);
                    }
                    break;
                }

                case "PLAYER_JOINED": {
                    this._addRemotePlayer(msg.player);
                    this.statusText.setText(
                        `${msg.player.name} joined the dungeon`
                    ).setColor('#a78bfa')
                    this.time.delayedCall(3000, () => {
                        if (this.statusText) this.statusText.setText("").setColor("#fff");
                    })
                    break
                }

                case "STATE": {
                    for (const playerData of msg.players) {
                        if (playerData.id === this.myId) {
                            this.mySprite.x = playerData.x;
                            this.mySprite.y = playerData.y;
                            this.myHp = playerData.hp;

                            this.hpText.setText(
                                `${this.playerName}  (${this.playerClass})  ❤️ ${this.myHp}/${this.myMaxHp}`
                            )
                        } else {
                            if(!this.remotePlayers[playerData.id]) {
                                this._addRemotePlayer(playerData);
                            }else{
                                const rp = this.remotePlayers[playerData.id];
                                rp.sprite.x = playerData.x;
                                rp.sprite.y = playerData.y;
                                rp.hp = playerData.hp;
                            }
                        }
                    }
                    break;
                }

                case "PLAYER_LEFT": {
                    this._removeRemotePlayer(msg.id);
                    break;
                }
            }
        }

        _addRemotePlayer(playerData: PlayerPublic) {
            if (playerData.id === this.myId) return;

            if (this.remotePlayers[playerData.id]) return;  // duplicates handle

            const textureKey = playerData.class || "warrior";
            const sprite = this.add.sprite(
                playerData.x,
                playerData.y,
                textureKey
            ).setDepth(5);

            const label = this._makeLabel(playerData.name);
            this.remotePlayers[playerData.id] = {
                sprite,
                label,
                hp: playerData.hp,
                maxHp: playerData.maxHp,
                name: playerData.name,
                class: playerData.class,
            }

            console.log(`Remote player added: ${playerData.name} (${playerData.class})`)
        }

        _removeRemotePlayer(playerId: string) {
            const rp = this.remotePlayers[playerId];
            if(!rp) return;

            rp.sprite.destroy();
            rp.label.destroy();
            delete this.remotePlayers[playerId];

            console.log(`Remote player removed: ${playerId}`)
        }

        // utilities
        _wsSend(data: ClientMessage) {
            if(this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        }

        _makeLabel(name: string) {
            return this.add.text(0, 0, name, {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5, 1).setDepth(10)
        }

        // Texture Helpers
        _makeWallTexture() {
            const g = this.make.graphics({ add: false })
            g.fillStyle(0x4a3728)
            g.fillRect(0, 0, 64, 64)

            g.lineStyle(2, 0x2a1710)
            g.strokeRect(1, 1, 62, 62)

            g.lineStyle(1, 0x2a1710, 0.6)
            g.lineBetween(0, 21, 64, 21)
            g.lineBetween(0, 42, 64, 42)
            g.lineBetween(32, 0, 32, 21)
            g.lineBetween(16, 21, 16, 42)
            g.lineBetween(48, 21, 48, 42)
            g.lineBetween(32, 42, 32, 64)

            g.generateTexture('wall', 64, 64)
            g.destroy()
        }

        _makeFloorTexture() {
            const g = this.make.graphics({ add: false })
            g.fillStyle(0x1e1a12)
            g.fillRect(0, 0, 64, 64)
            g.lineStyle(1, 0x2a2416, 0.35)
            g.strokeRect(0, 0, 64, 64)
            g.generateTexture('floor', 64, 64)
            g.destroy()
        }

        _makePlayerTexture(key: string, color: number) {
            // Only create if not already made
            if (this.textures.exists(key)) return

            const g = this.make.graphics({ add: false })
            g.fillStyle(color)
            g.fillRect(4, 8, 40, 36)
            g.fillStyle(0xffd9a0)
            g.fillRect(14, 2, 20, 16)
            g.fillStyle(0x222222)
            g.fillRect(18, 6, 4, 4)
            g.fillRect(26, 6, 4, 4)
            g.generateTexture(key, 48, 48)
            g.destroy()
        }
    }
}