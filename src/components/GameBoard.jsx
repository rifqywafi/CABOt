'use client';

// src/components/GameBoard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { useSocketContext } from '@/contexts/SocketContext';
import { useLanguage, LanguageSwitchButton } from '@/contexts/LanguageContext';
import { useTheme, ThemeSwitchButton } from '@/contexts/ThemeContext';
import { useRouter } from 'next/navigation';
import {
  Gamepad2,
  Copy,
  Share2,
  Check,
  Zap,
  RefreshCw,
  BookOpen,
  HelpCircle,
  Eye,
  EyeOff,
  Search,
  ArrowLeftRight,
  Layers,
  Megaphone,
  Sparkles,
  Trash2,
  Flag,
  Trophy,
  X,
  Target,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Lock,
} from 'lucide-react';
import { encodeInviteKey } from '@/utils/sessionCrypto';

export default function GameBoard({ roomId, playerName, initialMode = 'classic', sessionToken }) {
  const router = useRouter();
  const { socket, connected } = useSocketContext();
  const { texts, lang } = useLanguage();
  const {
    connection: connTexts,
    lobby: lobbyTexts,
    header: headerTexts,
    table: tableTexts,
    drawnCard: drawnCardTexts,
    hand: handTexts,
    peekBanner: peekTexts,
    spyModal: spyTexts,
    caboModal: caboTexts,
    roundEndModal: roundTexts,
    gameOverModal: overTexts,
    rulesModal: rulesTexts,
    afk: afkTexts,
    notifications: notifyTexts,
  } = texts;

  const safeAfkTexts = afkTexts || {
    confirmTitle: 'Apakah Anda Masih di Sini?',
    confirmSubtitle: 'Anda tidak melakukan aktivitas selama 60 detik pada giliran Anda.',
    confirmCountdown: (sec) => `Konfirmasi dalam ${sec} detik sebelum giliran di-skip...`,
    confirmBtn: 'Saya Masih di Sini!',
    bannerTitle: 'Anda Sedang Ditandai Offline / AFK',
    bannerDesc: 'Giliran Anda dilewati otomatis agar pemain lain tidak menunggu.',
    resumeBtn: 'Lanjutkan Bermain (Saya Kembali)',
    badge: 'OFFLINE / AFK',
  };

  const notifyTextsRef = useRef(notifyTexts);
  useEffect(() => {
    notifyTextsRef.current = notifyTexts;
  }, [notifyTexts]);

  const { isInverted } = useTheme();

  // ── Core Game States ────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState(null);
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [myPlayerId, setMyPlayerId] = useState(null);
  const [drawnCard, setDrawnCard] = useState(null);
  const [drawnCardSource, setDrawnCardSource] = useState(null); // 'deck' | 'discard'

  // Known cards in hand: { [index]: CardObject }
  const [knownCards, setKnownCards] = useState({});

  // ── UI Interactivity States ─────────────────────────────────────────────────
  const [selectedHandIndex, setSelectedHandIndex] = useState(null);
  const [abilityPhase, setAbilityPhase] = useState(null); // 'peek' | 'spy' | 'swap'
  const [abilityTargets, setAbilityTargets] = useState([]);
  const [swapMyIndex, setSwapMyIndex] = useState(null);
  const [notification, setNotification] = useState(null);
  const [gamePhase, setGamePhase] = useState('waiting'); // 'waiting' | 'peek' | 'playing' | 'roundEnd' | 'gameOver'
  const [caboCalledBy, setCaboCalledBy] = useState(null);
  const [turnsRemaining, setTurnsRemaining] = useState(0);
  const [roundResults, setRoundResults] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [revealHands, setRevealHands] = useState(null);
  const [readyStates, setReadyStates] = useState({});
  
  // ── Active Peek State (Card open in deck with visible 10s countdown timer) ──
  // { cardIndex, card, secondsLeft, duration, isInitialPeek, id }
  const [activePeek, setActivePeek] = useState(null);

  // ── Active Spy State (Opponent card open for 5s) ──
  // { targetPlayerName, cardIndex, card, secondsLeft, duration, id }
  const [activeSpy, setActiveSpy] = useState(null);

  // ── Idle / AFK Protection States (30s idle -> 10s modal -> auto skip) ──────
  const [showIdleConfirmModal, setShowIdleConfirmModal] = useState(false);
  const [idleConfirmSecondsLeft, setIdleConfirmSecondsLeft] = useState(10);
  const [isSelfAfk, setIsSelfAfk] = useState(false);
  const lastActivityRef = useRef(Date.now());

  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showCaboConfirmModal, setShowCaboConfirmModal] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  // ── Custom Turn Order & Randomizer Animation States ─────────────────────────
  const [showCustomOrderModal, setShowCustomOrderModal] = useState(false);
  const [customOrderList, setCustomOrderList] = useState([]);
  const [randomizerAnimation, setRandomizerAnimation] = useState(null); // { winnerName, isRunning, candidateName }

  // ── User Activity Listener (Resets 30s idle timer) ──────────────────────────
  useEffect(() => {
    const handleActivity = () => {
      if (!showIdleConfirmModal && !isSelfAfk) {
        lastActivityRef.current = Date.now();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [showIdleConfirmModal, isSelfAfk]);

  // ── 60s Idle Detection ONLY on My Turn + 10s Confirmation Pop-up ─────────────
  const prevIsMyTurnRef = useRef(false);

  useEffect(() => {
    const isCurrentlyMyTurn = Boolean(
      gameState?.currentPlayerId &&
      gameState.currentPlayerId === myPlayerId &&
      gamePhase === 'playing'
    );

    // Turn just transitioned to me: start a fresh 60s window
    if (isCurrentlyMyTurn && !prevIsMyTurnRef.current) {
      lastActivityRef.current = Date.now();
      setShowIdleConfirmModal(false);
      setIdleConfirmSecondsLeft(10);
    }
    // Turn just ended for me: close modal if open
    if (!isCurrentlyMyTurn && prevIsMyTurnRef.current) {
      setShowIdleConfirmModal(false);
    }
    prevIsMyTurnRef.current = isCurrentlyMyTurn;

    // Do NOT run idle timer if it's not my turn, not playing, or already AFK
    if (!socket || !isCurrentlyMyTurn || isSelfAfk) {
      if (showIdleConfirmModal) setShowIdleConfirmModal(false);
      return;
    }

    const interval = setInterval(() => {
      // Re-verify it is still strictly my turn
      const stillMyTurn = Boolean(
        gameStateRef.current?.currentPlayerId &&
        gameStateRef.current.currentPlayerId === myPlayerId &&
        gameStateRef.current?.gamePhase === 'playing'
      );

      if (!stillMyTurn) {
        clearInterval(interval);
        setShowIdleConfirmModal(false);
        return;
      }

      if (!showIdleConfirmModal) {
        const idleSec = Math.floor((Date.now() - lastActivityRef.current) / 1000);
        if (idleSec >= 60) {
          setShowIdleConfirmModal(true);
          setIdleConfirmSecondsLeft(10);
        }
      } else {
        setIdleConfirmSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setShowIdleConfirmModal(false);
            setIsSelfAfk(true);
            socket.emit('player-idle-timeout');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [socket, gameState?.currentPlayerId, gameState?.gamePhase, gamePhase, isSelfAfk, showIdleConfirmModal, myPlayerId]);

  // ── Auto Countdown Timer for activePeek (10s initial peek, 5s ability peek) ─
  useEffect(() => {
    if (!activePeek) return;

    const timer = setInterval(() => {
      setActivePeek((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          clearInterval(timer);
          return null; // OTOMATIS TERTUTUP KEMBALI KETIKA TIMER 10 DETIK HABIS!
        }
        return {
          ...prev,
          secondsLeft: prev.secondsLeft - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePeek?.id]);

  // ── Auto Countdown Timer for activeSpy (5s) ─
  useEffect(() => {
    if (!activeSpy) return;

    const timer = setInterval(() => {
      setActiveSpy((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          clearInterval(timer);
          return null;
        }
        return {
          ...prev,
          secondsLeft: prev.secondsLeft - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSpy?.id]);

  // ── Helper to show Toast Notification ───────────────────────────────────────
  const showNotification = useCallback((message, type = 'info', duration = 3500) => {
    setNotification({ message, type });
    if (duration) {
      setTimeout(() => {
        setNotification((current) => (current?.message === message ? null : current));
      }, duration);
    }
  }, []);

  // ── Normalization Helper ───────────────────────────────────────────────────
  const normalizePlayer = useCallback((p) => {
    if (!p) return null;
    const handSize = p.handSize ?? (Array.isArray(p.hand) ? p.hand.length : 4);
    return {
      ...p,
      handSize,
      hand: Array.isArray(p.hand) && p.hand.length > 0 ? p.hand : Array.from({ length: handSize }),
      seenPositions: Array.isArray(p.seenPositions) ? p.seenPositions : [],
      faceUpCards: p.faceUpCards || {},
      isAfk: Boolean(p.isAfk),
      isOffline: Boolean(p.isOffline),
    };
  }, []);

  const myPlayer = gameState?.players?.find((p) => p.id === myPlayerId) || null;
  const isMyTurn = Boolean(gameState?.currentPlayerId && gameState.currentPlayerId === myPlayerId);
  const otherPlayers = gameState?.players?.filter((p) => p.id !== myPlayerId) || [];
  const isHost = Boolean(
    gameState?.hostId
      ? gameState.hostId === myPlayerId
      : gameState?.players?.[0]?.id === myPlayerId
  );

  const [activeOpponentIndex, setActiveOpponentIndex] = useState(0);

  useEffect(() => {
    if (gameState?.currentPlayerId && otherPlayers.length > 0) {
      const activeIdx = otherPlayers.findIndex((p) => p.id === gameState.currentPlayerId);
      if (activeIdx !== -1) {
        setActiveOpponentIndex(activeIdx);
      }
    }
  }, [gameState?.currentPlayerId, otherPlayers.length]);

  // ── Socket Events Setup ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId || !playerName) return;

    // Join room with session token for robust reconnect protection
    socket.emit('join-room', { roomId, playerName, gameMode: initialMode, sessionToken });

    const onGameState = (state) => {
      const normalizedPlayers = (state.players || []).map(normalizePlayer);
      setGameState({
        ...state,
        players: normalizedPlayers,
      });

      setReadyStates(
        (state.players || []).reduce((acc, p) => {
          acc[p.id] = p.ready ?? false;
          return acc;
        }, {})
      );

      setGamePhase(state.gamePhase || 'waiting');
      setCaboCalledBy(state.caboCalledBy || null);
      setTurnsRemaining(state.turnsRemaining ?? 0);

      // Determine myPlayerId
      const me = normalizedPlayers.find(
        (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
      );
      if (me) {
        setMyPlayerId(me.id);
        if (me.isAfk !== undefined) {
          setIsSelfAfk(me.isAfk);
        }
      }
    };

    const onGameModeUpdated = ({ gameMode }) => {
      setGameState((prev) => (prev ? { ...prev, gameMode } : prev));
      showNotification(notifyTextsRef.current.gameModeSet(gameMode), 'info', 2500);
    };

    const onRoundModeUpdated = ({ roundMode, targetRounds, targetScore }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              roundMode: roundMode ?? prev.roundMode,
              targetRounds: targetRounds ?? prev.targetRounds,
              targetScore: targetScore ?? prev.targetScore,
            }
          : prev
      );
      if (notifyTextsRef.current.roundModeSet) {
        showNotification(notifyTextsRef.current.roundModeSet(roundMode), 'info', 2500);
      }
    };

    const onPeekDurationUpdated = ({ initialPeekDuration, abilityPeekDuration }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              initialPeekDuration: initialPeekDuration ?? prev.initialPeekDuration,
              abilityPeekDuration: abilityPeekDuration ?? prev.abilityPeekDuration,
            }
          : prev
      );
    };

    const onDeckReshuffled = ({ drawPileCount, discardTop, message }) => {
      setGameState((prev) =>
        prev ? { ...prev, drawPileCount, discardTop } : prev
      );
      showNotification(
        message || notifyTextsRef.current.deckReshuffled,
        'warning',
        4500
      );
    };

    const onPlayerJoined = ({ playerName: name, playerCount }) => {
      if (name.toLowerCase() !== playerName.toLowerCase()) {
        showNotification(notifyTextsRef.current.playerJoined(name, playerCount), 'info');
      }
    };

    const onPlayerReconnected = ({ playerName: name }) => {
      showNotification(notifyTextsRef.current.playerReconnected(name), 'info');
    };

    const onPlayerReconnectedState = (data) => {
      showNotification(notifyTextsRef.current.playerReconnected(playerName), 'success', 3000);
      if (data?.tempCard) {
        setDrawnCard(data.tempCard);
        setDrawnCardSource(data.tempCardSource || 'deck');
        setSelectedHandIndex('choosing');
      }
      if (data?.seenPositions && Array.isArray(data.seenPositions) && Array.isArray(data.hand)) {
        const restoredKnown = {};
        data.seenPositions.forEach((pos) => {
          if (data.hand[pos]) {
            restoredKnown[pos] = data.hand[pos];
          }
        });
        setKnownCards((prev) => ({ ...prev, ...restoredKnown }));
      }
    };

    const onPlayerAfkStatus = ({ playerId, playerName: pName, isAfk }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((p) =>
            p.id === playerId ? { ...p, isAfk } : p
          ),
        };
      });
      if (playerId === myPlayerId) {
        setIsSelfAfk(isAfk);
      } else if (!isAfk) {
        showNotification(
          notifyTextsRef.current.playerBackOnline
            ? notifyTextsRef.current.playerBackOnline(pName)
            : `${pName} kembali online!`,
          'info',
          2500
        );
      }
    };

    const onPlayerOffline = ({ playerId, playerName: pName }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((p) =>
            p.id === playerId ? { ...p, isOffline: true } : p
          ),
        };
      });
      if (pName.toLowerCase() !== playerName.toLowerCase()) {
        showNotification(
          notifyTextsRef.current.playerOfflineNotice
            ? notifyTextsRef.current.playerOfflineNotice(pName)
            : `${pName} terputus dari room`,
          'warning',
          3500
        );
      }
    };

    const onTurnSkipped = ({ skippedPlayerName }) => {
      showNotification(
        notifyTextsRef.current.playerAfkSkipped
          ? notifyTextsRef.current.playerAfkSkipped(skippedPlayerName)
          : `Giliran ${skippedPlayerName} dilewati karena sedang AFK/Offline`,
        'warning',
        4000
      );
    };

    const onGameStarted = (data) => {
      setGamePhase(data.gamePhase || 'peek');
      setDrawnCard(null);
      setDrawnCardSource(null);
      setSelectedHandIndex(null);
      setAbilityPhase(null);
      setSwapMyIndex(null);
      setRoundResults(null);
      setGameOverData(null);
      setRevealHands(null);
      setCaboCalledBy(null);
      setTurnsRemaining(0);
      setKnownCards({});

      setGameState((prev) => ({
        ...prev,
        players: (data.players || []).map(normalizePlayer),
        currentPlayerId: data.currentPlayerId,
        currentPlayerName: data.currentPlayerName,
        discardTop: data.discardTop,
        drawPileCount: data.drawPileCount,
        gamePhase: data.gamePhase || 'peek',
        caboCalledBy: null,
        turnsRemaining: 0,
      }));

      if (data?.turnOrderMode === 'random' && data?.startingPlayerName && (data?.players?.length || 0) > 1) {
        const allNames = (data.players || []).map((p) => p.name);
        setRandomizerAnimation({
          isRunning: true,
          winnerName: data.startingPlayerName,
          candidateName: data.startingPlayerName,
        });

        let tickCount = 0;
        const maxTicks = 16;
        const interval = setInterval(() => {
          tickCount++;
          const randomName = allNames[Math.floor(Math.random() * allNames.length)] || data.startingPlayerName;
          setRandomizerAnimation((prev) =>
            prev ? { ...prev, candidateName: randomName } : null
          );

          if (tickCount >= maxTicks) {
            clearInterval(interval);
            setRandomizerAnimation((prev) =>
              prev ? { ...prev, isRunning: false, candidateName: data.startingPlayerName } : null
            );
            setTimeout(() => {
              setRandomizerAnimation(null);
            }, 1800);
          }
        }, 85);
      } else if (data?.startingPlayerName && notifyTextsRef.current.randomStartingPlayer) {
        showNotification(notifyTextsRef.current.randomStartingPlayer(data.startingPlayerName), 'info', 4500);
      } else {
        showNotification(notifyTextsRef.current.newRoundStarted, 'success', 4500);
      }
    };

    const onPeekPhaseCompleted = ({ message }) => {
      setGamePhase('playing');
      showNotification(message || notifyTextsRef.current.mainGameBegins, 'success', 4000);
    };

    const onTurnChanged = ({ currentPlayerId, currentPlayerName, turnsRemaining: tr, gamePhase: phase }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              currentPlayerId,
              currentPlayerName,
              turnsRemaining: tr ?? prev.turnsRemaining,
              gamePhase: phase ?? prev.gamePhase,
            }
          : prev
      );

      if (phase) setGamePhase(phase);
      if (tr !== undefined) setTurnsRemaining(tr);

      // Reset turn local UI states
      setDrawnCard(null);
      setDrawnCardSource(null);
      setSelectedHandIndex(null);
      setAbilityPhase(null);
      setSwapMyIndex(null);

      const isMe = currentPlayerId === myPlayerId;
      if (isMe) {
        lastActivityRef.current = Date.now();
        setShowIdleConfirmModal(false);
        setIdleConfirmSecondsLeft(10);
        showNotification(notifyTextsRef.current.yourTurn, 'info', 4000);
      } else {
        setShowIdleConfirmModal(false);
      }
    };

    const onCardDrawn = ({ card, source }) => {
      setDrawnCard(card);
      setDrawnCardSource(source);
      setSelectedHandIndex('choosing');
      if (source === 'discard') {
        showNotification(notifyTextsRef.current.drewFromDiscard(card.value), 'success', 3500);
      } else {
        showNotification(notifyTextsRef.current.drewFromDeck(card.value, card.ability), 'info', 3500);
      }
    };

    const onPlayerDrewCard = ({ playerName: pName, source }) => {
      showNotification(notifyTextsRef.current.playerDrew(pName, source), 'info', 2500);
    };

    const onCardDiscarded = ({ playerName: pName, card, discardTop, action }) => {
      setGameState((prev) => (prev ? { ...prev, discardTop } : prev));
      if (action === 'swap') {
        showNotification(notifyTextsRef.current.playerSwappedDiscard(pName, card.value), 'info', 3000);
      } else if (action === 'discard') {
        showNotification(notifyTextsRef.current.playerDiscarded(pName, card.value), 'info', 2500);
      } else if (action?.startsWith('ability-')) {
        showNotification(notifyTextsRef.current.playerUsedAbility(pName, card.value, card.ability), 'info', 3000);
      }
    };

    const onAbilityActivated = ({ ability, availableTargets }) => {
      setAbilityPhase(ability);
      setAbilityTargets(availableTargets || []);
      if (ability === 'peek') {
        showNotification(notifyTextsRef.current.abilityPeek, 'info', 4000);
      } else if (ability === 'spy') {
        showNotification(notifyTextsRef.current.abilitySpy, 'info', 4000);
      } else if (ability === 'swap') {
        showNotification(notifyTextsRef.current.abilitySwap, 'info', 4000);
      }
    };

    const onCardPeeked = ({ cardIndex, card, peekRemaining, isInitialPeek }) => {
      const initialDur = gameStateRef.current?.initialPeekDuration ?? 10;
      const abilityDur = gameStateRef.current?.abilityPeekDuration ?? 5;
      const duration = isInitialPeek ? initialDur : abilityDur;
      setActivePeek({
        cardIndex,
        card,
        secondsLeft: duration,
        duration,
        isInitialPeek: Boolean(isInitialPeek),
        peekRemaining,
        id: `peek-${cardIndex}-${Date.now()}`,
      });
    };

    const onCardSpied = ({ targetPlayerName, cardIndex, card }) => {
      const duration = gameStateRef.current?.abilityPeekDuration ?? 5;
      setActiveSpy({
        targetPlayerName,
        cardIndex,
        card,
        secondsLeft: duration,
        duration,
        id: `spy-${cardIndex}-${Date.now()}`,
      });

      setAbilityPhase(null);
    };

    const onDeckEditionUpdated = ({ deckEdition }) => {
      setGameState((prev) => (prev ? { ...prev, deckEdition } : prev));
      if (notifyTextsRef.current.deckEditionSet) {
        showNotification(notifyTextsRef.current.deckEditionSet(deckEdition), 'info', 2500);
      }
    };

    const onCardsSwapped = ({ playerName: pName, targetPlayerName, myCardIndex, targetCardIndex, playerId, targetPlayerId }) => {
      showNotification(
        notifyTextsRef.current.cardsSwapped(pName, myCardIndex, targetCardIndex, targetPlayerName),
        'warning',
        4000
      );

      // If I was involved in the swap, my card at that index is now unknown (blind swap)
      if (playerId === myPlayerId) {
        setKnownCards((prev) => {
          const next = { ...prev };
          delete next[myCardIndex];
          return next;
        });
      }
      if (targetPlayerId === myPlayerId) {
        setKnownCards((prev) => {
          const next = { ...prev };
          delete next[targetCardIndex];
          return next;
        });
      }

      setAbilityPhase(null);
      setSwapMyIndex(null);
    };

    const onCaboCalled = ({ playerName: callerName, turnsRemaining: tr }) => {
      setCaboCalledBy(callerName);
      setTurnsRemaining(tr);
      showNotification(notifyTextsRef.current.caboCalled(callerName), 'warning', 6000);
    };

    const onRoundEnded = (data) => {
      setRoundResults(data);
      setGamePhase('roundEnd');
      setRevealHands(data.hands || null);
      showNotification(notifyTextsRef.current.roundEnded, 'info', 4000);
    };

    const onGameOver = (data) => {
      setGameOverData(data);
      setGamePhase('gameOver');
      setRevealHands(data.hands || null);
      showNotification(notifyTextsRef.current.gameOver(data.winnerName), 'success', 6000);
    };

    const onPlayerReadyUpdated = ({ readyStates: rStates }) => {
      setReadyStates(rStates || {});
    };

    const onPlayerLeft = ({ playerName: lName }) => {
      showNotification(notifyTextsRef.current.playerLeft(lName), 'warning', 4000);
    };

    const onPlayerSwappedHand = ({ playerId, handIndex, card, isFaceUp }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((p) => {
            if (p.id !== playerId) return p;
            const updated = { ...(p.faceUpCards || {}) };
            if (isFaceUp && card) {
              updated[handIndex] = card;
            } else {
              delete updated[handIndex];
              delete updated[String(handIndex)];
            }
            return {
              ...p,
              faceUpCards: updated,
            };
          }),
        };
      });
    };

    const onTurnOrderModeUpdated = ({ turnOrderMode, customPlayerOrder }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              turnOrderMode: turnOrderMode ?? prev.turnOrderMode,
              customPlayerOrder: customPlayerOrder ?? prev.customPlayerOrder,
            }
          : prev
      );
    };

    const onError = (msg) => {
      const err = typeof msg === 'string' ? msg : msg?.message || 'Action failed';
      showNotification(err, 'error', 4000);
    };

    socket.on('game-state', onGameState);
    socket.on('player-joined', onPlayerJoined);
    socket.on('player-reconnected', onPlayerReconnected);
    socket.on('game-started', onGameStarted);
    socket.on('peek-phase-completed', onPeekPhaseCompleted);
    socket.on('turn-changed', onTurnChanged);
    socket.on('card-drawn', onCardDrawn);
    socket.on('player-drew-card', onPlayerDrewCard);
    socket.on('card-discarded', onCardDiscarded);
    socket.on('player-swapped-hand', onPlayerSwappedHand);
    socket.on('ability-activated', onAbilityActivated);
    socket.on('card-peeked', onCardPeeked);
    socket.on('card-spied', onCardSpied);
    socket.on('cards-swapped', onCardsSwapped);
    socket.on('cabo-called', onCaboCalled);
    socket.on('round-ended', onRoundEnded);
    socket.on('game-over', onGameOver);
    socket.on('player-ready-updated', onPlayerReadyUpdated);
    socket.on('game-mode-updated', onGameModeUpdated);
    socket.on('round-mode-updated', onRoundModeUpdated);
    socket.on('deck-edition-updated', onDeckEditionUpdated);
    socket.on('peek-duration-updated', onPeekDurationUpdated);
    socket.on('turn-order-mode-updated', onTurnOrderModeUpdated);
    socket.on('deck-reshuffled', onDeckReshuffled);
    socket.on('player-left', onPlayerLeft);
    socket.on('player-offline', onPlayerOffline);
    socket.on('player-afk-status', onPlayerAfkStatus);
    socket.on('turn-skipped', onTurnSkipped);
    socket.on('player-reconnected-state', onPlayerReconnectedState);
    socket.on('error', onError);

    return () => {
      socket.off('game-state', onGameState);
      socket.off('player-joined', onPlayerJoined);
      socket.off('player-reconnected', onPlayerReconnected);
      socket.off('game-started', onGameStarted);
      socket.off('peek-phase-completed', onPeekPhaseCompleted);
      socket.off('turn-changed', onTurnChanged);
      socket.off('card-drawn', onCardDrawn);
      socket.off('player-drew-card', onPlayerDrewCard);
      socket.off('card-discarded', onCardDiscarded);
      socket.off('player-swapped-hand', onPlayerSwappedHand);
      socket.off('ability-activated', onAbilityActivated);
      socket.off('card-peeked', onCardPeeked);
      socket.off('card-spied', onCardSpied);
      socket.off('cards-swapped', onCardsSwapped);
      socket.off('cabo-called', onCaboCalled);
      socket.off('round-ended', onRoundEnded);
      socket.off('game-over', onGameOver);
      socket.off('player-ready-updated', onPlayerReadyUpdated);
      socket.off('game-mode-updated', onGameModeUpdated);
      socket.off('round-mode-updated', onRoundModeUpdated);
      socket.off('deck-edition-updated', onDeckEditionUpdated);
      socket.off('peek-duration-updated', onPeekDurationUpdated);
      socket.off('turn-order-mode-updated', onTurnOrderModeUpdated);
      socket.off('deck-reshuffled', onDeckReshuffled);
      socket.off('player-left', onPlayerLeft);
      socket.off('player-offline', onPlayerOffline);
      socket.off('player-afk-status', onPlayerAfkStatus);
      socket.off('turn-skipped', onTurnSkipped);
      socket.off('player-reconnected-state', onPlayerReconnectedState);
      socket.off('error', onError);
    };
  }, [socket, roomId, playerName, myPlayerId, normalizePlayer, showNotification, initialMode, sessionToken]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCopyRoomInfo = (type = 'code') => {
    let textToCopy = roomId;
    if (type === 'link') {
      const inviteKey = encodeInviteKey({ roomId, gameMode: gameState?.gameMode || 'classic' });
      const baseAppUrl = (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim())
        ? process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, '')
        : (typeof window !== 'undefined' ? window.location.origin : '');
      textToCopy = `${baseAppUrl}/game/${inviteKey}`;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
      showNotification(notifyTexts.roomCopied(type), 'success', 2000);
    });
  };

  const handleConfirmStillHere = () => {
    lastActivityRef.current = Date.now();
    setShowIdleConfirmModal(false);
    if (isSelfAfk) {
      setIsSelfAfk(false);
      socket.emit('resume-from-afk');
    }
  };

  const handleResumeFromAfk = () => {
    lastActivityRef.current = Date.now();
    setIsSelfAfk(false);
    socket.emit('resume-from-afk');
  };

  const handleSetGameMode = (mode) => {
    if (!isHost) {
      showNotification(lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room yang dapat mengubah konfigurasi', 'warning', 3000);
      return;
    }
    setGameState((prev) => (prev ? { ...prev, gameMode: mode } : prev));
    socket?.emit('set-game-mode', { roomId, mode });
  };

  const handleSetRoundMode = ({ roundMode, targetRounds, targetScore }) => {
    if (!isHost) {
      showNotification(lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room yang dapat mengubah konfigurasi', 'warning', 3000);
      return;
    }
    setGameState((prev) =>
      prev
        ? {
            ...prev,
            roundMode: roundMode ?? prev.roundMode,
            targetRounds: targetRounds ?? prev.targetRounds,
            targetScore: targetScore ?? prev.targetScore,
          }
        : prev
    );
    socket?.emit('set-round-mode', { roomId, roundMode, targetRounds, targetScore });
  };

  const handleToggleReady = () => {
    const currentReady = readyStates[myPlayerId] ?? false;
    socket?.emit('player-ready', { ready: !currentReady });
  };

  const handleInitialPeek = (cardIndex) => {
    if (gamePhase !== 'peek') return;
    if (activePeek) return; // Tunggu timer 10 detik kartu saat ini selesai sebelum mengintip kartu berikutnya!
    if (myPlayer?.seenPositions?.includes(cardIndex)) {
      showNotification(notifyTexts.alreadyPeeked, 'warning', 2500);
      return;
    }
    if ((myPlayer?.peekRemaining ?? 2) <= 0) {
      showNotification(notifyTexts.maxPeeksReached, 'info', 2500);
      return;
    }
    socket?.emit('peek-initial-card', { cardIndex });
  };

  const handleCloseActivePeek = () => {
    setActivePeek(null);
  };

  const handleCloseActiveSpy = () => {
    setActiveSpy(null);
  };

  const handleSkipInitialPeekPhase = () => {
    setActivePeek(null);
    socket?.emit('skip-initial-peek');
  };

  const handleSetDeckEdition = (edition) => {
    if (!isHost) {
      showNotification(lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room yang dapat mengubah konfigurasi', 'warning', 3000);
      return;
    }
    setGameState((prev) => (prev ? { ...prev, deckEdition: edition } : prev));
    socket?.emit('set-deck-edition', { roomId, edition });
  };

  const handleSetPeekDuration = (type, duration) => {
    if (!isHost) {
      showNotification(lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room yang dapat mengubah konfigurasi', 'warning', 3000);
      return;
    }
    setGameState((prev) =>
      prev
        ? {
            ...prev,
            [type === 'initial' ? 'initialPeekDuration' : 'abilityPeekDuration']: duration,
          }
        : prev
    );
    socket?.emit('set-peek-duration', { roomId, type, duration });
  };

  const handleSetTurnOrderMode = (mode) => {
    if (!isHost) {
      showNotification(lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room yang dapat mengubah konfigurasi', 'warning', 3000);
      return;
    }
    setGameState((prev) => (prev ? { ...prev, turnOrderMode: mode } : prev));
    socket?.emit('set-turn-order-mode', { roomId, mode });
  };

  const handleOpenCustomOrderModal = () => {
    const players = gameState?.players || [];
    setCustomOrderList([...players]);
    setShowCustomOrderModal(true);
  };

  const handleMoveCustomOrder = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= customOrderList.length) return;
    const reordered = [...customOrderList];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setCustomOrderList(reordered);
  };

  const handleSaveCustomOrder = () => {
    if (!isHost) return;
    const playerOrder = customOrderList.map((p) => p.id);
    socket?.emit('set-turn-order-mode', { roomId, mode: 'custom', playerOrder });
    setShowCustomOrderModal(false);
    showNotification('Urutan giliran kustom berhasil disimpan!', 'success', 2500);
  };

  const handleDrawFromDeck = () => {
    if (!isMyTurn || gamePhase !== 'playing' || drawnCard) return;
    socket.emit('draw-from-deck');
  };

  const handleDrawFromDiscard = () => {
    if (!isMyTurn || gamePhase !== 'playing' || drawnCard || !gameState?.discardTop) return;
    socket.emit('draw-from-discard');
  };

  const handleCallCabo = () => {
    if (!isMyTurn || gamePhase !== 'playing' || caboCalledBy || drawnCard) return;
    setShowCaboConfirmModal(true);
  };

  const handleSwapWithHand = (handIndex) => {
    if (!drawnCard) return;

    // The player now knows what is in handIndex because they placed drawnCard there
    setKnownCards((prev) => ({
      ...prev,
      [handIndex]: drawnCard,
    }));

    if (drawnCardSource === 'discard') {
      // Optimistically keep card face up immediately in hand!
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((p) =>
            p.id === myPlayerId
              ? {
                  ...p,
                  faceUpCards: {
                    ...(p.faceUpCards || {}),
                    [handIndex]: drawnCard,
                    [String(handIndex)]: drawnCard,
                  },
                }
              : p
          ),
        };
      });
    } else {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((p) => {
            if (p.id !== myPlayerId) return p;
            const updated = { ...(p.faceUpCards || {}) };
            delete updated[handIndex];
            delete updated[String(handIndex)];
            return { ...p, faceUpCards: updated };
          }),
        };
      });
    }

    socket.emit('swap-with-hand', { handIndex });
    setDrawnCard(null);
    setDrawnCardSource(null);
    setSelectedHandIndex(null);
  };

  const handleDiscardDrawn = () => {
    if (!drawnCard) return;
    socket.emit('discard-card');
    setDrawnCard(null);
    setDrawnCardSource(null);
    setSelectedHandIndex(null);
    setAbilityPhase(null);
  };

  const handleTriggerAbility = () => {
    if (!drawnCard || drawnCardSource !== 'deck' || !drawnCard.ability) return;
    socket.emit('use-ability');
  };

  // Peek ability execution on own card
  const handleExecutePeekAbility = (cardIndex) => {
    socket.emit('peek-card', { cardIndex });
    setAbilityPhase(null);
  };

  // Spy ability execution on target opponent card
  const handleExecuteSpyAbility = (targetPlayerId, cardIndex) => {
    socket.emit('spy-card', { targetPlayerId, cardIndex });
    setAbilityPhase(null);
  };

  // Swap ability on own card first
  const handleSelectOwnCardForSwap = (index) => {
    setSwapMyIndex(index);
    showNotification(notifyTexts.cardSelectedForSwap(index), 'info', 4000);
  };

  // Swap ability on opponent card second
  const handleCompleteSwapWithOpponent = (targetPlayerId, targetCardIndex) => {
    if (swapMyIndex === null) return;
    socket.emit('swap-cards', {
      targetPlayerId,
      myCardIndex: swapMyIndex,
      targetCardIndex,
    });
    setSwapMyIndex(null);
    setAbilityPhase(null);
  };

  const handleRestartGame = () => {
    socket.emit('restart-game');
  };

  // ── Connection Loading Screen ──────────────────────────────────────────────
  if (!connected) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${
        isInverted ? 'bg-[#f8fafc] text-[#1e293b]' : 'bg-[#1a1a1a] text-white'
      }`}>
        <div className={`border rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center ${
          isInverted ? 'bg-white border-[#cbd5e1]' : 'bg-[#242424] border-[#545454]'
        }`}>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#a465b5] mx-auto mb-4" />
          <h2 className="text-xl font-bold">{connTexts.connecting}</h2>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${
        isInverted ? 'bg-[#f8fafc] text-[#1e293b]' : 'bg-[#1a1a1a] text-white'
      }`}>
        <div className={`border rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center ${
          isInverted ? 'bg-white border-[#cbd5e1]' : 'bg-[#242424] border-[#545454]'
        }`}>
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#a465b5] mx-auto mb-4" />
          <h2 className="text-xl font-bold">{connTexts.enteringRoom(roomId)}</h2>
          <p className="text-sm text-[#8b949e] mt-2">{connTexts.syncingProfile}</p>
        </div>
      </div>
    );
  }

  // ── LOBBY / WAITING SCREEN (2 to 8 Players) ─────────────────────────────────
  if (gamePhase === 'waiting') {
    const playerCount = gameState.players?.length || 0;
    const canStart = playerCount >= 2;
    const isMeReady = readyStates[myPlayerId] ?? false;

    return (
      <div className={`min-h-[100dvh] flex flex-col justify-center items-center p-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] relative ${
        isInverted
          ? 'bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-[#1e293b]'
          : 'bg-gradient-to-br from-[#1a1a1a] via-[#262626] to-[#1c1c1c] text-[#c8d1d9]'
      }`}>
        {/* Language & Theme Switch Buttons */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <ThemeSwitchButton />
          <LanguageSwitchButton />
        </div>

        <div className={`backdrop-blur-md border rounded-3xl shadow-2xl max-w-lg w-full p-5 sm:p-7 ${
          isInverted
            ? 'bg-white/95 border-[#cbd5e1] text-[#1e293b]'
            : 'bg-[#242424]/90 border-[#545454]/60 text-[#c8d1d9]'
        }`}>
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-[#a465b5]/20 border border-[#a465b5]/40 mb-2">
              <Gamepad2 className="w-8 h-8 text-[#a465b5]" />
            </div>
            <h1 className={`text-3xl font-black tracking-tight mt-1 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
              CABO <span className="text-[#a465b5] font-black text-lg">ONLINE</span>
            </h1>
            <p className="text-xs text-[#8b949e] uppercase tracking-widest mt-1">{lobbyTexts.title}</p>
          </div>

          {/* Room Code Card */}
          <div className={`border rounded-2xl p-4 mb-5 flex items-center justify-between ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div>
              <p className="text-[11px] font-bold text-[#8b949e] uppercase tracking-wider">{lobbyTexts.roomCodeLabel}</p>
              <p className="text-2xl font-mono font-black text-[#a465b5] tracking-wider">{roomId}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopyRoomInfo('code')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 border ${
                  isInverted
                    ? 'bg-white hover:bg-slate-100 text-[#1e293b] border-[#cbd5e1]'
                    : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
                }`}
                title={lobbyTexts.copyCodeBtn}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{lobbyTexts.copyCodeBtn}</span>
              </button>
              <button
                onClick={() => handleCopyRoomInfo('link')}
                className="px-3 py-1.5 text-xs font-semibold bg-[#a465b5]/20 hover:bg-[#a465b5]/30 text-[#a465b5] border border-[#a465b5]/40 rounded-lg transition inline-flex items-center gap-1.5"
                title={lobbyTexts.shareLinkBtn}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{lobbyTexts.shareLinkBtn}</span>
              </button>
            </div>
          </div>

          {/* Players in Room (Max 8) */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2.5">
              <h2 className={`text-sm font-bold ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.playersInRoom} ({playerCount}/8)
              </h2>
              <span className="text-xs text-[#8b949e]">
                {playerCount < 2 ? lobbyTexts.needMinPlayers : lobbyTexts.readyToStart}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {gameState.players?.map((p, idx) => {
                const isMe = p.id === myPlayerId;
                const isReady = readyStates[p.id] ?? false;
                const isThisHost = gameState.hostId ? p.id === gameState.hostId : idx === 0;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                      isMe
                        ? 'bg-[#a465b5]/15 border-[#a465b5]/60'
                        : isInverted
                        ? 'bg-[#f8fafc] border-[#cbd5e1]'
                        : 'bg-[#1c1c1c] border-[#545454]/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 rounded-full bg-[#a465b5]/20 border border-[#a465b5]/50 flex items-center justify-center text-xs font-bold text-[#a465b5] shrink-0">
                        {idx + 1}
                      </div>
                      <div className="truncate flex items-center gap-1.5">
                        <span className={`text-xs font-medium truncate block ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                          {p.name}
                        </span>
                        {isMe && <span className="text-xs text-[#a465b5] font-bold shrink-0">{lobbyTexts.youTag}</span>}
                        {isThisHost && (
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded shrink-0">
                            {lobbyTexts.hostTag || 'Host'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {isReady ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#a465b5]/20 text-[#a465b5] border border-[#a465b5]/40 font-semibold inline-flex items-center gap-1">
                          <Check className="w-3 h-3 text-[#a465b5]" />
                          <span>{lobbyTexts.readyStatus}</span>
                        </span>
                      ) : (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          isInverted ? 'bg-white text-[#94a3b8] border-[#cbd5e1]' : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454]'
                        }`}>
                          {lobbyTexts.waitingStatus}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host Only notice if not host */}
          {!isHost && (
            <div className="mb-4 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{lobbyTexts.hostOnlyConfig || 'Hanya Pemilik Room (Host) yang dapat mengubah konfigurasi.'}</span>
            </div>
          )}

          {/* Game Mode Selector in Lobby */}
          <div className={`mb-4 border rounded-2xl p-3 ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.gameModeLabel}
              </span>
              <span className="text-[11px] text-[#a465b5] font-semibold inline-flex items-center gap-1">
                <Layers className="w-3 h-3" />
                <span>{gameState.players?.length >= 5 ? lobbyTexts.pool70 : lobbyTexts.pool52}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetGameMode('classic')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center inline-flex items-center justify-center gap-1.5 ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  (gameState.gameMode || 'classic') === 'classic'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-md shadow-[#a465b5]/30'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-white" />
                <span>{lobbyTexts.classicModeTitle}</span>
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetGameMode('endless')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center inline-flex items-center justify-center gap-1.5 ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  gameState.gameMode === 'endless'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-md shadow-[#a465b5]/30'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-white" />
                <span>{lobbyTexts.endlessModeTitle}</span>
              </button>
            </div>
            <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
              {(gameState.gameMode || 'classic') === 'classic'
                ? lobbyTexts.classicModeDesc
                : lobbyTexts.endlessModeDesc}
            </p>
          </div>

          {/* Deck Edition Selector (1st 52 / 2nd 70 / Auto) */}
          <div className={`mb-4 border rounded-2xl p-3 ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.deckEditionLabel}
              </span>
              <span className="text-[11px] text-[#a465b5] font-semibold">
                {(gameState.deckEdition || 'auto') === 'auto'
                  ? ((gameState.players?.length || 0) >= 6 ? '2nd Ed. (70)' : '1st Ed. (52)')
                  : (gameState.deckEdition === 'first' ? '1st Ed. (52)' : '2nd Ed. (70)')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetDeckEdition('auto')}
                className={`py-2 px-1.5 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold border transition text-center ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  (gameState.deckEdition || 'auto') === 'auto'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-sm'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetDeckEdition('first')}
                className={`py-2 px-1.5 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold border transition text-center ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  gameState.deckEdition === 'first'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-sm'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                1st (52)
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetDeckEdition('second')}
                className={`py-2 px-1.5 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold border transition text-center ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  gameState.deckEdition === 'second'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-sm'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                2nd (70)
              </button>
            </div>
            <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
              {lobbyTexts.deckEditionDesc}
            </p>
          </div>

          {/* Round Mode Configuration (Fixed Rounds vs Target Score) */}
          <div className={`mb-4 border rounded-2xl p-3 ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.roundModeConfigLabel || 'Format & Target Akhir Game'}
              </span>
              <span className="text-[11px] text-[#a465b5] font-semibold">
                {(gameState.roundMode || 'score') === 'score'
                  ? `${gameState.targetScore ?? 100} ${lobbyTexts.scoreUnit || 'Poin'}`
                  : `${gameState.targetRounds ?? 1} ${lobbyTexts.roundsUnit || 'Ronde'}`}
              </span>
            </div>

            {/* Toggle Format: Score (Default) vs Rounds */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetRoundMode({ roundMode: 'score', targetRounds: gameState.targetRounds ?? 1, targetScore: gameState.targetScore ?? 100 })}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  (gameState.roundMode || 'score') === 'score'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-sm'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                {lobbyTexts.modeScoreTitle || 'Akumulasi Poin'} (Def)
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetRoundMode({ roundMode: 'rounds', targetRounds: gameState.targetRounds ?? 1, targetScore: gameState.targetScore ?? 100 })}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  gameState.roundMode === 'rounds'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-sm'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                {lobbyTexts.modeRoundsTitle || 'Jumlah Ronde'}
              </button>
            </div>

            {/* Selector Options depending on mode */}
            {(gameState.roundMode || 'score') === 'score' ? (
              <div>
                <p className="text-[11px] text-[#8b949e] mb-1 font-semibold">
                  {lobbyTexts.targetScoreLabel || 'Target Skor Eliminasi (50 - 500):'}
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {[50, 100, 150, 200, 300, 500].map((sVal) => (
                    <button
                      key={`s-${sVal}`}
                      type="button"
                      disabled={!isHost}
                      onClick={() => handleSetRoundMode({ roundMode: 'score', targetRounds: gameState.targetRounds ?? 1, targetScore: sVal })}
                      className={`py-1 text-[11px] font-bold rounded-lg border transition ${
                        !isHost ? 'opacity-60 cursor-not-allowed' : ''
                      } ${
                        (gameState.targetScore ?? 100) === sVal
                          ? 'bg-[#a465b5] text-white border-[#bd82ce]'
                          : isInverted
                          ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:bg-slate-100'
                          : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:bg-[#383838]'
                      }`}
                    >
                      {sVal} {sVal === 100 ? '(Def)' : ''}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
                  {lobbyTexts.targetScoreDesc || 'Game berakhir saat ada pemain mencapai target poin (default akumulasi 100 poin). Skor terendah menang.'}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-[#8b949e] mb-1 font-semibold">
                  {lobbyTexts.targetRoundsLabel || 'Pilih Jumlah Ronde (1 - 5):'}
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((rCount) => (
                    <button
                      key={`r-${rCount}`}
                      type="button"
                      disabled={!isHost}
                      onClick={() => handleSetRoundMode({ roundMode: 'rounds', targetRounds: rCount, targetScore: gameState.targetScore ?? 100 })}
                      className={`py-1 text-xs font-bold rounded-lg border transition ${
                        !isHost ? 'opacity-60 cursor-not-allowed' : ''
                      } ${
                        (gameState.targetRounds ?? 1) === rCount
                          ? 'bg-[#a465b5] text-white border-[#bd82ce]'
                          : isInverted
                          ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:bg-slate-100'
                          : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:bg-[#383838]'
                      }`}
                    >
                      {rCount} {rCount === 1 ? '(Def)' : ''}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
                  {lobbyTexts.fixedRoundsDesc || 'Pemenang ditentukan skor terendah setelah semua ronde selesai. Batas eliminasi: 1000 poin.'}
                </p>
              </div>
            )}
          </div>

          {/* Timer Configuration (Initial Peek & Ability Peek) */}
          <div className={`mb-5 border rounded-2xl p-3 ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Clock className="w-3.5 h-3.5 text-[#a465b5]" />
              <span className={`text-xs font-bold uppercase tracking-wider ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.timerConfigLabel}
              </span>
            </div>
            <div className="space-y-2.5">
              {/* Initial Peek Timer */}
              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-[#8b949e] font-semibold">{lobbyTexts.initialPeekTimeLabel}</span>
                  <span className="font-mono font-bold text-[#a465b5]">{gameState.initialPeekDuration ?? 10}s</span>
                </div>
                <div className="flex gap-1.5">
                  {[5, 8, 10, 15].map((sec) => (
                    <button
                      key={`init-${sec}`}
                      type="button"
                      disabled={!isHost}
                      onClick={() => handleSetPeekDuration('initial', sec)}
                      className={`flex-1 py-1 text-xs rounded-lg font-bold border transition ${
                        !isHost ? 'opacity-60 cursor-not-allowed' : ''
                      } ${
                        (gameState.initialPeekDuration ?? 10) === sec
                          ? 'bg-[#a465b5] text-white border-[#bd82ce]'
                          : isInverted
                          ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:bg-slate-100'
                          : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:bg-[#383838]'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Ability Peek Timer */}
              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-[#8b949e] font-semibold">{lobbyTexts.abilityPeekTimeLabel}</span>
                  <span className="font-mono font-bold text-[#a465b5]">{gameState.abilityPeekDuration ?? 5}s</span>
                </div>
                <div className="flex gap-1.5">
                  {[3, 5, 8, 10].map((sec) => (
                    <button
                      key={`ability-${sec}`}
                      type="button"
                      disabled={!isHost}
                      onClick={() => handleSetPeekDuration('ability', sec)}
                      className={`flex-1 py-1 text-xs rounded-lg font-bold border transition ${
                        !isHost ? 'opacity-60 cursor-not-allowed' : ''
                      } ${
                        (gameState.abilityPeekDuration ?? 5) === sec
                          ? 'bg-[#a465b5] text-white border-[#bd82ce]'
                          : isInverted
                          ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:bg-slate-100'
                          : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:bg-[#383838]'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Turn Order Configuration (Randomizer vs Custom) */}
          <div className={`mb-5 border rounded-2xl p-3 ${
            isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/70'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}`}>
                {lobbyTexts.turnOrderLabel || 'Urutan Mulai & Giliran'}
              </span>
              <span className="text-[11px] text-[#a465b5] font-semibold">
                {(gameState.turnOrderMode || 'random') === 'custom'
                  ? (lobbyTexts.turnOrderCustomTitle || 'Kustom')
                  : (lobbyTexts.turnOrderRandomTitle || 'Randomizer')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handleSetTurnOrderMode('random')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center inline-flex items-center justify-center gap-1.5 ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  (gameState.turnOrderMode || 'random') === 'random'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-md shadow-[#a465b5]/30'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span>{lobbyTexts.turnOrderRandomTitle || 'Randomizer (Def)'}</span>
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => {
                  handleSetTurnOrderMode('custom');
                  handleOpenCustomOrderModal();
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center inline-flex items-center justify-center gap-1.5 ${
                  !isHost ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  gameState.turnOrderMode === 'custom'
                    ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-md shadow-[#a465b5]/30'
                    : isInverted
                    ? 'bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#1e293b]'
                    : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454] hover:text-[#c8d1d9]'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-white" />
                <span>{lobbyTexts.turnOrderCustomTitle || 'Kustom Urutan'}</span>
              </button>
            </div>

            {gameState.turnOrderMode === 'custom' && (
              <div className="flex justify-center mt-2">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={handleOpenCustomOrderModal}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition inline-flex items-center gap-1.5 ${
                    !isHost
                      ? 'opacity-60 cursor-not-allowed bg-[#2e2e2e] text-[#8b949e] border-[#545454]'
                      : 'bg-[#a465b5]/20 hover:bg-[#a465b5] text-[#a465b5] hover:text-white border border-[#a465b5]/40'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{lobbyTexts.editCustomOrderBtn || 'Atur Urutan Pemain'}</span>
                </button>
              </div>
            )}

            <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
              {gameState.turnOrderMode === 'custom'
                ? (lobbyTexts.turnOrderCustomDesc || 'Atur urutan giliran pemain secara spesifik dari atas ke bawah.')
                : (lobbyTexts.turnOrderRandomDesc || 'Pemain pertama dipilih secara acak dengan animasi saat game dimulai.')}
            </p>
          </div>

          {/* Ready Button */}
          <div className="space-y-3">
            <button
              onClick={handleToggleReady}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2 ${
                isMeReady
                  ? 'bg-[#ff5757] hover:bg-[#e03e3e] text-white shadow-[#ff5757]/30'
                  : 'bg-[#a465b5] hover:bg-[#8c4b9d] text-white shadow-[#a465b5]/30'
              }`}
            >
              {isMeReady ? lobbyTexts.cancelReadyBtn : lobbyTexts.readyToPlayBtn}
            </button>

            <div className="flex justify-between items-center pt-2 text-xs text-[#8b949e]">
              <button
                onClick={() => setShowRulesModal(true)}
                className="hover:text-[#a465b5] underline transition inline-flex items-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{lobbyTexts.rulesGuideBtn}</span>
              </button>
              <button
                onClick={() => router.push('/')}
                className="hover:text-[#ff5757] transition"
              >
                {lobbyTexts.leaveRoomBtn}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Helper to render a single Opponent's Hand Box ─────────────────────────
  const renderOpponentBox = (opp) => {
    if (!opp) return null;
    const isOppTurn = gameState.currentPlayerId === opp.id;
    const revealedOppHand = revealHands ? revealHands[opp.id] : null;

    return (
      <div
        key={opp.id}
        className={`border rounded-2xl p-2 sm:p-2.5 transition-all shadow-md shrink-0 ${
          isOppTurn
            ? 'border-[#a465b5] ring-2 ring-[#a465b5]/30 ' + (isInverted ? 'bg-purple-50/50' : 'bg-[#2b2b2b]')
            : isInverted
            ? 'bg-white border-[#cbd5e1]'
            : 'bg-[#242424]/90 border-[#545454]/60'
        }`}
      >
        {/* Opponent Profile Header */}
        <div className="flex items-center justify-between gap-2.5 mb-1.5 px-1">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              opp.isOffline
                ? 'bg-red-500'
                : opp.isAfk
                ? 'bg-amber-400 animate-pulse'
                : isOppTurn
                ? 'bg-[#a465b5] animate-pulse'
                : 'bg-[#545454]'
            }`} />
            <span className={`text-xs font-bold truncate max-w-[80px] sm:max-w-[100px] ${
              isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'
            }`}>
              {opp.name}
            </span>
            {(opp.isOffline || opp.isAfk) && (
              <span className={`text-[8px] sm:text-[9px] px-1 py-0.2 rounded font-mono font-bold uppercase shrink-0 ${
                opp.isOffline
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {opp.isOffline ? 'OFFLINE' : 'AFK'}
              </span>
            )}
          </div>
          <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
            isInverted ? 'bg-slate-100 text-[#64748b] border-[#cbd5e1]' : 'bg-[#1c1c1c] text-[#8b949e] border-[#545454]'
          }`}>
            {opp.score ?? 0} pts
          </span>
        </div>

        {/* Opponent Cards */}
        <div className="flex gap-1.5 justify-center">
          {Array.from({ length: opp.handSize || 4 }).map((_, cIdx) => {
            const revealedCard = revealedOppHand ? revealedOppHand[cIdx] : null;
            const oppFaceUpCard = opp.faceUpCards?.[cIdx] || null;
            const isCardFaceUp = Boolean(revealedCard || oppFaceUpCard);
            const cardData = revealedCard || oppFaceUpCard;

            const isSpyTarget = abilityPhase === 'spy' && isMyTurn;
            const isSwapTarget = abilityPhase === 'swap' && swapMyIndex !== null && isMyTurn;
            const isClickable = isSpyTarget || isSwapTarget;

            const handleCardClick = () => {
              if (isSpyTarget) {
                handleExecuteSpyAbility(opp.id, cIdx);
              } else if (isSwapTarget) {
                handleCompleteSwapWithOpponent(opp.id, cIdx);
              }
            };

            return (
              <Card
                key={`${opp.id}-${cIdx}`}
                card={cardData}
                isFaceUp={isCardFaceUp}
                size="compact"
                selectable={isClickable}
                badgeText={isClickable ? (isSpyTarget ? handTexts.badgeSpy : handTexts.badgeSwap) : oppFaceUpCard ? handTexts.badgeOpen : null}
                onClick={isClickable ? handleCardClick : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // ── MAIN GAMEPLAY BOARD (Active Round) ──────────────────────────────────────
  const caboRemainingNotice = caboCalledBy
    ? headerTexts.caboAlert(caboCalledBy, turnsRemaining)
    : null;

  return (
    <div className={`h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden selection:bg-[#a465b5] selection:text-white ${
      isInverted
        ? 'bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-[#1e293b]'
        : 'bg-gradient-to-br from-[#1a1a1a] via-[#242424] to-[#1c1c1c] text-[#c8d1d9]'
    }`}>

      {/* ── TOP NAV / HEADER ── */}
      <header className={`px-4 py-2.5 backdrop-blur-md sticky top-0 z-30 border-b shrink-0 ${
        isInverted
          ? 'bg-white/90 border-[#cbd5e1]'
          : 'bg-[#242424]/90 border-[#545454]/60'
      }`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className={`font-black text-lg tracking-tight flex items-center gap-1.5 ${
              isInverted ? 'text-[#1e293b]' : 'text-white'
            }`}>
              <Gamepad2 className="w-5 h-5 text-[#a465b5]" />
              <span>CABO</span>
            </h1>
            <div className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-mono border ${
              isInverted ? 'bg-slate-100 border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]'
            }`}>
              <span className="text-[#8b949e]">{headerTexts.roomLabel}</span>
              <span className="text-[#a465b5] font-black">{roomId}</span>
              <button
                onClick={() => handleCopyRoomInfo('code')}
                className="ml-1 text-[#8b949e] hover:text-[#a465b5]"
                title={headerTexts.copyCodeTitle}
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Turn / Cabo Alert Banner in Nav */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Match Format / Round Indicator */}
            <span className="text-xs bg-[#a465b5]/20 border border-[#a465b5]/40 font-bold px-2.5 py-1 rounded-full hidden sm:inline-flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#a465b5]" />
              <span className={isInverted ? 'text-[#1e293b]' : 'text-[#c8d1d9]'}>
                {(gameState.roundMode || 'score') === 'rounds'
                  ? `Rnd ${gameState.currentRound || 1}/${gameState.targetRounds || 1}`
                  : `Rnd ${gameState.currentRound || 1} (Target: ${gameState.targetScore || 100}p)`}
              </span>
            </span>

            <span className="text-xs bg-[#a465b5]/20 border border-[#a465b5]/40 font-bold px-2.5 py-1 rounded-full hidden sm:inline-flex items-center gap-1">
              {gameState.gameMode === 'endless' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-[#a465b5]" />
                  <span>{headerTexts.endlessMode}</span>
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 text-[#ff5757]" />
                  <span>{headerTexts.classicMode}</span>
                </>
              )}
            </span>

            {caboRemainingNotice && (
              <span className="text-xs bg-[#ff5757]/20 text-[#ff5757] border border-[#ff5757]/40 font-bold px-3 py-1 rounded-full animate-pulse inline-flex items-center gap-1">
                <Megaphone className="w-3 h-3" />
                <span>{caboRemainingNotice}</span>
              </span>
            )}

            <div
              className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                isMyTurn
                  ? 'bg-[#a465b5] text-white border-[#bd82ce] shadow-md shadow-[#a465b5]/40'
                  : isInverted
                  ? 'bg-slate-100 text-[#64748b] border-[#cbd5e1]'
                  : 'bg-[#2e2e2e] text-[#8b949e] border-[#545454]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-white animate-ping' : 'bg-[#545454]'}`} />
              {isMyTurn ? headerTexts.yourTurn : headerTexts.playerTurn(gameState.currentPlayerName)}
            </div>

            {/* Theme & Language Switch Buttons */}
            <ThemeSwitchButton />
            <LanguageSwitchButton />

            <button
              onClick={() => setShowRulesModal(true)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition inline-flex items-center gap-1 ${
                isInverted
                  ? 'bg-slate-100 hover:bg-slate-200 text-[#1e293b] border-[#cbd5e1]'
                  : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
              }`}
              title={headerTexts.rulesBtn}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{headerTexts.rulesBtn}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN TABLE AREA ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-2 sm:p-4 flex flex-col justify-between gap-3 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">

        {/* ── 1. OPPONENTS AREA (Carousel on Mobile, Wrap on Desktop) ── */}
        <section aria-label="Opponents" className="w-full">
          {/* Mobile Carousel View (md:hidden) */}
          <div className="block md:hidden w-full">
            {otherPlayers.length > 1 ? (
              <div className="flex flex-col items-center">
                {/* Carousel Controls Header */}
                <div className="flex items-center justify-between w-full max-w-sm px-2 mb-1.5 text-xs text-[#8b949e]">
                  <button
                    onClick={() => setActiveOpponentIndex((prev) => (prev > 0 ? prev - 1 : otherPlayers.length - 1))}
                    className={`p-1.5 rounded-lg border transition ${
                      isInverted
                        ? 'bg-white border-[#cbd5e1] text-[#1e293b] hover:bg-slate-100'
                        : 'bg-[#242424] border-[#545454] text-[#c8d1d9] hover:bg-[#323232]'
                    }`}
                    aria-label={tableTexts.prevOpponent || 'Sebelumnya'}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[11px] text-[#a465b5]">
                      {tableTexts.opponentsCarouselTitle || 'Deck Lawan'} ({activeOpponentIndex + 1}/{otherPlayers.length})
                    </span>
                    <div className="flex gap-1">
                      {otherPlayers.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          onClick={() => setActiveOpponentIndex(dotIdx)}
                          className={`h-1.5 rounded-full transition-all ${
                            dotIdx === activeOpponentIndex ? 'w-3.5 bg-[#a465b5]' : 'w-1.5 bg-[#545454]/60'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveOpponentIndex((prev) => (prev < otherPlayers.length - 1 ? prev + 1 : 0))}
                    className={`p-1.5 rounded-lg border transition ${
                      isInverted
                        ? 'bg-white border-[#cbd5e1] text-[#1e293b] hover:bg-slate-100'
                        : 'bg-[#242424] border-[#545454] text-[#c8d1d9] hover:bg-[#323232]'
                    }`}
                    aria-label={tableTexts.nextOpponent || 'Berikutnya'}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Active Opponent Deck */}
                <div className="flex justify-center w-full">
                  {otherPlayers[activeOpponentIndex] && renderOpponentBox(otherPlayers[activeOpponentIndex])}
                </div>
              </div>
            ) : (
              otherPlayers[0] && (
                <div className="flex justify-center">
                  {renderOpponentBox(otherPlayers[0])}
                </div>
              )
            )}
          </div>

          {/* Desktop Multi-Deck View (hidden md:flex) */}
          <div className="hidden md:flex md:flex-wrap md:justify-center md:gap-3">
            {otherPlayers.map((opp) => renderOpponentBox(opp))}
          </div>
        </section>

        {/* ── 2. CENTER TABLE: PILES & STATUS ── */}
        <section className={`border rounded-3xl p-3 sm:p-5 backdrop-blur-sm shadow-xl flex flex-col items-center justify-center relative min-h-[190px] ${
          isInverted
            ? 'bg-white/80 border-[#cbd5e1]'
            : 'bg-[#242424]/60 border-[#545454]/60'
        }`}>

          {/* Phase Banner / Helper */}
          {gamePhase === 'peek' && (
            <div className={`mb-3 border rounded-xl px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-center text-xs ${
              isInverted
                ? 'bg-[#a465b5]/15 border-[#a465b5]/40 text-[#1e293b]'
                : 'bg-[#a465b5]/20 border-[#a465b5]/40 text-[#c8d1d9]'
            }`}>
              <div>
                <span className="font-bold text-[#a465b5]">{tableTexts.initialPeekBanner}</span>
                {myPlayer && (
                  <span className={`ml-1 font-semibold ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                    {tableTexts.peeksRemaining(myPlayer.peekRemaining ?? 2)}
                  </span>
                )}
              </div>
              <button
                onClick={handleSkipInitialPeekPhase}
                className="px-2.5 py-1 bg-[#ff5757]/15 hover:bg-[#ff5757] text-[#ff5757] hover:text-white border border-[#ff5757]/40 rounded-lg font-bold transition text-xs flex items-center gap-1 shadow-sm"
                title={lobbyTexts.skipInitialPeekDesc}
              >
                <X className="w-3.5 h-3.5" />
                <span>{lobbyTexts.skipInitialPeekBtn}</span>
              </button>
            </div>
          )}

          {/* Ability Instruction Bar */}
          {abilityPhase && isMyTurn && (
            <div className={`mb-3 border rounded-xl px-4 py-1.5 text-center text-xs animate-pulse flex items-center justify-center gap-1.5 ${
              isInverted
                ? 'bg-[#a465b5]/15 border-[#a465b5]/40 text-[#1e293b]'
                : 'bg-[#a465b5]/20 border-[#a465b5]/40 text-[#c8d1d9]'
            }`}>
              {abilityPhase === 'peek' && (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#a465b5]" />
                  <span>{tableTexts.peekAbilityHint}</span>
                </>
              )}
              {abilityPhase === 'spy' && (
                <>
                  <Search className="w-3.5 h-3.5 text-[#ff5757]" />
                  <span>{tableTexts.spyAbilityHint}</span>
                </>
              )}
              {abilityPhase === 'swap' && (
                swapMyIndex === null ? (
                  <>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[#a465b5]" />
                    <span>{tableTexts.swapAbilityStep1}</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[#ff5757]" />
                    <span>{tableTexts.swapAbilityStep2}</span>
                  </>
                )
              )}
            </div>
          )}

          {/* Draw & Discard Piles */}
          <div className="flex items-center justify-center gap-6 sm:gap-12 my-1">

            {/* DRAW PILE */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[11px] font-bold text-[#8b949e] uppercase tracking-widest">
                  {tableTexts.drawPile}
                </p>
                <span className="text-[9px] font-semibold text-[#a465b5] bg-[#1c1c1c] border border-[#545454] px-1.5 py-0.2 rounded">
                  {gameState.poolType || (gameState.players?.length >= 5 ? '70 cards' : '52 cards')}
                </span>
              </div>
              <motion.button
                onClick={handleDrawFromDeck}
                disabled={!isMyTurn || gamePhase !== 'playing' || !!drawnCard}
                whileHover={isMyTurn && gamePhase === 'playing' && !drawnCard ? { y: -4, scale: 1.04 } : {}}
                whileTap={isMyTurn && gamePhase === 'playing' && !drawnCard ? { scale: 0.94 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`relative group rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isMyTurn && gamePhase === 'playing' && !drawnCard
                    ? 'hover:shadow-[#a465b5]/30 hover:shadow-xl ring-2 ring-[#a465b5] animate-pulse'
                    : ''
                }`}
              >
                <div className="w-16 sm:w-20 md:w-24 aspect-[2/3] rounded-xl bg-gradient-to-br from-[#a465b5] to-[#7d458d] border border-[#bd82ce]/50 shadow-lg flex flex-col items-center justify-center p-2 text-center">
                  <Layers className="w-6 h-6 text-[#c8d1d9] mb-1" />
                  <span className="text-xs font-mono font-bold text-white">
                    {gameState.drawPileCount ?? 0}
                  </span>
                  <span className="text-[9px] text-[#c8d1d9] uppercase tracking-wider font-semibold">{tableTexts.cardsCount}</span>
                </div>
              </motion.button>
            </div>

            {/* DISCARD PILE */}
            <div className="flex flex-col items-center">
              <p className="text-[11px] font-bold text-[#8b949e] uppercase tracking-widest mb-1.5">
                {tableTexts.discardPile}
              </p>
              <motion.button
                onClick={handleDrawFromDiscard}
                disabled={!isMyTurn || gamePhase !== 'playing' || !!drawnCard || !gameState.discardTop}
                whileHover={isMyTurn && gamePhase === 'playing' && !drawnCard && gameState.discardTop ? { y: -4, scale: 1.04 } : {}}
                whileTap={isMyTurn && gamePhase === 'playing' && !drawnCard && gameState.discardTop ? { scale: 0.94 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`relative group rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isMyTurn && gamePhase === 'playing' && !drawnCard && gameState.discardTop
                    ? 'hover:shadow-[#a465b5]/30 hover:shadow-xl ring-2 ring-[#a465b5]'
                    : ''
                }`}
              >
                <div className="relative w-16 sm:w-20 md:w-24 aspect-[2/3]">
                  <AnimatePresence mode="popLayout">
                    {gameState.discardTop ? (
                      <motion.div
                        key={`discard-${gameState.discardTop.value}-${gameState.discardTop.ability || 'none'}`}
                        initial={{ scale: 1.25, y: -25, rotate: -6, opacity: 0.7 }}
                        animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                        className="w-full h-full flex items-center justify-center"
                      >
                        <Card
                          card={gameState.discardTop}
                          isFaceUp={true}
                          size="normal"
                        />
                      </motion.div>
                    ) : (
                      <div className="w-full h-full rounded-xl bg-[#1c1c1c] border-2 border-dashed border-[#545454] flex items-center justify-center text-xs text-[#8b949e]">
                        {tableTexts.emptyPile}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            </div>

          </div>

          {/* MINIMALIST DRAWN CARD REVEAL (Only for Current Player) */}
          <AnimatePresence>
            {drawnCard && isMyTurn && (
              <motion.div
                initial={{ scale: 0.75, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.75, opacity: 0, y: 15 }}
                transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                className="my-2.5 flex flex-col items-center gap-1.5"
              >
                <div className="flex items-center gap-2.5 p-2 rounded-2xl border border-[#a465b5]/50 bg-[#a465b5]/10 shadow-lg">
                  <motion.div
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 180 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    <Card card={drawnCard} isFaceUp={true} size="normal" />
                  </motion.div>

                  {/* Minimalist Action Controls beside card */}
                  <div className="flex flex-col gap-1.5 min-w-[75px] sm:min-w-[95px]">
                    {drawnCard.ability && drawnCardSource === 'deck' && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={handleTriggerAbility}
                        className="py-1 px-2 text-[11px] font-bold bg-[#a465b5] hover:bg-[#8c4b9d] text-white rounded-lg shadow-sm transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{drawnCardTexts.minimalUseBtn || 'Pakai'} {drawnCard.ability.toUpperCase()}</span>
                      </motion.button>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setSelectedHandIndex('choosing')}
                      className={`py-1 px-2 text-[11px] font-bold rounded-lg border transition flex items-center justify-center gap-1 cursor-pointer ${
                        selectedHandIndex === 'choosing'
                          ? 'bg-[#a465b5] text-white ring-1 ring-[#bd82ce]'
                          : isInverted
                          ? 'bg-white hover:bg-slate-100 text-[#1e293b] border-[#cbd5e1]'
                          : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
                      }`}
                    >
                      <ArrowLeftRight className="w-3 h-3 text-[#a465b5]" />
                      <span>{drawnCardTexts.minimalSwapBtn || 'Ganti'}</span>
                    </motion.button>

                    {drawnCardSource === 'deck' && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={handleDiscardDrawn}
                        className={`py-1 px-2 text-[11px] font-bold rounded-lg border transition flex items-center justify-center gap-1 cursor-pointer ${
                          isInverted
                            ? 'bg-slate-100 hover:bg-[#ff5757]/15 text-[#64748b] hover:text-[#ff5757] border-[#cbd5e1]'
                            : 'bg-[#1c1c1c] hover:bg-[#ff5757]/15 text-[#8b949e] hover:text-[#ff5757] border-[#545454]'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{drawnCardTexts.minimalDiscardBtn || 'Buang'}</span>
                      </motion.button>
                    )}
                  </div>
                </div>

                <span className="text-[10px] sm:text-xs text-[#a465b5] font-semibold animate-pulse">
                  {drawnCardTexts.minimalSwapHint || 'Klik kartu di tangan untuk menukar'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Turn Actions: Call Cabo */}
          {isMyTurn && gamePhase === 'playing' && !drawnCard && !caboCalledBy && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-4"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={handleCallCabo}
                className="bg-gradient-to-r from-[#ff5757] via-[#e03e3e] to-[#ff5757] hover:from-[#ff7878] hover:to-[#ff5757] text-white font-extrabold text-sm py-2 px-6 rounded-xl shadow-lg shadow-[#ff5757]/30 transition inline-flex items-center gap-2"
              >
                <Megaphone className="w-4 h-4" />
                <span>{tableTexts.callCaboBtn}</span>
              </motion.button>
            </motion.div>
          )}

          {/* ── ROUND END CENTER OVERLAY (Deck Overlay with Summary, Ready Count & Button) ── */}
          <AnimatePresence>
            {gamePhase === 'roundEnd' && roundResults && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="absolute inset-0 bg-[#1c1c1c]/95 backdrop-blur-md rounded-3xl z-30 p-4 sm:p-5 flex flex-col justify-between shadow-2xl border-2 border-[#a465b5]/60 overflow-y-auto"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-[#545454]/60 pb-2.5 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-[#a465b5]/20 text-[#a465b5] border border-[#a465b5]/40">
                        <Flag className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                          <span>{roundTexts.title}</span>
                          {roundResults.endReason === 'draw-pile-empty' && (
                            <span className="text-[10px] text-[#a465b5] font-semibold bg-[#a465b5]/20 border border-[#a465b5]/40 px-1.5 py-0.5 rounded">
                              {roundTexts.drawPileEmpty}
                            </span>
                          )}
                        </h3>
                        {roundResults.caboCalledBy && (
                          <p className="text-[11px] text-[#c8d1d9]">
                            {roundTexts.calledBy(roundResults.caboCalledBy)}{' '}
                            {roundResults.caboCallerWon ? (
                              <span className="text-emerald-400 font-bold">{roundTexts.successZero}</span>
                            ) : roundResults.penaltyApplied ? (
                              <span className="text-[#ff5757] font-bold">{roundTexts.failedPenalty}</span>
                            ) : null}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ready Count Indicator */}
                    <div className="flex items-center gap-1.5 bg-[#242424] border border-[#545454] px-2.5 py-1 rounded-full text-xs">
                      <Users className="w-3.5 h-3.5 text-[#a465b5]" />
                      <span className="text-[#c8d1d9] font-bold">
                        {roundTexts.readyCount(Object.values(readyStates).filter(Boolean).length, gameState.players?.length || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Score Breakdown Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2 max-h-[140px] overflow-y-auto pr-1">
                    {gameState.players?.map((p) => {
                      const roundPts = roundResults.roundScores?.[p.id] ?? 0;
                      const totalPts = p.score ?? 0;
                      const isReady = readyStates[p.id] ?? false;
                      const isMe = p.id === myPlayerId;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                            isMe
                              ? 'bg-[#a465b5]/20 border-[#a465b5]/60 shadow-sm'
                              : 'bg-[#242424] border-[#545454]/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isReady ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-[#545454]'
                              }`}
                            />
                            <span className="font-bold text-[#c8d1d9] truncate max-w-[100px]">
                              {p.name} {isMe && lobbyTexts.youTag}
                            </span>
                            <span className="text-[10px] text-[#a465b5] font-semibold bg-[#a465b5]/20 px-1 rounded">
                              +{roundPts}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-white text-xs">{totalPts} pts</span>
                            {isReady ? (
                              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                                <Check className="w-3 h-3" />
                                <span>{roundTexts.readyStatus}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#8b949e] font-medium">{roundTexts.waitingStatus}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer: Hint & Ready Button */}
                <div className="pt-2.5 border-t border-[#545454]/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-[11px] text-[#8b949e] italic text-center sm:text-left">
                    {roundTexts.inspectAll}
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleToggleReady}
                    className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs transition shadow-lg flex items-center justify-center gap-2 ${
                      readyStates[myPlayerId]
                        ? 'bg-[#545454] hover:bg-[#686868] text-white'
                        : 'bg-[#a465b5] hover:bg-[#8c4b9d] text-white shadow-[#a465b5]/30 animate-pulse'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{readyStates[myPlayerId] ? roundTexts.cancelReadyBtn : roundTexts.readyNextBtn}</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </section>

        {/* ── 4. YOUR HAND AREA (Bottom of the Board) ── */}
        <section aria-label="Your Hand" className={`border rounded-2xl p-4 shadow-xl ${
          isInverted
            ? 'bg-white/95 border-[#cbd5e1] text-[#1e293b]'
            : 'bg-[#242424]/90 border-[#545454]/60 text-[#c8d1d9]'
        }`}>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-extrabold ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>{handTexts.yourHandTitle}</span>
              <span className="text-xs font-mono text-[#a465b5] bg-[#a465b5]/15 border border-[#a465b5]/40 px-2 py-0.5 rounded-full">
                {myPlayer?.score ?? 0} pts
              </span>
            </div>

            <div className="flex items-center gap-3">
              {gamePhase === 'peek' && (
                <span className="text-xs text-[#a465b5] font-bold bg-[#a465b5]/15 border border-[#a465b5]/40 px-2.5 py-0.5 rounded-full">
                  {handTexts.peeksLeft(myPlayer?.peekRemaining ?? 2)}
                </span>
              )}
            </div>
          </div>

          {/* 4 Cards in Hand - Fixed & Consistent Layout with Smooth Motion */}
          <div className="flex gap-2.5 sm:gap-4 justify-center items-center py-2">
            {Array.from({ length: 4 }).map((_, hIdx) => {
              const isPeekPhaseSelectable =
                gamePhase === 'peek' &&
                (myPlayer?.peekRemaining ?? 2) > 0 &&
                !myPlayer?.seenPositions?.includes(hIdx) &&
                !activePeek;
              // Langsung selectable untuk tukar saat memegang drawnCard (tanpa perlu konfirmasi tombol)
              const isHandSwapSelectable = drawnCard && isMyTurn;
              const isAbilityPeekSelectable = abilityPhase === 'peek' && isMyTurn && !activePeek;
              const isAbilitySwapSelectable = abilityPhase === 'swap' && swapMyIndex === null && isMyTurn;

              const isSelectable =
                isPeekPhaseSelectable ||
                isHandSwapSelectable ||
                isAbilityPeekSelectable ||
                isAbilitySwapSelectable;

              const isCardRevealedInSummary =
                revealHands && myPlayerId && revealHands[myPlayerId] ? revealHands[myPlayerId][hIdx] : null;

              // Kartu SEDANG diintip saat ini (fase initial peek / ability peek)?
              const isCurrentlyPeeking = activePeek && activePeek.cardIndex === hIdx;

              // Kartu dari Discard Pile yang HARUS TERBUKA TERUS di tangan!
              const discardFaceUpCard = myPlayer?.faceUpCards?.[hIdx] || myPlayer?.faceUpCards?.[String(hIdx)] || null;

              // Kartu terbuka jika:
              // 1. Sedang diintip (peek)
              // 2. Summary ronde akhir
              // 3. Kartu diambil dari Discard Pile (terbuka terus sampai diganti draw pile / hasil swap)
              const cardToRender = isCardRevealedInSummary || (isCurrentlyPeeking ? activePeek.card : null) || discardFaceUpCard;
              const isFaceUp = Boolean(isCardRevealedInSummary || isCurrentlyPeeking || discardFaceUpCard);

              const handleOwnCardClick = () => {
                if (isPeekPhaseSelectable) {
                  handleInitialPeek(hIdx);
                } else if (isHandSwapSelectable) {
                  handleSwapWithHand(hIdx);
                } else if (isAbilityPeekSelectable) {
                  handleExecutePeekAbility(hIdx);
                } else if (isAbilitySwapSelectable) {
                  handleSelectOwnCardForSwap(hIdx);
                }
              };

              return (
                <motion.div
                  key={`my-slot-${hIdx}`}
                  layout
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="relative flex flex-col items-center gap-1.5 shrink-0"
                >
                  {/* Floating Countdown Timer Badge Tepat di Atas Kartu yang Sedang Diintip */}
                  <AnimatePresence>
                    {isCurrentlyPeeking && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                        className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 bg-[#a465b5] text-white font-black text-xs px-2.5 py-0.5 rounded-full shadow-lg border border-[#bd82ce] flex items-center gap-1 animate-pulse"
                      >
                        <Clock className="w-3.5 h-3.5 animate-spin-slow" />
                        <span>{activePeek.secondsLeft}s</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={isCurrentlyPeeking ? 'ring-4 ring-[#a465b5] ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c1c] rounded-xl transition duration-300 shadow-xl shadow-[#a465b5]/30' : ''}>
                    <Card
                      key={`my-card-${hIdx}`}
                      card={cardToRender}
                      isFaceUp={isFaceUp}
                      isKnown={false}
                      size="normal"
                      selectable={isSelectable}
                      isSelected={swapMyIndex === hIdx}
                      badgeText={
                        isPeekPhaseSelectable
                          ? handTexts.badgePeek
                          : isHandSwapSelectable
                          ? handTexts.badgeSwap
                          : isAbilityPeekSelectable
                          ? handTexts.badgePeek
                          : isAbilitySwapSelectable
                          ? handTexts.badgeChoose
                          : discardFaceUpCard
                          ? handTexts.badgeOpen
                          : null
                      }
                      onClick={isSelectable ? handleOwnCardClick : undefined}
                    />
                  </div>

                  <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md border ${
                    isInverted
                      ? 'bg-slate-100 text-[#64748b] border-[#cbd5e1]'
                      : 'bg-[#1c1c1c] text-[#8b949e] border-[#545454]/60'
                  }`}>
                    {handTexts.slotLabel(hIdx)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </section>

      </main>

      {/* ── NOTIFICATION TOAST ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            className="fixed bottom-4 right-4 z-50 max-w-sm w-[90vw] sm:w-full"
          >
            <div
              className={`p-3.5 rounded-2xl shadow-2xl border text-sm font-semibold flex items-center justify-between ${
                notification.type === 'success'
                  ? isInverted ? 'bg-white text-[#1e293b] border-[#a465b5]' : 'bg-[#1c1c1c] text-[#c8d1d9] border-[#a465b5]'
                  : notification.type === 'error'
                  ? isInverted ? 'bg-white text-[#ff5757] border-[#ff5757]' : 'bg-[#1c1c1c] text-[#ff5757] border-[#ff5757]'
                  : notification.type === 'warning'
                  ? isInverted ? 'bg-white text-[#a465b5] border-[#a465b5]' : 'bg-[#1c1c1c] text-[#a465b5] border-[#a465b5]/60'
                  : isInverted ? 'bg-white text-[#1e293b] border-[#cbd5e1]' : 'bg-[#242424] text-[#c8d1d9] border-[#545454]'
              }`}
            >
              <span>{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
                className="ml-2 text-[#8b949e] hover:text-[#ff5757] p-1 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACTIVE INITIAL PEEK COUNTDOWN BANNER (Menutup Otomatis atau Skip) ── */}
      <AnimatePresence>
        {activePeek && (
          <motion.div
            initial={{ y: -60, x: '-50%', opacity: 0, scale: 0.85 }}
            animate={{ y: 0, x: '-50%', opacity: 1, scale: 1 }}
            exit={{ y: -60, x: '-50%', opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 450, damping: 24 }}
            className={`fixed top-5 left-1/2 z-50 border-2 border-[#a465b5] rounded-2xl p-4 shadow-2xl flex items-center gap-3 sm:gap-4 backdrop-blur-md max-w-sm sm:max-w-md w-[92vw] mx-auto ${
              isInverted ? 'bg-white/95 text-[#1e293b]' : 'bg-[#242424]/95 text-[#c8d1d9]'
            }`}
          >
            <div className="p-2.5 sm:p-3 rounded-2xl bg-[#a465b5]/20 text-[#a465b5] border border-[#a465b5]/40 shrink-0">
              <Clock className="w-6 h-6 sm:w-8 sm:h-8 animate-spin-slow" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-black text-[#a465b5] uppercase tracking-widest truncate">
                  {activePeek.isInitialPeek ? peekTexts.initialPeekTitle : peekTexts.abilityPeekTitle}
                </span>
                <span className="text-[11px] font-mono font-black text-[#a465b5] bg-[#a465b5]/15 border border-[#a465b5]/40 px-2 py-0.5 rounded-full shrink-0">
                  {handTexts.slotLabel(activePeek.cardIndex)}
                </span>
              </div>
              <p className={`text-xs sm:text-sm font-extrabold ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                {peekTexts.closesIn} <span className="text-[#a465b5] font-mono text-base font-black">{activePeek.secondsLeft} {peekTexts.seconds}</span>
              </p>
              {/* Countdown progress bar */}
              <div className={`w-full rounded-full h-1.5 mt-2 overflow-hidden border ${
                isInverted ? 'bg-slate-200 border-slate-300' : 'bg-[#1c1c1c] border-[#545454]'
              }`}>
                <div
                  className="bg-[#a465b5] h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, (activePeek.secondsLeft / activePeek.duration) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-10 h-10 rounded-full border-2 border-[#a465b5] flex items-center justify-center font-mono font-black text-[#a465b5] text-xs sm:text-sm bg-[#a465b5]/10">
                {activePeek.secondsLeft}s
              </div>
              <button
                onClick={handleCloseActivePeek}
                className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1 ${
                  isInverted
                    ? 'bg-slate-100 hover:bg-[#ff5757] text-[#1e293b] hover:text-white border-[#cbd5e1]'
                    : 'bg-[#2e2e2e] hover:bg-[#ff5757] text-[#c8d1d9] hover:text-white border-[#545454]'
                }`}
                title={lobbyTexts.skipPeekBtn}
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lobbyTexts.skipPeekBtn}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACTIVE SPY VIEW (Menutup Otomatis atau Skip) ── */}
      <AnimatePresence>
        {activeSpy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border-2 border-[#ff5757]/60 rounded-3xl p-6 w-[92vw] max-w-xs text-center shadow-2xl ${
                isInverted ? 'bg-white text-[#1e293b]' : 'bg-[#242424] text-white'
              }`}
            >
              <p className="text-xs uppercase font-extrabold tracking-widest text-[#ff5757] mb-1">
                {spyTexts.title}
              </p>
              <h3 className={`text-base font-black mb-2 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                {spyTexts.cardBelongingTo} {activeSpy.targetPlayerName}
              </h3>
              <div className="flex items-center justify-center gap-1.5 mb-3 bg-[#ff5757]/20 border border-[#ff5757]/40 py-1 px-3 rounded-full text-[#ff5757] font-mono text-xs font-bold w-fit mx-auto">
                <Clock className="w-3.5 h-3.5 animate-spin-slow" />
                <span>{spyTexts.closingIn(activeSpy.secondsLeft)}</span>
              </div>
              <div className="flex justify-center mb-4">
                <Card card={activeSpy.card} isFaceUp={true} size="large" />
              </div>
              <p className={`text-xs ${isInverted ? 'text-[#64748b]' : 'text-[#c8d1d9]'}`}>
                {spyTexts.cardDesc(activeSpy.cardIndex, activeSpy.card.value)}
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleCloseActiveSpy}
                className={`mt-4 w-full py-2.5 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-1.5 ${
                  isInverted
                    ? 'bg-slate-100 hover:bg-slate-200 text-[#1e293b] border-[#cbd5e1]'
                    : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
                }`}
              >
                <X className="w-3.5 h-3.5" />
                <span>{lobbyTexts.skipPeekBtn}</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CALL CABO CONFIRMATION MODAL ── */}
      <AnimatePresence>
        {showCaboConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border-2 border-[#ff5757]/60 rounded-3xl p-6 w-[92vw] max-w-sm shadow-2xl text-center ${
                isInverted ? 'bg-white text-[#1e293b]' : 'bg-[#242424] text-white'
              }`}
            >
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-[#ff5757]/20 border border-[#ff5757]/40 mb-3 text-[#ff5757]">
                <Megaphone className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-black mb-1 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>{caboTexts.title}</h3>
              <p className="text-xs text-[#8b949e] mb-4">
                {caboTexts.subtitle}
              </p>

              <div className={`text-left space-y-2.5 p-3.5 rounded-2xl text-xs mb-5 border ${
                isInverted ? 'bg-[#f8fafc] border-[#cbd5e1] text-[#1e293b]' : 'bg-[#1c1c1c] border-[#545454]/60 text-[#c8d1d9]'
              }`}>
                {caboTexts.rules.map((rule, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#a465b5] mt-1.5 shrink-0" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowCaboConfirmModal(false)}
                  className={`flex-1 py-2.5 font-bold text-xs rounded-xl border transition ${
                    isInverted
                      ? 'bg-slate-100 hover:bg-slate-200 text-[#1e293b] border-[#cbd5e1]'
                      : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
                  }`}
                >
                  {caboTexts.cancelBtn}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setShowCaboConfirmModal(false);
                    socket.emit('call-cabo');
                  }}
                  className="flex-1 py-2.5 bg-[#ff5757] hover:bg-[#e03e3e] text-white font-black text-xs rounded-xl shadow-lg shadow-[#ff5757]/30 transition flex items-center justify-center gap-1.5"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>{caboTexts.confirmBtn}</span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── GAME OVER MODAL ── */}
      <AnimatePresence>
        {gamePhase === 'gameOver' && gameOverData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border-2 border-[#a465b5]/60 rounded-3xl p-6 sm:p-8 w-[92vw] max-w-md shadow-2xl text-center max-h-[85vh] overflow-y-auto ${
                isInverted ? 'bg-white text-[#1e293b]' : 'bg-[#242424] text-white'
              }`}
            >
              <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-[#a465b5]/20 border border-[#a465b5]/40 mb-2">
                <Trophy className="w-10 h-10 text-[#a465b5]" />
              </div>
              <h2 className="text-3xl font-black text-[#a465b5] mt-1">{overTexts.title}</h2>
              <p className={`text-lg font-bold mt-1 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                {overTexts.winnerLabel(gameOverData.winnerName)}!
              </p>
              <p className="text-xs text-[#8b949e] mt-1 mb-6">{overTexts.lowestScoreWins}</p>

              {/* Leaderboard */}
              <div className="space-y-2 mb-6 text-left">
                {Object.entries(gameOverData.finalScores || {})
                  .sort(([, a], [, b]) => a - b)
                  .map(([pId, score], rank) => {
                    const player = gameState.players?.find((p) => p.id === pId);
                    const isWinner = rank === 0;

                    return (
                      <div
                        key={pId}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          isWinner
                            ? 'bg-[#a465b5]/15 border-[#a465b5]/50 font-bold ' + (isInverted ? 'text-[#1e293b]' : 'text-white')
                            : isInverted
                            ? 'bg-[#f8fafc] border-[#cbd5e1] text-[#1e293b]'
                            : 'bg-[#1c1c1c] border-[#545454]/60 text-[#c8d1d9]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm w-5">{rank + 1}.</span>
                          <span className="font-semibold text-sm">{player?.name || 'Player'}</span>
                        </div>
                        <span className="font-mono font-bold text-sm">{score} pts</span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleRestartGame}
                  className="flex-1 py-3 bg-[#a465b5] hover:bg-[#8c4b9d] text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#a465b5]/30"
                >
                  {overTexts.playAgainBtn}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => router.push('/')}
                  className={`flex-1 py-3 font-bold text-sm rounded-xl border transition ${
                    isInverted
                      ? 'bg-slate-100 hover:bg-slate-200 text-[#1e293b] border-[#cbd5e1]'
                      : 'bg-[#2e2e2e] hover:bg-[#383838] text-[#c8d1d9] border-[#545454]'
                  }`}
                >
                  {overTexts.lobbyBtn}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AFK / IDLE 10S CONFIRMATION MODAL ── */}
      <AnimatePresence>
        {showIdleConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border-2 rounded-3xl p-6 sm:p-8 w-[92vw] max-w-md shadow-2xl text-center ${
                isInverted
                  ? 'bg-white border-[#ff5757] text-[#1e293b]'
                  : 'bg-[#242424] border-[#ff5757] text-[#c8d1d9]'
              }`}
            >
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[#ff5757]/15 border-2 border-[#ff5757] text-[#ff5757] animate-pulse">
                <Clock className="w-8 h-8" />
              </div>

              <h2 className={`text-xl sm:text-2xl font-black mb-2 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                {safeAfkTexts.confirmTitle}
              </h2>
              
              <p className={`text-xs sm:text-sm mb-4 leading-relaxed ${isInverted ? 'text-[#64748b]' : 'text-[#8b949e]'}`}>
                {safeAfkTexts.confirmSubtitle}
              </p>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ff5757]/10 border border-[#ff5757]/30 text-[#ff5757] font-bold text-xs sm:text-sm mb-6">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5757] animate-ping" />
                <span>{safeAfkTexts.confirmCountdown(idleConfirmSecondsLeft)}</span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirmStillHere}
                className="w-full py-3.5 bg-[#a465b5] hover:bg-[#8c4b9d] text-white font-bold text-sm sm:text-base rounded-2xl shadow-xl shadow-[#a465b5]/30 transition"
              >
                {safeAfkTexts.confirmBtn}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AFK / OFFLINE FLOATING BOTTOM BANNER ── */}
      <AnimatePresence>
        {isSelfAfk && !showIdleConfirmModal && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40"
          >
            <div
              className={`border-2 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 ${
                isInverted
                  ? 'bg-white/95 border-amber-500 text-[#1e293b]'
                  : 'bg-[#242424]/95 border-amber-500 text-[#c8d1d9]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-500 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black text-amber-500">
                      {safeAfkTexts.bannerTitle}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                      {safeAfkTexts.badge}
                    </span>
                  </div>
                  <p className={`text-[11px] sm:text-xs mt-0.5 ${isInverted ? 'text-[#64748b]' : 'text-[#8b949e]'}`}>
                    {safeAfkTexts.bannerDesc}
                  </p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleResumeFromAfk}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#a465b5] hover:bg-[#8c4b9d] text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-lg shadow-[#a465b5]/30 shrink-0"
              >
                {safeAfkTexts.resumeBtn}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HOW TO PLAY RULES MODAL ── */}
      <AnimatePresence>
        {showRulesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border rounded-3xl p-6 sm:p-8 w-[92vw] max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl ${
                isInverted
                  ? 'bg-white border-[#cbd5e1] text-[#1e293b]'
                  : 'bg-[#242424] border-[#545454] text-[#c8d1d9]'
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold flex items-center gap-2 ${isInverted ? 'text-[#1e293b]' : 'text-white'}`}>
                  <BookOpen className="w-5 h-5 text-[#a465b5]" />
                  <span>{rulesTexts.title}</span>
                </h2>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="text-[#8b949e] hover:text-[#ff5757] p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`space-y-4 text-xs leading-relaxed ${isInverted ? 'text-[#334155]' : 'text-[#c8d1d9]'}`}>
                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Target className="w-4 h-4" />
                    <span>{rulesTexts.goalTitle}</span>
                  </h3>
                  <p>
                    {rulesTexts.goalDesc}
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Gamepad2 className="w-4 h-4" />
                    <span>{rulesTexts.modesTitle}</span>
                  </h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <strong className={isInverted ? 'text-[#0f172a]' : 'text-white'}>{rulesTexts.modeClassicDesc}</strong>
                    </li>
                    <li>
                      <strong className={isInverted ? 'text-[#0f172a]' : 'text-white'}>{rulesTexts.modeEndlessDesc}</strong>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    <span>{rulesTexts.cardPoolTitle}</span>
                  </h3>
                  <p className="mb-1">
                    {rulesTexts.cardPoolDesc}
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    {rulesTexts.cards.map((cardRule, cIdx) => (
                      <li key={cIdx}>{cardRule}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    <span>{rulesTexts.peekPhaseTitle}</span>
                  </h3>
                  <p>
                    {rulesTexts.peekPhaseDesc}
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    <span>{rulesTexts.turnActionsTitle}</span>
                  </h3>
                  <ul className="list-disc pl-4 space-y-1">
                    {rulesTexts.turnActions.map((actionText, aIdx) => (
                      <li key={aIdx}>{actionText}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-[#a465b5] text-sm mb-1 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4" />
                    <span>{rulesTexts.scoringTitle}</span>
                  </h3>
                  <p>
                    {rulesTexts.scoringDesc}
                  </p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowRulesModal(false)}
                className="mt-6 w-full py-2.5 bg-[#a465b5] hover:bg-[#8c4b9d] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-[#a465b5]/30"
              >
                {rulesTexts.gotItBtn}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CUSTOM ORDER MODAL (POP UP) ── */}
      <AnimatePresence>
        {showCustomOrderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 25 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className={`border-2 border-[#a465b5] rounded-3xl p-5 sm:p-6 w-[92vw] max-w-sm sm:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl text-center ${
                isInverted ? 'bg-white text-[#1e293b]' : 'bg-[#242424] text-white'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-[#a465b5]" />
                  <h3 className="text-base font-bold text-left">{lobbyTexts.customOrderModalTitle || 'Atur Urutan Giliran Pemain'}</h3>
                </div>
                <button
                  onClick={() => setShowCustomOrderModal(false)}
                  className="text-[#8b949e] hover:text-[#ff5757] p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#8b949e] text-left mb-4">
                {lobbyTexts.customOrderModalDesc || 'Urutkan pemain dari yang pertama memulai hingga terakhir:'}
              </p>

              <div className="space-y-2 mb-5">
                {customOrderList.map((player, idx) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold ${
                      isInverted ? 'bg-[#f8fafc] border-[#cbd5e1]' : 'bg-[#1c1c1c] border-[#545454]/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#a465b5]/20 border border-[#a465b5]/40 text-[#a465b5] flex items-center justify-center font-bold text-[11px]">
                        {idx + 1}
                      </span>
                      <span className="truncate max-w-[140px] sm:max-w-[180px]">
                        {player.name} {player.id === myPlayerId && `(${lobbyTexts.youTag || 'Anda'})`}
                      </span>
                    </div>

                    {isHost && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveCustomOrder(idx, idx - 1)}
                          className="p-1.5 rounded-lg border border-[#545454]/50 hover:bg-[#a465b5] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                          title={lobbyTexts.moveUpBtn || 'Naik'}
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === customOrderList.length - 1}
                          onClick={() => handleMoveCustomOrder(idx, idx + 1)}
                          className="p-1.5 rounded-lg border border-[#545454]/50 hover:bg-[#a465b5] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                          title={lobbyTexts.moveDownBtn || 'Turun'}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomOrderModal(false)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isInverted ? 'bg-slate-100 hover:bg-slate-200 border-[#cbd5e1]' : 'bg-[#2e2e2e] hover:bg-[#383838] border-[#545454]'
                  }`}
                >
                  {caboTexts.cancelBtn || 'Batal'}
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={handleSaveCustomOrder}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#a465b5] hover:bg-[#8c4b9d] text-white shadow-lg shadow-[#a465b5]/30 transition cursor-pointer"
                  >
                    {lobbyTexts.saveOrderBtn || 'Simpan Urutan'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RANDOMIZER STARTING PLAYER TICKER ANIMATION (POP UP) ── */}
      <AnimatePresence>
        {randomizerAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 25 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 450, damping: 20 }}
              className={`border-2 border-[#a465b5] rounded-3xl p-6 sm:p-8 w-[92vw] max-w-sm text-center shadow-2xl relative overflow-hidden ${
                isInverted ? 'bg-white text-[#1e293b]' : 'bg-[#242424] text-white'
              }`}
            >
              <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-[#a465b5]/20 border border-[#a465b5]/40 mb-3 text-[#a465b5]">
                <Sparkles className="w-8 h-8 animate-spin-slow" />
              </div>

              <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#a465b5] mb-2">
                {randomizerAnimation.isRunning
                  ? (lobbyTexts.randomizerRollingTitle || 'Mengacak Pemain Pertama...')
                  : (lobbyTexts.randomizerWinnerTitle || 'Pemain Pertama:')}
              </h3>

              <div className={`p-4 rounded-2xl border my-3 transition-all ${
                randomizerAnimation.isRunning
                  ? 'bg-[#a465b5]/10 border-[#a465b5]/30'
                  : 'bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
              }`}>
                <motion.p
                  key={randomizerAnimation.candidateName}
                  initial={{ scale: 0.85, y: -8, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  className={`text-2xl font-black truncate ${
                    randomizerAnimation.isRunning ? 'text-[#a465b5]' : 'text-emerald-400'
                  }`}
                >
                  {randomizerAnimation.candidateName}
                </motion.p>
              </div>

              <p className="text-[11px] text-[#8b949e]">
                {randomizerAnimation.isRunning
                  ? 'Memilih giliran pertama...'
                  : 'Mendapat giliran pertama untuk memulai pertandingan!'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}