"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const [loading, setLoading] = useState<boolean>(false);
  const [code, setCode] = useState<string>("");
  const router = useRouter();

  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function createRoom() {
    setLoading(true);
    const roomId = generateRoomCode();
    router.push(`/room/${roomId}/character`);
  }

  function joinRoom() {
    const trimmed = code.trim().toUpperCase();
    if(trimmed.length === 6) {
      router.push(`/room/${trimmed}/character`);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center
                     min-h-screen bg-gray-950 text-white gap-6 p-8">

      <h1 className="text-6xl font-bold tracking-tight">🐉 AI Dungeon Master</h1>
      <p className="text-gray-400 text-xl">Every story is unique. Every game is yours.</p>

      <div className="flex flex-col gap-4 mt-8 w-72">

        <button
          onClick={createRoom}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50
                     px-8 py-4 rounded-xl text-lg font-semibold transition-colors"
        >
          {loading ? 'Creating...' : 'Create a New World'}
        </button>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            maxLength={6}
            placeholder="Room code..."
            className="flex-1 bg-gray-800 border border-gray-600 px-4 py-3
                       rounded-xl text-center tracking-widest uppercase
                       focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={joinRoom}
            className="bg-gray-700 hover:bg-gray-600 px-5 py-3
                       rounded-xl transition-colors"
          >
            Join
          </button>
        </div>

      </div>
    </main>
  )
}