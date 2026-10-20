'use client';

// src/app/page.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Gamepad2, Users, Layers, Sparkles, Zap, RefreshCw, LogIn, ArrowRight } from 'lucide-react';
import { useLanguage, LanguageSwitchButton } from '@/contexts/LanguageContext';
import { useTheme, ThemeSwitchButton } from '@/contexts/ThemeContext';
import { getActiveSession, saveActiveSession, clearActiveSession } from '@/utils/sessionStorage';
import { encodeSessionKey, generateUniqueSessionToken, decodeSessionKey } from '@/utils/sessionCrypto';

export default function Home() {
  const router = useRouter();
  const { texts } = useLanguage();
  const { landing } = texts;
  const { isInverted } = useTheme();

  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gameMode, setGameMode] = useState('classic'); // 'classic' | 'endless'
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    const saved = getActiveSession();
    if (saved && saved.roomId) {
      setActiveSession(saved);
    }
  }, []);

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError(landing.errors.enterName);
      return;
    }

    setError('');
    // Generate a random 4-digit room code
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const cleanName = playerName.trim();
    const sessionToken = generateUniqueSessionToken();

    // Encrypt payload into a secure URL key
    const encryptedKey = encodeSessionKey({
      roomId: roomCode,
      playerName: cleanName,
      gameMode,
      sessionToken,
    });

    saveActiveSession({
      roomId: roomCode,
      playerName: cleanName,
      gameMode,
      sessionToken,
      encryptedKey,
    });

    router.push(`/game/${encryptedKey}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      setError(landing.errors.enterName);
      return;
    }

    if (!roomId.trim()) {
      setError(landing.errors.enterRoomCode);
      return;
    }

    setError('');
    const rawInput = roomId.trim();
    const cleanName = playerName.trim();
    const decoded = decodeSessionKey(rawInput);
    const targetRoomId = decoded ? decoded.roomId : rawInput.toUpperCase();
    const targetMode = decoded ? decoded.gameMode : 'classic';
    const sessionToken = generateUniqueSessionToken();

    const encryptedKey = encodeSessionKey({
      roomId: targetRoomId,
      playerName: cleanName,
      gameMode: targetMode,
      sessionToken,
    });

    saveActiveSession({
      roomId: targetRoomId,
      playerName: cleanName,
      gameMode: targetMode,
      sessionToken,
      encryptedKey,
    });

    router.push(`/game/${encryptedKey}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (roomId.trim()) {
        handleJoinRoom();
      } else {
        handleCreateRoom();
      }
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-4 relative transition-colors duration-200 ${
        isInverted
          ? 'bg-gradient-to-br from-[#f0f3f6] via-[#ffffff] to-[#e4e9f0] text-[#1c1c1c]'
          : 'bg-gradient-to-br from-[#1a1a1a] via-[#262626] to-[#1c1c1c] text-[#c8d1d9]'
      }`}
    >
      {/* Language & Inverted Theme Switcher in Top Right */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center gap-2">
        <ThemeSwitchButton />
        <LanguageSwitchButton />
      </div>

      <div className="w-full max-w-md my-auto py-6">

        {/* Brand Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-[#a465b5]/20 border border-[#a465b5]/40 mb-2 shadow-lg shadow-[#a465b5]/15">
            <Gamepad2 className="w-9 h-9 text-[#a465b5]" />
          </div>
          <h1 className={`text-3xl sm:text-4xl font-black tracking-tight ${isInverted ? 'text-[#1a1a1a]' : 'text-white'}`}>
            CABO <span className="text-[#a465b5] font-black">ONLINE</span>
          </h1>
          <p className={`mt-1.5 text-xs sm:text-sm ${isInverted ? 'text-[#545454]' : 'text-[#c8d1d9]/80'}`}>
            {landing.appSubtitle}
          </p>
          <div className={`inline-flex flex-wrap items-center justify-center gap-2 mt-3 px-3 py-1 rounded-full text-xs font-semibold border ${
            isInverted
              ? 'bg-white border-[#c8d1d9] text-[#242424] shadow-sm'
              : 'bg-[#242424] border-[#545454] text-[#c8d1d9]'
          }`}>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-[#a465b5]" /> {landing.playersCount}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[#a465b5]" /> {landing.cardCount}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-[#ff5757]" /> {landing.abilitiesCount}</span>
          </div>
        </div>

        {/* Main Card Form */}
        <div className={`backdrop-blur-md border rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5 transition-all ${
          isInverted
            ? 'bg-white/95 border-[#c8d1d9] text-[#1c1c1c] shadow-slate-300/40'
            : 'bg-[#242424]/90 border-[#545454]/60 text-[#c8d1d9]'
        }`}>

          {/* Active Session Recovery Banner */}
          {activeSession && (
            <div className={`p-4 rounded-2xl border flex flex-col gap-3 shadow-md transition ${
              isInverted
                ? 'bg-purple-50 border-[#a465b5]/40 text-[#1e293b]'
                : 'bg-[#a465b5]/15 border-[#a465b5]/50 text-white'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#a465b5] flex items-center justify-center text-white shrink-0 shadow">
                  <Zap className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs sm:text-sm text-[#a465b5] truncate">
                    {landing.resumeSessionTitle || 'Pertandingan Sedang Berlangsung!'}
                  </h4>
                  <p className="text-[11px] text-[#8b949e] truncate">
                    {landing.resumeSessionDesc
                      ? landing.resumeSessionDesc(activeSession.roomId, activeSession.playerName)
                      : `Room ${activeSession.roomId} (${activeSession.playerName})`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/game/${activeSession.encryptedKey || activeSession.roomId}`)}
                  className="flex-1 py-2 px-3 bg-[#a465b5] hover:bg-[#8c4b9d] text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>{landing.resumeSessionBtn || 'Kembali ke Permainan'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearActiveSession();
                    setActiveSession(null);
                  }}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                    isInverted
                      ? 'bg-white hover:bg-slate-100 text-[#64748b] border-[#cbd5e1]'
                      : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#8b949e] border-[#545454]'
                  }`}
                  title={landing.dismissSessionBtn || 'Abaikan'}
                >
                  {landing.dismissSessionBtn || 'Abaikan'}
                </button>
              </div>
            </div>
          )}

          {/* Player Name */}
          <div>
            <label htmlFor="player-name" className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isInverted ? 'text-[#545454]' : 'text-[#c8d1d9]'}`}>
              {landing.playerNameLabel}
            </label>
            <input
              id="player-name"
              name="player-name"
              type="text"
              autoComplete="name"
              placeholder={landing.playerNamePlaceholder}
              maxLength={15}
              className={`block w-full px-4 py-3 border rounded-xl text-sm transition focus:outline-none focus:ring-2 focus:ring-[#a465b5] focus:border-[#a465b5] ${
                isInverted
                  ? 'bg-[#f8fafc] border-[#c8d1d9] text-[#1a1a1a] placeholder-[#8b949e]'
                  : 'bg-[#1c1c1c] border-[#545454] text-[#c8d1d9] placeholder-[#545454]'
              }`}
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Game Mode Selector (Classic vs Endless) */}
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isInverted ? 'text-[#545454]' : 'text-[#c8d1d9]'}`}>
              {landing.gameModeLabel}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameMode('classic')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  gameMode === 'classic'
                    ? isInverted
                      ? 'bg-[#a465b5]/15 border-[#a465b5] ring-2 ring-[#a465b5]/30 text-[#1a1a1a]'
                      : 'bg-[#a465b5]/20 border-[#a465b5] ring-2 ring-[#a465b5]/40 text-white'
                    : isInverted
                    ? 'bg-[#f8fafc] border-[#c8d1d9] text-[#545454] hover:text-[#1a1a1a]'
                    : 'bg-[#1c1c1c] border-[#545454]/60 text-[#8b949e] hover:text-[#c8d1d9]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                  <Zap className="w-3.5 h-3.5 text-[#ff5757]" />
                  <span>{landing.classicModeTitle}</span>
                </div>
                <p className={`text-[10px] leading-tight ${isInverted ? 'text-[#545454]' : 'text-[#8b949e]'}`}>
                  {landing.classicModeDesc}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGameMode('endless')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  gameMode === 'endless'
                    ? isInverted
                      ? 'bg-[#a465b5]/15 border-[#a465b5] ring-2 ring-[#a465b5]/30 text-[#1a1a1a]'
                      : 'bg-[#a465b5]/20 border-[#a465b5] ring-2 ring-[#a465b5]/40 text-white'
                    : isInverted
                    ? 'bg-[#f8fafc] border-[#c8d1d9] text-[#545454] hover:text-[#1a1a1a]'
                    : 'bg-[#1c1c1c] border-[#545454]/60 text-[#8b949e] hover:text-[#c8d1d9]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                  <RefreshCw className="w-3.5 h-3.5 text-[#a465b5]" />
                  <span>{landing.endlessModeTitle}</span>
                </div>
                <p className={`text-[10px] leading-tight ${isInverted ? 'text-[#545454]' : 'text-[#8b949e]'}`}>
                  {landing.endlessModeDesc}
                </p>
              </button>
            </div>
          </div>

          {/* Create Room Button */}
          <div className="pt-1">
            <button
              type="button"
              id="create-room-btn"
              onClick={handleCreateRoom}
              disabled={!playerName.trim()}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-[#a465b5] hover:bg-[#8c4b9d] focus:outline-none focus:ring-2 focus:ring-[#a465b5] focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-[#a465b5]/30 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>{landing.createRoomBtn} ({gameMode === 'endless' ? 'Endless' : 'Classic'})</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className={`w-full border-t ${isInverted ? 'border-[#c8d1d9]' : 'border-[#545454]/60'}`} />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-semibold">
              <span className={`px-3 ${isInverted ? 'bg-white text-[#545454]' : 'bg-[#242424] text-[#8b949e]'}`}>
                {landing.orJoinRoom}
              </span>
            </div>
          </div>

          {/* Join Room Section */}
          <div className="space-y-3">
            <div>
              <label htmlFor="room-id" className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isInverted ? 'text-[#545454]' : 'text-[#c8d1d9]'}`}>
                {landing.roomCodeLabel}
              </label>
              <input
                id="room-id"
                name="room-id"
                type="text"
                autoComplete="off"
                placeholder={landing.roomCodePlaceholder}
                maxLength={6}
                className={`block w-full px-4 py-3 border rounded-xl text-sm tracking-widest font-mono text-center uppercase transition focus:outline-none focus:ring-2 focus:ring-[#a465b5] focus:border-[#a465b5] ${
                  isInverted
                    ? 'bg-[#f8fafc] border-[#c8d1d9] text-[#1a1a1a] placeholder-[#8b949e]'
                    : 'bg-[#1c1c1c] border-[#545454] text-white placeholder-[#545454]'
                }`}
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value.toUpperCase());
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
              />
            </div>

            <button
              type="button"
              id="join-room-btn"
              onClick={handleJoinRoom}
              disabled={!playerName.trim() || !roomId.trim()}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm border transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                isInverted
                  ? 'bg-[#f0f3f6] hover:bg-[#e4e9f0] border-[#c8d1d9] text-[#1a1a1a]'
                  : 'bg-[#2e2e2e] hover:bg-[#383838] border-[#545454] hover:border-[#a465b5] text-[#c8d1d9]'
              }`}
            >
              <LogIn className="w-4 h-4 text-[#a465b5]" />
              <span>{landing.joinRoomBtn}</span>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-[#ff5757]/15 border border-[#ff5757]/40 rounded-xl text-xs text-[#ff5757] font-semibold text-center">
              {error}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className={`text-center mt-6 text-xs space-y-1 ${isInverted ? 'text-[#545454]' : 'text-[#8b949e]'}`}>
          <p>Pool: 1st Edition (52 cards) · 2nd Edition (70 cards)</p>
          <p>Modes: Classic (ends on draw pile empty) & Endless (reshuffles until Cabo)</p>
        </div>

      </div>
    </div>
  );
}
