"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const CLASSES = [
    {
        id: 'warrior',
        name: 'Warrior',
        emoji: '⚔️',
        hp: 100,
        desc: 'Tough fighter. Shield bash. High HP.',
        stats: 'STR 8  |  MAG 2  |  AGI 5',
        border: 'border-red-500',
        bg: 'bg-red-950',
    },
    {
        id: 'mage',
        name: 'Mage',
        emoji: '🧙',
        hp: 70,
        desc: 'Powerful spells. Fireball. Fragile.',
        stats: 'STR 3  |  MAG 9  |  AGI 6',
        border: 'border-blue-500',
        bg: 'bg-blue-950',
    },
    {
        id: 'rogue',
        name: 'Rogue',
        emoji: '🗡️',
        hp: 85,
        desc: 'Fast attacks. Stealth. Pick locks.',
        stats: 'STR 5  |  MAG 4  |  AGI 9',
        border: 'border-green-500',
        bg: 'bg-green-950',
    },
]

// Client component: use useParams() hook to access route params
// (async params pattern only works in Server Components)
export default function CharacterPage() {
    const { roomId } = useParams();
    const router = useRouter();

    const [name, setName] = useState<string>("");
    const [selected, setSelected] = useState<string>("warrior");

    function enterGame() {
        if (!name.trim()) return;

        localStorage.setItem("playerName", name.trim());
        localStorage.setItem("playerClass", selected);
        localStorage.setItem("roomId", roomId as string);
        router.push(`/room/${roomId}/game`);
    }

    return (
        <main className="flex flex-col items-center justify-center
                     min-h-screen bg-gray-950 text-white gap-8 p-8">

            <h2 className="text-4xl font-bold">Create Your Character</h2>
            <p className="text-gray-500 font-mono text-sm">Room: {roomId}</p>

            <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enterGame()}
                placeholder="Enter your character name..."
                maxLength={20}
                className="bg-gray-800 border border-gray-600 px-6 py-3
                   rounded-xl text-center text-lg w-80
                   focus:outline-none focus:border-purple-500"
            />

            <div className="flex gap-4 flex-wrap justify-center">
                {CLASSES.map(cls => (
                    <button
                        key={cls.id}
                        onClick={() => setSelected(cls.id)}
                        className={`p-6 rounded-2xl border-2 w-52 text-left
                        transition-all duration-150
                        ${selected === cls.id
                                ? `${cls.border} ${cls.bg}`
                                : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                            }`}
                    >
                        <div className="text-4xl mb-3">{cls.emoji}</div>
                        <div className="font-bold text-lg mb-1">{cls.name}</div>
                        <div className="text-red-400 text-sm mb-2">❤️ HP: {cls.hp}</div>
                        <div className="text-gray-400 text-xs mb-3">{cls.desc}</div>
                        <div className="text-gray-500 text-xs font-mono">{cls.stats}</div>
                    </button>
                ))}
            </div>

            <button
                onClick={enterGame}
                disabled={!name.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40
                   px-10 py-4 rounded-xl text-lg font-semibold
                   transition-colors w-72"
            >
                Enter the World →
            </button>

        </main>
    )
}