"use client";

import { useEffect, useRef } from "react";

export default function GameCanvas() {
    const mountedRef = useRef<boolean>(false);
    const gameRef = useRef<any>(null);

    useEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;

        async function startGame() {
            const Phaser = (await import("phaser")).default;
            const { createGameScene } = await import('@/game/GameScene');

            const GameScene = createGameScene(Phaser)

            const config = {
                type: Phaser.AUTO,
                width: 960,
                height: 640,
                parent: 'game-container',
                backgroundColor: '#0d0d0d',
                physics: {
                    default: 'arcade',
                    arcade: {
                        gravity: { x: 0, y: 0 },
                        debug: false,
                    }
                },
                scene: [GameScene]
            }

            gameRef.current = new Phaser.Game(config);
        }

        startGame();

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
                mountedRef.current = false;
            }
        }
    }, [])

    return (
        <div
            id="game-container"
            style={{
                width: '960px',
                height: '640px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #333',
            }}
        />
    )
}