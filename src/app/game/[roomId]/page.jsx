'use client';

// src/app/game/[roomId]/page.jsx
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GameBoard from '@/components/GameBoard';
import { Gamepad2, ArrowLeft } from 'lucide-react';
import { decodeSessionKey, encodeSessionKey, generateUniqueSessionToken } from '@/utils/sessionCrypto';
import { getActiveSession, saveActiveSession } from '@/utils/sessionStorage';

export default function GameRoom({ params }) {
  const { roomId: rawParam } = params;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [realRoomId, setRealRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [inputName, setInputName] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [gameMode, setGameMode] = useState('classic');
  const [needsName, setNeedsName] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Try decoding encrypted session key or invite key
    const decoded = decodeSessionKey(rawParam);
    const resolvedRoom = decoded ? decoded.roomId : rawParam.toUpperCase();
    const resolvedMode = decoded?.gameMode || (searchParams.get('mode') === 'endless' ? 'endless' : 'classic');

    setRealRoomId(resolvedRoom);
    setGameMode(resolvedMode);

    // 2. Check player name from token payload, URL query, or local active session
    let targetName = decoded?.playerName || searchParams.get('player') || null;
    let targetToken = decoded?.sessionToken || null;

    if (!targetName) {
      const active = getActiveSession();
      if (active && active.roomId === resolvedRoom && active.playerName) {
        targetName = active.playerName;
        targetToken = active.sessionToken;
      } else if (typeof window !== 'undefined') {
        const saved = sessionStorage.getItem('cabo_player_name');
        if (saved && saved.trim()) targetName = saved.trim();
      }
    }

    if (!targetToken) {
      targetToken = generateUniqueSessionToken();
    }

    setSessionToken(targetToken);

    if (targetName && targetName.trim()) {
      const clean = targetName.trim();
      setPlayerName(clean);

      // Save/persist active session
      const encKey = encodeSessionKey({
        roomId: resolvedRoom,
        playerName: clean,
        gameMode: resolvedMode,
        sessionToken: targetToken,
      });
      saveActiveSession({
        roomId: resolvedRoom,
        playerName: clean,
        gameMode: resolvedMode,
        sessionToken: targetToken,
        encryptedKey: encKey,
      });

      setIsLoading(false);
    } else {
      setNeedsName(true);
      setIsLoading(false);
    }
  }, [rawParam, searchParams]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const clean = inputName.trim();

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cabo_player_name', clean);
    }

    const token = sessionToken || generateUniqueSessionToken();
    setSessionToken(token);
    setPlayerName(clean);
    setNeedsName(false);

    // Persist active session
    const encKey = encodeSessionKey({
      roomId: realRoomId,
      playerName: clean,
      gameMode,
      sessionToken: token,
    });
    saveActiveSession({
      roomId: realRoomId,
      playerName: clean,
      gameMode,
      sessionToken: token,
      encryptedKey: encKey,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1a1a1a] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#a465b5] mx-auto mb-4" />
          <p className="text-[#8b949e] text-sm">Preparing Cabo game room...</p>
        </div>
      </div>
    );
  }

  // If player joined directly via link without a name, show friendly name prompt
  if (needsName) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#242424] to-[#1c1c1c] text-white flex items-center justify-center p-4">
        <div className="bg-[#242424] border border-[#545454] rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-[#a465b5]/20 border border-[#a465b5]/30 mb-2">
            <Gamepad2 className="w-8 h-8 text-[#a465b5]" />
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Join Cabo Room</h2>
          <p className="text-xs text-[#a465b5] font-mono font-bold tracking-widest mt-1 mb-6">
            ROOM CODE: {realRoomId || 'CABO'}
          </p>

          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <label htmlFor="join-name" className="block text-xs font-bold uppercase tracking-wider text-[#c8d1d9] text-left mb-1.5">
                Enter Your Name
              </label>
              <input
                id="join-name"
                type="text"
                maxLength={15}
                placeholder="e.g. Ace"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-[#1c1c1c] border border-[#545454] rounded-xl text-white placeholder-[#8b949e] text-sm focus:outline-none focus:ring-2 focus:ring-[#a465b5]"
              />
            </div>

            <button
              type="submit"
              disabled={!inputName.trim()}
              className="w-full py-3 bg-[#a465b5] hover:bg-[#8c4b9d] disabled:opacity-40 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#a465b5]/30"
            >
              Enter Game Room
            </button>
          </form>

          <button
            onClick={() => router.push('/')}
            className="mt-4 text-xs text-[#8b949e] hover:text-[#c8d1d9] transition inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  if (!playerName || !realRoomId) return null;

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      <GameBoard
        roomId={realRoomId}
        playerName={playerName}
        initialMode={gameMode}
        sessionToken={sessionToken}
      />
    </div>
  );
}
