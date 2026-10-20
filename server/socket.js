// server/socket.js
const { Server } = require("socket.io");

let io;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const TARGET_GAME_OVER_SCORE = 100;
const CABO_PENALTY_POINTS = 10;

// ──────────────────────────────────────────────
// Deck helpers (Cabo Card Pools)
// - 2 to 4 players: 52-card pool
//   0: 2 cards
//   1-6: 4 cards each (24 cards, plain)
//   7-8: 4 cards each (8 cards, Peek)
//   9-10: 4 cards each (8 cards, Spy)
//   11-12: 4 cards each (8 cards, Swap)
//   13: 2 cards (Cabo card)
// - 5 to 8 players: 70-card pool
//   0: 2 cards
//   1-6: 4 cards each (24 cards, plain)
//   7-8: 6 cards each (12 cards, Peek)
//   9-10: 6 cards each (12 cards, Spy)
//   11-12: 6 cards each (12 cards, Swap)
//   13: 8 cards (Cabo card)
//   Total: 70 cards
// ──────────────────────────────────────────────

function generateDeck(cardCountOrPlayerCount = 52) {
  const deck = [];
  const use70Pool =
    cardCountOrPlayerCount === 70 ||
    cardCountOrPlayerCount === "second" ||
    (typeof cardCountOrPlayerCount === "number" && cardCountOrPlayerCount >= 6 && cardCountOrPlayerCount <= 8);

  if (use70Pool) {
    // 70-card pool (2nd Edition)
    const cardDefs70 = [
      { value: 0, count: 2, ability: null },
      { value: 1, count: 4, ability: null },
      { value: 2, count: 4, ability: null },
      { value: 3, count: 4, ability: null },
      { value: 4, count: 4, ability: null },
      { value: 5, count: 4, ability: null },
      { value: 6, count: 4, ability: null },
      { value: 7, count: 6, ability: "peek" },
      { value: 8, count: 6, ability: "peek" },
      { value: 9, count: 6, ability: "spy" },
      { value: 10, count: 6, ability: "spy" },
      { value: 11, count: 6, ability: "swap" },
      { value: 12, count: 6, ability: "swap" },
      { value: 13, count: 8, ability: null },
    ];

    let idCounter = 1;
    cardDefs70.forEach(({ value, count, ability }) => {
      for (let i = 0; i < count; i++) {
        deck.push({
          id: `c70-${value}-${idCounter++}`,
          value,
          ability,
          poolType: "70-card",
        });
      }
    });
  } else {
    // 52-card pool for 2-4 players
    const cardDefs52 = [
      { value: 0, count: 2, ability: null },
      { value: 1, count: 4, ability: null },
      { value: 2, count: 4, ability: null },
      { value: 3, count: 4, ability: null },
      { value: 4, count: 4, ability: null },
      { value: 5, count: 4, ability: null },
      { value: 6, count: 4, ability: null },
      { value: 7, count: 4, ability: "peek" },
      { value: 8, count: 4, ability: "peek" },
      { value: 9, count: 4, ability: "spy" },
      { value: 10, count: 4, ability: "spy" },
      { value: 11, count: 4, ability: "swap" },
      { value: 12, count: 4, ability: "swap" },
      { value: 13, count: 2, ability: null },
    ];

    let idCounter = 1;
    cardDefs52.forEach(({ value, count, ability }) => {
      for (let i = 0; i < count; i++) {
        deck.push({
          id: `c52-${value}-${idCounter++}`,
          value,
          ability,
          poolType: "52-card",
        });
      }
    });
  }

  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ──────────────────────────────────────────────
// Game logic helpers
// ──────────────────────────────────────────────

function getPublicPlayerData(player) {
  return {
    id: player.id,
    name: player.name,
    handSize: player.hand ? player.hand.length : 4,
    score: player.score,
    peekRemaining: player.peekRemaining ?? 0,
    initialPeekDone: player.initialPeekDone ?? false,
    ready: player.ready ?? false,
    seenPositions: Array.from(player.seenPositions || []),
    faceUpCards: player.faceUpCards || {},
    isHost: Boolean(player.isHost),
    isAfk: Boolean(player.isAfk),
    isOffline: Boolean(player.isOffline),
  };
}

function resolveDeckEdition(room) {
  if (room.deckEdition === "first") {
    return { count: 52, type: "first", label: "1st Edition (52)" };
  }
  if (room.deckEdition === "second") {
    return { count: 70, type: "second", label: "2nd Edition (70)" };
  }
  // "auto": 52 cards for 2-5 players, 70 cards for 6+ players
  const is70 = room.players.length >= 6;
  return is70
    ? { count: 70, type: "second", label: "2nd Edition (70)" }
    : { count: 52, type: "first", label: "1st Edition (52)" };
}

function emitRoomState(roomId, room) {
  if (!room) return;
  const resolved = resolveDeckEdition(room);
  io.to(roomId).emit("game-state", {
    hostId: room.hostId || room.players[0]?.id || null,
    players: room.players.map(getPublicPlayerData),
    drawPileCount: room.deck ? room.deck.length : 0,
    discardTop:
      room.discardPile && room.discardPile.length > 0
        ? room.discardPile[room.discardPile.length - 1]
        : null,
    currentPlayerId: room.players[room.currentPlayerIndex]?.id || null,
    currentPlayerName: room.players[room.currentPlayerIndex]?.name || null,
    gamePhase: room.gamePhase,
    gameMode: room.gameMode || "classic",
    deckEdition: room.deckEdition || "auto",
    initialPeekDuration: room.initialPeekDuration ?? 10,
    abilityPeekDuration: room.abilityPeekDuration ?? 5,
    roundMode: room.roundMode || "score",
    targetRounds: room.targetRounds ?? 1,
    targetScore: room.targetScore ?? 100,
    currentRound: room.currentRound ?? 1,
    caboCalledBy: room.caboCalledBy,
    turnsRemaining: room.turnsRemaining,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    totalDeckCards: resolved.count,
    poolType: resolved.label,
    turnOrderMode: room.turnOrderMode || "random",
    customPlayerOrder: room.customPlayerOrder || [],
  });
}

function checkDrawPileAndReshuffle(rooms, roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gamePhase !== "playing") return false;

  if (room.deck.length === 0) {
    if (room.gameMode === "classic") {
      // Classic Mode: Game/round ends immediately when draw pile runs out!
      endRound(rooms, roomId, "draw-pile-empty");
      return true;
    } else {
      // Endless Mode: Discard pile is reshuffled into draw pile until someone calls Cabo
      if (room.discardPile.length > 1) {
        const topDiscard = room.discardPile.pop();
        room.deck = shuffleDeck([...room.discardPile]);
        room.discardPile = [topDiscard];

        io.to(roomId).emit("deck-reshuffled", {
          drawPileCount: room.deck.length,
          discardTop: topDiscard,
          message: "Draw pile ran out! Discard pile has been reshuffled into the draw pile (Endless Mode).",
        });

        emitRoomState(roomId, room);
        return false;
      } else {
        // Discard pile has no cards to reshuffle
        endRound(rooms, roomId, "no-cards-left");
        return true;
      }
    }
  }

  return false;
}

function startGame(rooms, roomId) {
  const room = rooms.get(roomId);
  if (!room || room.players.length < MIN_PLAYERS) return;

  const resolved = resolveDeckEdition(room);
  const totalDeckCards = resolved.count;
  const poolType = resolved.label;
  room.deck = shuffleDeck(generateDeck(resolved.count));
  room.discardPile = [];

  // Deal 4 cards to each player
  room.players.forEach((player) => {
    player.hand = [];
    player.faceUpCards = {};
    player.seenPositions = new Set();
    player.peekRemaining = 2;
    player.initialPeekDone = false;
    player.tempCard = null;
    player.tempCardSource = null;
    player.ready = false;
    for (let i = 0; i < 4; i++) {
      player.hand.push(room.deck.pop());
    }
  });

  // Seed discard pile with 1 card
  room.discardPile.push(room.deck.pop());

  // Enter simultaneous initial peek phase
  room.gamePhase = "peek";

  // Determine starting player and player sequence (Custom Order vs Randomizer)
  if (room.turnOrderMode === "custom" && Array.isArray(room.customPlayerOrder) && room.customPlayerOrder.length > 0) {
    const orderMap = new Map(room.customPlayerOrder.map((id, index) => [id, index]));
    room.players.sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
      return idxA - idxB;
    });
    room.currentPlayerIndex = 0;
  } else {
    // Randomize starting player for a fresh turn sequence
    const activePlayers = room.players.filter((p) => !p.isOffline);
    const eligibleCount = activePlayers.length > 0 ? activePlayers.length : room.players.length;
    room.currentPlayerIndex = Math.floor(Math.random() * eligibleCount);
  }
  const startingPlayer = room.players[room.currentPlayerIndex] || room.players[0];

  room.caboCalledBy = null;
  room.turnsRemaining = 0;

  io.to(roomId).emit("game-started", {
    players: room.players.map(getPublicPlayerData),
    currentPlayerId: startingPlayer.id,
    currentPlayerName: startingPlayer.name,
    startingPlayerName: startingPlayer.name,
    startingPlayerId: startingPlayer.id,
    turnOrderMode: room.turnOrderMode || "random",
    turnOrder: room.players.map((p) => ({ id: p.id, name: p.name })),
    discardTop: room.discardPile[room.discardPile.length - 1],
    drawPileCount: room.deck.length,
    gamePhase: room.gamePhase,
    gameMode: room.gameMode || "classic",
    totalDeckCards,
    poolType,
  });

  emitRoomState(roomId, room);
}

function moveToNextPlayer(rooms, roomId) {
  const room = rooms.get(roomId);
  if (!room || room.players.length === 0) return;

  // Clear any leftover tempCard from previous turn
  room.players.forEach((p) => {
    p.tempCard = null;
    p.tempCardSource = null;
  });

  // If Cabo was called, count down remaining turns
  if (room.caboCalledBy !== null) {
    room.turnsRemaining--;

    if (room.turnsRemaining <= 0) {
      endRound(rooms, roomId, "cabo");
      return;
    }
  }

  // Check if draw pile is empty (Classic mode ends, Endless mode reshuffles)
  if (room.deck.length === 0) {
    const roundEnded = checkDrawPileAndReshuffle(rooms, roomId);
    if (roundEnded) return;
  }

  // Advance index
  room.currentPlayerIndex =
    (room.currentPlayerIndex + 1) % room.players.length;

  const currentP = room.players[room.currentPlayerIndex];

  io.to(roomId).emit("turn-changed", {
    currentPlayerId: currentP.id,
    currentPlayerName: currentP.name,
    turnsRemaining: room.turnsRemaining,
    gamePhase: room.gamePhase,
  });

  emitRoomState(roomId, room);
}

function endRound(rooms, roomId, endReason = "cabo") {
  const room = rooms.get(roomId);
  if (!room) return;

  // Reveal all hands
  const hands = {};
  room.players.forEach((player) => {
    hands[player.id] = player.hand;
  });

  // Calculate raw round scores
  const roundScores = {};
  let lowestScore = Infinity;

  room.players.forEach((player) => {
    // Jika player sedang offline/terputus atau reconnect setelah cabo/round selesai, poin ronde tetap 0
    if (player.isOffline || player.disconnectedAt) {
      roundScores[player.id] = 0;
    } else {
      const handSum = (player.hand || []).reduce(
        (sum, card) => sum + (card?.value || 0),
        0
      );
      roundScores[player.id] = handSum;
      if (handSum < lowestScore) lowestScore = handSum;
    }
  });

  // If all players were disconnected (safety guard)
  if (lowestScore === Infinity) lowestScore = 0;

  // Classic Cabo scoring for caller:
  // - If caller has lowestScore (or tied lowest): caller gets 0 points!
  // - If someone has a lower score: caller gets raw hand score + penalty (10 pts)
  let penaltyApplied = false;
  let caboCallerWon = false;

  if (room.caboCalledBy !== null) {
    const caboScore = roundScores[room.caboCalledBy] ?? 0;
    if (caboScore > lowestScore) {
      roundScores[room.caboCalledBy] = (roundScores[room.caboCalledBy] || 0) + CABO_PENALTY_POINTS;
      penaltyApplied = true;
    } else {
      // Caller won Cabo!
      roundScores[room.caboCalledBy] = 0;
      caboCallerWon = true;
    }
  }

  // Accumulate scores
  room.players.forEach((player) => {
    player.score += roundScores[player.id] || 0;
    player.ready = false;
  });

  // Check Game Over condition based on configured roundMode:
  // 1. "rounds" (fixed rounds 1-5, default 1, high score threshold 1000)
  // 2. "score" (target score 50-500, default 100)
  let isGameOver = false;
  if (room.roundMode === "rounds") {
    const targetR = room.targetRounds ?? 1;
    const completedRounds = room.currentRound ?? 1;
    if (completedRounds >= targetR || room.players.some((p) => p.score >= 1000)) {
      isGameOver = true;
    }
  } else {
    const targetS = room.targetScore ?? 100;
    if (room.players.some((p) => p.score >= targetS)) {
      isGameOver = true;
    }
  }

  if (isGameOver) {
    // Winner is the player with the minimum accumulated score
    const minScore = Math.min(...room.players.map((p) => p.score));
    const winner = room.players.find((p) => p.score === minScore) || room.players[0];

    room.gamePhase = "gameOver";
    io.to(roomId).emit("game-over", {
      winnerId: winner?.id,
      winnerName: winner?.name,
      finalScores: room.players.reduce((acc, p) => {
        acc[p.id] = p.score;
        return acc;
      }, {}),
      roundScores,
      hands,
      caboCalledBy: room.caboCalledBy,
      penaltyApplied,
      caboCallerWon,
      endReason,
      gameMode: room.gameMode || "classic",
      roundMode: room.roundMode || "score",
      currentRound: room.currentRound ?? 1,
      targetRounds: room.targetRounds ?? 1,
      targetScore: room.targetScore ?? 100,
    });
  } else {
    room.currentRound = (room.currentRound ?? 1) + 1;
    room.gamePhase = "roundEnd";
    io.to(roomId).emit("round-ended", {
      hands,
      roundScores,
      playerScores: room.players.reduce((acc, p) => {
        acc[p.id] = p.score;
        return acc;
      }, {}),
      caboCalledBy: room.caboCalledBy,
      penaltyApplied,
      caboCallerWon,
      endReason,
      gameMode: room.gameMode || "classic",
      roundMode: room.roundMode || "score",
      currentRound: room.currentRound,
      targetRounds: room.targetRounds ?? 1,
      targetScore: room.targetScore ?? 100,
    });
  }

  emitRoomState(roomId, room);
}

// ──────────────────────────────────────────────
// Socket.IO initialisation
// ──────────────────────────────────────────────

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ── join-room ──────────────────────────────
    socket.on("join-room", ({ roomId, playerName, gameMode, sessionToken }) => {
      if (!roomId || !playerName) {
        socket.emit("error", "Room ID and Player Name are required");
        return;
      }

      const cleanRoomId = roomId.trim().toUpperCase();
      const cleanName = playerName.trim();

      socket.join(cleanRoomId);
      socket.roomId = cleanRoomId;
      socket.playerName = cleanName;

      if (!rooms.has(cleanRoomId)) {
        rooms.set(cleanRoomId, {
          hostId: socket.id,
          players: [],
          deck: [],
          discardPile: [],
          currentPlayerIndex: 0,
          gamePhase: "waiting",
          gameMode: gameMode === "endless" ? "endless" : "classic",
          deckEdition: "auto",
          initialPeekDuration: 10,
          abilityPeekDuration: 5,
          roundMode: "score", // "score" | "rounds" (default: akumulasi 100 poin)
          targetRounds: 1, // 1 to 5 (default: 1 jika diatur ke mode ronde)
          targetScore: 100, // 50 to 500 (default: 100)
          currentRound: 1,
          turnsRemaining: 0,
          caboCalledBy: null,
        });
      }

      const room = rooms.get(cleanRoomId);
      if (!room.hostId) {
        room.hostId = socket.id;
      }

      // Check if player is reconnecting with sessionToken or name
      let existingIndex = -1;
      if (sessionToken) {
        existingIndex = room.players.findIndex(
          (p) => p.sessionToken && p.sessionToken === sessionToken
        );
      }
      if (existingIndex === -1 && cleanName) {
        existingIndex = room.players.findIndex(
          (p) => p.name.toLowerCase() === cleanName.toLowerCase()
        );
      }

      if (existingIndex !== -1) {
        // Reconnect: update socket id, clear offline/afk flags and notify
        const existingPlayer = room.players[existingIndex];
        const wasHost = existingPlayer.isHost || room.hostId === existingPlayer.id || !room.hostId;
        existingPlayer.id = socket.id;
        if (wasHost) {
          existingPlayer.isHost = true;
          room.hostId = socket.id;
        }
        if (sessionToken) {
          existingPlayer.sessionToken = sessionToken;
        }
        existingPlayer.isOffline = false;
        existingPlayer.isAfk = false;
        existingPlayer.disconnectedAt = null;
        socket.playerId = socket.id;

        // Send full private state back to the reconnected player
        socket.emit("player-reconnected-state", {
          hand: existingPlayer.hand,
          seenPositions: Array.from(existingPlayer.seenPositions || []),
          faceUpCards: existingPlayer.faceUpCards || {},
          peekRemaining: existingPlayer.peekRemaining,
          initialPeekDone: existingPlayer.initialPeekDone,
          tempCard: existingPlayer.tempCard,
          tempCardSource: existingPlayer.tempCardSource,
        });

        io.to(cleanRoomId).emit("player-reconnected", {
          playerId: socket.id,
          playerName: existingPlayer.name,
        });
      } else {
        // New player joining
        if (room.players.length >= MAX_PLAYERS) {
          socket.emit("error", `Room is full (maximum ${MAX_PLAYERS} players)`);
          return;
        }

        if (room.gamePhase !== "waiting" && room.gamePhase !== "gameOver") {
          socket.emit(
            "error",
            "Game is already in progress in this room. Please wait for the game to finish or join another room."
          );
          return;
        }

        const isFirst = room.players.length === 0 || !room.hostId;
        if (isFirst) {
          room.hostId = socket.id;
        }

        const newPlayer = {
          id: socket.id,
          name: cleanName,
          sessionToken: sessionToken || null,
          isHost: isFirst,
          hand: [],
          faceUpCards: {},
          score: 0,
          seenPositions: new Set(),
          peekRemaining: 2,
          initialPeekDone: false,
          ready: false,
          isAfk: false,
          isOffline: false,
          disconnectedAt: null,
          tempCard: null,
          tempCardSource: null,
        };

        room.players.push(newPlayer);
        socket.playerId = socket.id;

        io.to(cleanRoomId).emit("player-joined", {
          playerId: socket.id,
          playerName: cleanName,
          playerCount: room.players.length,
        });
      }

      // Broadcast updated room state to all clients in the room
      emitRoomState(cleanRoomId, room);
    });

    // ── initial-peek ───────────────────────────
    // Used during simultaneous initial peek phase
    socket.on("peek-initial-card", ({ cardIndex }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "peek") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      if (cardIndex < 0 || cardIndex >= player.hand.length) {
        socket.emit("error", "Invalid card position");
        return;
      }

      if (player.seenPositions.has(cardIndex)) {
        socket.emit("error", "You have already peeked at this card");
        return;
      }

      if (player.peekRemaining <= 0) {
        socket.emit("error", "You have already peeked at 2 cards");
        return;
      }

      player.seenPositions.add(cardIndex);
      player.peekRemaining -= 1;

      // Reveal card to THIS player only
      socket.emit("card-peeked", {
        cardIndex,
        card: player.hand[cardIndex],
        peekRemaining: player.peekRemaining,
        isInitialPeek: true,
      });

      if (player.peekRemaining <= 0) {
        player.initialPeekDone = true;
      }

      emitRoomState(roomId, room);

      // Check if all players completed their initial peeks
      const allDone = room.players.every((p) => p.initialPeekDone);
      if (allDone) {
        room.gamePhase = "playing";
        const firstP = room.players[room.currentPlayerIndex] || room.players[0];

        io.to(roomId).emit("turn-changed", {
          currentPlayerId: firstP.id,
          currentPlayerName: firstP.name,
          turnsRemaining: 0,
          gamePhase: "playing",
        });

        io.to(roomId).emit("peek-phase-completed", {
          message: `Semua pemain selesai mengintip! Giliran pertama: ${firstP.name}`,
          startingPlayerName: firstP.name,
        });

        emitRoomState(roomId, room);
      }
    });

    // ── set-game-mode ─────────────────────────
    socket.on("set-game-mode", ({ mode, roomId: clientRoomId }) => {
      const roomId = (socket.roomId || clientRoomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room || (room.gamePhase !== "waiting" && room.gamePhase !== "roundEnd")) return;

      if (room.hostId && socket.id !== room.hostId) {
        socket.emit("error", "Hanya pemilik room (Host) yang dapat mengubah konfigurasi!");
        return;
      }

      if (mode === "classic" || mode === "endless") {
        room.gameMode = mode;
        io.to(roomId).emit("game-mode-updated", { gameMode: mode });
        emitRoomState(roomId, room);
      }
    });

    // ── set-deck-edition ───────────────────────
    socket.on("set-deck-edition", ({ edition, roomId: clientRoomId }) => {
      const roomId = (socket.roomId || clientRoomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room || (room.gamePhase !== "waiting" && room.gamePhase !== "roundEnd")) return;

      if (room.hostId && socket.id !== room.hostId) {
        socket.emit("error", "Hanya pemilik room (Host) yang dapat mengubah konfigurasi!");
        return;
      }

      if (edition === "first" || edition === "second" || edition === "auto") {
        room.deckEdition = edition;
        io.to(roomId).emit("deck-edition-updated", { deckEdition: edition });
        emitRoomState(roomId, room);
      }
    });

    // ── set-peek-duration ──────────────────────
    socket.on("set-peek-duration", ({ type, duration, roomId: clientRoomId }) => {
      const roomId = (socket.roomId || clientRoomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room || (room.gamePhase !== "waiting" && room.gamePhase !== "roundEnd")) return;

      if (room.hostId && socket.id !== room.hostId) {
        socket.emit("error", "Hanya pemilik room (Host) yang dapat mengubah konfigurasi!");
        return;
      }

      const dur = parseInt(duration, 10);
      if (isNaN(dur) || dur < 2 || dur > 60) return;

      if (type === "initial") {
        room.initialPeekDuration = dur;
      } else if (type === "ability") {
        room.abilityPeekDuration = dur;
      }
      io.to(roomId).emit("peek-duration-updated", {
        type,
        duration: dur,
        initialPeekDuration: room.initialPeekDuration,
        abilityPeekDuration: room.abilityPeekDuration,
      });
      emitRoomState(roomId, room);
    });

    // ── set-round-mode ─────────────────────────
    socket.on("set-round-mode", ({ roundMode, targetRounds, targetScore, roomId: clientRoomId }) => {
      const roomId = (socket.roomId || clientRoomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room || (room.gamePhase !== "waiting" && room.gamePhase !== "roundEnd")) return;

      if (room.hostId && socket.id !== room.hostId) {
        socket.emit("error", "Hanya pemilik room (Host) yang dapat mengubah konfigurasi!");
        return;
      }

      if (roundMode === "rounds" || roundMode === "score") {
        room.roundMode = roundMode;
      }
      if (targetRounds !== undefined) {
        const tr = parseInt(targetRounds, 10);
        if (!isNaN(tr) && tr >= 1 && tr <= 5) {
          room.targetRounds = tr;
        }
      }
      if (targetScore !== undefined) {
        const ts = parseInt(targetScore, 10);
        if (!isNaN(ts) && ts >= 50 && ts <= 500) {
          room.targetScore = ts;
        }
      }
      io.to(roomId).emit("round-mode-updated", {
        roundMode: room.roundMode,
        targetRounds: room.targetRounds,
        targetScore: room.targetScore,
      });
      emitRoomState(roomId, room);
    });

    // ── set-turn-order-mode ────────────────────
    socket.on("set-turn-order-mode", ({ mode, playerOrder, roomId: clientRoomId }) => {
      const roomId = (socket.roomId || clientRoomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room || (room.gamePhase !== "waiting" && room.gamePhase !== "roundEnd")) return;

      if (room.hostId && socket.id !== room.hostId) {
        socket.emit("error", "Hanya pemilik room (Host) yang dapat mengatur urutan giliran!");
        return;
      }

      if (mode === "random" || mode === "custom") {
        room.turnOrderMode = mode;
      }
      if (Array.isArray(playerOrder) && playerOrder.length > 0) {
        room.customPlayerOrder = playerOrder;
      }

      io.to(roomId).emit("turn-order-mode-updated", {
        turnOrderMode: room.turnOrderMode,
        customPlayerOrder: room.customPlayerOrder,
      });
      emitRoomState(roomId, room);
    });

    // ── player-idle-timeout (AFK Trigger & Turn Skip) ──
    socket.on("player-idle-timeout", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      player.isAfk = true;
      io.to(roomId).emit("player-afk-status", {
        playerId: player.id,
        playerName: player.name,
        isAfk: true,
      });

      // If it is currently this player's turn in playing phase, skip turn automatically!
      if (
        room.gamePhase === "playing" &&
        room.players[room.currentPlayerIndex]?.id === player.id
      ) {
        io.to(roomId).emit("turn-skipped", {
          skippedPlayerId: player.id,
          skippedPlayerName: player.name,
          reason: "idle-timeout",
        });
        moveToNextPlayer(rooms, roomId);
      }
      emitRoomState(roomId, room);
    });

    // ── resume-from-afk ────────────────────────
    socket.on("resume-from-afk", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      player.isAfk = false;
      player.isOffline = false;
      player.disconnectedAt = null;

      io.to(roomId).emit("player-afk-status", {
        playerId: player.id,
        playerName: player.name,
        isAfk: false,
      });
      emitRoomState(roomId, room);
    });

    // ── skip-initial-peek ──────────────────────
    socket.on("skip-initial-peek", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "peek") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      player.peekRemaining = 0;
      player.initialPeekDone = true;
      emitRoomState(roomId, room);

      // Check if all players completed or skipped initial peeks
      const allDone = room.players.every((p) => p.initialPeekDone);
      if (allDone) {
        room.gamePhase = "playing";
        room.currentPlayerIndex = 0;
        const firstP = room.players[0];

        io.to(roomId).emit("turn-changed", {
          currentPlayerId: firstP.id,
          currentPlayerName: firstP.name,
          turnsRemaining: 0,
          gamePhase: "playing",
        });

        io.to(roomId).emit("peek-phase-completed", {
          message: "All players have completed the initial peek. Game begins!",
        });

        emitRoomState(roomId, room);
      }
    });

    // ── draw-from-deck ─────────────────────────
    socket.on("draw-from-deck", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const currentP = room.players[room.currentPlayerIndex];
      if (currentP?.id !== socket.playerId) {
        socket.emit("error", "It is not your turn");
        return;
      }

      if (currentP.tempCard) {
        socket.emit("error", "You have already drawn a card this turn");
        return;
      }

      // Check if draw pile is empty
      if (room.deck.length === 0) {
        const roundEnded = checkDrawPileAndReshuffle(rooms, roomId);
        if (roundEnded) return;
      }

      if (room.deck.length === 0) {
        socket.emit("error", "No cards available to draw");
        return;
      }

      const drawnCard = room.deck.pop();
      currentP.tempCard = drawnCard;
      currentP.tempCardSource = "deck";

      // Send drawn card only to the current player
      socket.emit("card-drawn", { card: drawnCard, source: "deck" });

      // Notify others that this player drew from deck (without revealing the card value)
      socket.to(roomId).emit("player-drew-card", {
        playerId: socket.playerId,
        playerName: currentP.name,
        source: "deck",
      });

      emitRoomState(roomId, room);

      // In endless mode, if this draw made the deck 0, reshuffle right away
      if (room.gameMode === "endless" && room.deck.length === 0 && room.discardPile.length > 1) {
        checkDrawPileAndReshuffle(rooms, roomId);
      }
    });

    // ── draw-from-discard ──────────────────────
    socket.on("draw-from-discard", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const currentP = room.players[room.currentPlayerIndex];
      if (currentP?.id !== socket.playerId) {
        socket.emit("error", "It is not your turn");
        return;
      }

      if (currentP.tempCard) {
        socket.emit("error", "You have already drawn a card this turn");
        return;
      }

      if (room.discardPile.length === 0) {
        socket.emit("error", "No cards in discard pile");
        return;
      }

      const drawnCard = room.discardPile.pop();
      currentP.tempCard = drawnCard;
      currentP.tempCardSource = "discard";

      socket.emit("card-drawn", { card: drawnCard, source: "discard" });

      socket.to(roomId).emit("player-drew-card", {
        playerId: socket.playerId,
        playerName: currentP.name,
        source: "discard",
        card: drawnCard,
      });

      emitRoomState(roomId, room);
    });

    // ── swap-with-hand ─────────────────────────
    // Current player replaces one card in hand with the drawn card
    socket.on("swap-with-hand", ({ handIndex }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player || !player.tempCard) return;

      if (handIndex < 0 || handIndex >= player.hand.length) {
        socket.emit("error", "Invalid hand card index");
        return;
      }

      if (!player.faceUpCards) player.faceUpCards = {};

      const discardedCard = player.hand[handIndex];
      const drawnCard = player.tempCard;
      const source = player.tempCardSource; // 'deck' | 'discard'

      player.hand[handIndex] = drawnCard;

      if (source === "discard") {
        // Kartu yang diambil dari discard harus terbuka terus!
        player.faceUpCards[handIndex] = drawnCard;
        io.to(roomId).emit("player-swapped-hand", {
          playerId: socket.playerId,
          handIndex,
          card: drawnCard,
          isFaceUp: true,
        });
      } else {
        // Diganti dengan draw pile -> ditutup kembali
        delete player.faceUpCards[handIndex];
        io.to(roomId).emit("player-swapped-hand", {
          playerId: socket.playerId,
          handIndex,
          card: null,
          isFaceUp: false,
        });
      }

      player.tempCard = null;
      player.tempCardSource = null;

      room.discardPile.push(discardedCard);

      io.to(roomId).emit("card-discarded", {
        playerId: socket.playerId,
        playerName: player.name,
        card: discardedCard,
        discardTop: discardedCard,
        action: "swap",
      });

      emitRoomState(roomId, room);
      moveToNextPlayer(rooms, roomId);
    });

    // ── discard-card ───────────────────────────
    // Player discards the drawn card without swapping or using ability
    socket.on("discard-card", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player || !player.tempCard) return;

      const cardToDiscard = player.tempCard;
      player.tempCard = null;
      player.tempCardSource = null;

      room.discardPile.push(cardToDiscard);

      io.to(roomId).emit("card-discarded", {
        playerId: socket.playerId,
        playerName: player.name,
        card: cardToDiscard,
        discardTop: cardToDiscard,
        action: "discard",
      });

      emitRoomState(roomId, room);
      moveToNextPlayer(rooms, roomId);
    });

    // ── use-ability ────────────────────────────
    // Player chooses to trigger ability of card drawn from deck
    socket.on("use-ability", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player || !player.tempCard) return;

      if (player.tempCardSource !== "deck") {
        socket.emit("error", "Abilities can only be used with cards drawn from the draw pile");
        return;
      }

      const ability = player.tempCard.ability;
      if (!ability) {
        socket.emit("error", "This card has no special ability");
        return;
      }

      const opponentTargets = room.players
        .filter((p) => p.id !== socket.playerId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          handSize: p.hand.length,
        }));

      socket.emit("ability-activated", {
        ability,
        availableTargets: opponentTargets,
      });
    });

    // ── peek-card (Ability: Peek 7, 8) ────────
    socket.on("peek-card", ({ cardIndex }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      // If during initial peek phase, redirect to initial peek handler logic
      if (room.gamePhase === "peek") {
        socket.emit("error", "Please use initial peek");
        return;
      }

      if (!player.tempCard || player.tempCard.ability !== "peek") {
        socket.emit("error", "You do not have a Peek ability card active");
        return;
      }

      if (cardIndex < 0 || cardIndex >= player.hand.length) {
        socket.emit("error", "Invalid card index");
        return;
      }

      const peekedCard = player.hand[cardIndex];
      socket.emit("card-peeked", {
        cardIndex,
        card: peekedCard,
        ability: "peek",
      });

      // Discard ability card to discard pile
      const abilityCard = player.tempCard;
      player.tempCard = null;
      player.tempCardSource = null;
      room.discardPile.push(abilityCard);

      io.to(roomId).emit("card-discarded", {
        playerId: socket.playerId,
        playerName: player.name,
        card: abilityCard,
        discardTop: abilityCard,
        action: "ability-peek",
      });

      emitRoomState(roomId, room);
      moveToNextPlayer(rooms, roomId);
    });

    // ── spy-card (Ability: Spy 9, 10) ──────────
    socket.on("spy-card", ({ targetPlayerId, cardIndex }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      const targetPlayer = room.players.find((p) => p.id === targetPlayerId);

      if (!player || !targetPlayer) {
        socket.emit("error", "Target player not found");
        return;
      }

      if (!player.tempCard || player.tempCard.ability !== "spy") {
        socket.emit("error", "You do not have a Spy ability card active");
        return;
      }

      if (cardIndex < 0 || cardIndex >= targetPlayer.hand.length) {
        socket.emit("error", "Invalid card index");
        return;
      }

      const spiedCard = targetPlayer.hand[cardIndex];
      socket.emit("card-spied", {
        targetPlayerId,
        targetPlayerName: targetPlayer.name,
        cardIndex,
        card: spiedCard,
      });

      // Discard ability card to discard pile
      const abilityCard = player.tempCard;
      player.tempCard = null;
      player.tempCardSource = null;
      room.discardPile.push(abilityCard);

      io.to(roomId).emit("card-discarded", {
        playerId: socket.playerId,
        playerName: player.name,
        card: abilityCard,
        discardTop: abilityCard,
        action: "ability-spy",
      });

      emitRoomState(roomId, room);
      moveToNextPlayer(rooms, roomId);
    });

    // ── swap-cards (Ability: Swap 11, 12) ──────
    // Swap 1 of player's hand cards with 1 of target's hand cards (blind swap)
    socket.on("swap-cards", ({ targetPlayerId, myCardIndex, targetCardIndex }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      const targetPlayer = room.players.find((p) => p.id === targetPlayerId);

      if (!player || !targetPlayer) {
        socket.emit("error", "Target player not found");
        return;
      }

      if (!player.tempCard || player.tempCard.ability !== "swap") {
        socket.emit("error", "You do not have a Swap ability card active");
        return;
      }

      if (
        myCardIndex < 0 ||
        myCardIndex >= player.hand.length ||
        targetCardIndex < 0 ||
        targetCardIndex >= targetPlayer.hand.length
      ) {
        socket.emit("error", "Invalid card index for swap");
        return;
      }

      if (!player.faceUpCards) player.faceUpCards = {};
      if (!targetPlayer.faceUpCards) targetPlayer.faceUpCards = {};

      // Perform unseen swap
      const myCard = player.hand[myCardIndex];
      player.hand[myCardIndex] = targetPlayer.hand[targetCardIndex];
      targetPlayer.hand[targetCardIndex] = myCard;

      // Transfer face-up status between swapped slots
      const myFaceUp = player.faceUpCards[myCardIndex];
      const targetFaceUp = targetPlayer.faceUpCards[targetCardIndex];

      if (targetFaceUp) {
        player.faceUpCards[myCardIndex] = targetFaceUp;
      } else {
        delete player.faceUpCards[myCardIndex];
      }

      if (myFaceUp) {
        targetPlayer.faceUpCards[targetCardIndex] = myFaceUp;
      } else {
        delete targetPlayer.faceUpCards[targetCardIndex];
      }

      // Discard ability card
      const abilityCard = player.tempCard;
      player.tempCard = null;
      player.tempCardSource = null;
      room.discardPile.push(abilityCard);

      io.to(roomId).emit("cards-swapped", {
        playerId: socket.playerId,
        playerName: player.name,
        targetPlayerId,
        targetPlayerName: targetPlayer.name,
        myCardIndex,
        targetCardIndex,
      });

      io.to(roomId).emit("card-discarded", {
        playerId: socket.playerId,
        playerName: player.name,
        card: abilityCard,
        discardTop: abilityCard,
        action: "ability-swap",
      });

      emitRoomState(roomId, room);
      moveToNextPlayer(rooms, roomId);
    });

    // ── call-cabo ──────────────────────────────
    socket.on("call-cabo", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "playing") return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      const currentP = room.players[room.currentPlayerIndex];
      if (currentP?.id !== socket.playerId) {
        socket.emit("error", "You can only call Cabo on your turn");
        return;
      }

      if (player.tempCard) {
        socket.emit("error", "You cannot call Cabo after drawing a card");
        return;
      }

      if (room.caboCalledBy !== null) {
        socket.emit("error", "Cabo has already been called for this round");
        return;
      }

      room.caboCalledBy = socket.playerId;
      // All other players get exactly one final turn
      const otherPlayersCount = room.players.length - 1;
      room.turnsRemaining = otherPlayersCount;

      io.to(roomId).emit("cabo-called", {
        playerId: socket.playerId,
        playerName: player.name,
        turnsRemaining: otherPlayersCount,
      });

      // Advance turn immediately to next player
      // We pass room.turnsRemaining already set, but we don't decrement on the caller's transition
      room.currentPlayerIndex =
        (room.currentPlayerIndex + 1) % room.players.length;

      const nextP = room.players[room.currentPlayerIndex];

      io.to(roomId).emit("turn-changed", {
        currentPlayerId: nextP.id,
        currentPlayerName: nextP.name,
        turnsRemaining: room.turnsRemaining,
        gamePhase: room.gamePhase,
      });

      emitRoomState(roomId, room);
    });

    // ── player-ready ───────────────────────────
    socket.on("player-ready", ({ ready }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.playerId);
      if (!player) return;

      player.ready = !!ready;

      io.to(roomId).emit("player-ready-updated", {
        readyStates: room.players.reduce((acc, p) => {
          acc[p.id] = p.ready ?? false;
          return acc;
        }, {}),
      });

      // If room is in 'waiting' or 'roundEnd', and all players (min 2) are ready -> start game/round
      const allReady =
        room.players.length >= MIN_PLAYERS &&
        room.players.every((p) => p.ready);

      if (allReady && (room.gamePhase === "waiting" || room.gamePhase === "roundEnd")) {
        startGame(rooms, roomId);
      }
    });

    // ── restart-game ───────────────────────────
    socket.on("restart-game", () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || room.gamePhase !== "gameOver") return;

      // Reset all scores and states
      room.players.forEach((p) => {
        p.score = 0;
        p.hand = [];
        p.faceUpCards = {};
        p.seenPositions = new Set();
        p.ready = false;
        p.peekRemaining = 2;
        p.initialPeekDone = false;
        p.tempCard = null;
        p.tempCardSource = null;
      });

      room.gamePhase = "waiting";
      room.caboCalledBy = null;
      room.turnsRemaining = 0;

      emitRoomState(roomId, room);
    });

    // ── disconnect ─────────────────────────────
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (const [roomId, room] of rooms.entries()) {
        const idx = room.players.findIndex((p) => p.id === socket.id);
        if (idx !== -1) {
          const removedPlayer = room.players[idx];

          if (room.gamePhase === "waiting") {
            // Remove completely if still in waiting lobby
            room.players.splice(idx, 1);
            io.to(roomId).emit("player-left", {
              playerId: socket.id,
              playerName: removedPlayer.name,
            });
          } else {
            // In active game: mark player as offline so they can reconnect with 0 pts after round
            removedPlayer.isOffline = true;
            removedPlayer.disconnectedAt = Date.now();
            io.to(roomId).emit("player-offline", {
              playerId: socket.id,
              playerName: removedPlayer.name,
            });
          }

          if (room.hostId === socket.id) {
            const nextActive = room.players.find((p) => !p.isOffline && p.id !== socket.id);
            if (nextActive) {
              nextActive.isHost = true;
              room.hostId = nextActive.id;
            } else {
              room.hostId = null;
            }
          }

          // Check if all players in room are disconnected
          const activeCount = room.players.filter((p) => !p.isOffline).length;
          if (room.players.length === 0 || (room.gamePhase === "waiting" && activeCount === 0)) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          } else {
            if (room.gamePhase === "playing" || room.gamePhase === "peek") {
              // If the disconnecting player was the current player, advance turn
              if (idx === room.currentPlayerIndex) {
                moveToNextPlayer(rooms, roomId);
              }
            }
            emitRoomState(roomId, room);
          }
          break;
        }
      }
    });
  });
};

module.exports = { initSocket };