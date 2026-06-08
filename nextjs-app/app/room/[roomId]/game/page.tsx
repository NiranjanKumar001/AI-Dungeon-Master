'use client'

import dynamic from "next/dynamic"

const GameCanvas = dynamic(
    () => import("@/components/GameCanvas"),
    {
        loading: () => (
            <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
                <div className="text-center space-y-4">
                    <div className="text-5xl">🐉</div>
                    <p className="text-gray-400 text-lg">Loading dungeon...</p>
                    <p className="text-gray-600 text-sm">Preparing the dark places</p>
                </div>
            </div>
        )
    }
)

export default function GamePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-4">
            <GameCanvas />
        </div>
    )
}