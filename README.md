# Cabo Multiplayer Card Game

A real-time multiplayer implementation of the Cabo card game built with Next.js, React, Tailwind CSS, and Socket.IO. The application features memory mechanics, strategic card swaps, reconnection resilience, and customizable match configurations.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Game Rules & Card Pool](#game-rules--card-pool)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Environment Variables](#environment-variables)
7. [Local Development](#local-development)
8. [Deployment Guide](#deployment-guide)
   - [Deploy Backend to Render](#deploy-backend-to-render)
   - [Deploy Frontend to Vercel](#deploy-frontend-to-vercel)
9. [Socket.IO Events](#socketio-events)
10. [License](#license)

---

## Overview

Cabo is a strategic card game of memory, bluffing, and risk management. Players are dealt four face-down cards and can privately view two cards during an initial peek phase. The objective is to achieve the lowest cumulative card value in hand before anyone calls "CABO".

---

## Key Features

- Real-Time Multiplayer: Seamless room-based multiplayer powered by Socket.IO supporting 2 to 8 players.
- Reconnection Protection: Unique session token stored in browser storage and cookies allows disconnected players to instantly rejoin their active match with private hand state intact.
- AFK and Idle Turn Protection: Inactive players receive a 10-second countdown confirmation modal after 30 seconds of inactivity on their turn; unanswered prompts automatically skip their turn and mark the player as AFK.
- Fair Scoring for Disconnected Players: Disconnected players who reconnect after a round end or Cabo call receive 0 points for that round to prevent unfair scoring penalties.
- Encrypted and Obfuscated Room Links: URLs utilize reversible token keys (`cabo_s_...` and `cabo_i_...`) so room codes, player names, and query parameters are never exposed in plain text.
- Match Targets and Modes: Configurable round formats supporting Cumulative Score Target (50 to 500 points, default: 100 points) or Fixed Rounds (1 to 5 rounds, default: 1 round).
- Dynamic Card Pool: Automatic card pool scaling between 1st Edition (52 cards for 2-4 players) and 2nd Edition (70 cards for 5+ players).
- Internationalization: Native multi-language support (Bahasa Indonesia and English) with centralized locale dictionaries.
- Adaptive Theme: High-contrast Dark theme and Inverted Light theme adhering to a strict four-color design system.

---

## Game Rules & Card Pool

### Objective
Hold the lowest hand total at the end of the round. The overall game concludes when a player reaches the target cumulative score (default 100 points) or when target rounds finish.

### Card Pool Distribution

#### 1st Edition (52-Card Pool, recommended for 2 to 4 players)
- 0 (2 cards): Lowest value card.
- 1 to 6 (4 cards each, 24 total): Plain numeric cards without special abilities.
- 7 & 8 (4 cards each, 8 total): Peek Ability (inspect 1 card from your own hand).
- 9 & 10 (4 cards each, 8 total): Spy Ability (inspect 1 card from any opponent's hand).
- 11 & 12 (4 cards each, 8 total): Swap Ability (blindly swap 1 card from your hand with 1 card from an opponent's hand).
- 13 (2 cards): Highest value Cabo card.

#### 2nd Edition (70-Card Pool, recommended for 5 to 8 players)
- 0 (2 cards): Lowest value card.
- 1 to 6 (4 cards each, 24 total): Plain numeric cards.
- 7 & 8 (6 cards each, 12 total): Peek Ability.
- 9 & 10 (6 cards each, 12 total): Spy Ability.
- 11 & 12 (6 cards each, 12 total): Swap Ability.
- 13 (8 cards): Highest value Cabo card.

### Turn Sequence
On a player's turn, they choose one of three actions:
1. Draw from Draw Pile: Privately inspect the drawn card. Swap it with any card in hand, discard it directly, or activate its ability if values 7 through 12.
2. Draw from Discard Pile: Take the face-up discard card and swap it with a card in hand (the swapped card remains face up).
3. Call Cabo: Before drawing, if the player believes their hand has the lowest total. Every opponent receives one final turn, after which all hands are revealed.

### Scoring
- If the Cabo caller holds the lowest score (or tied lowest), the caller scores 0 points.
- If another player holds an equal or lower score than the Cabo caller, the caller receives a 10-point penalty in addition to their hand score.
- All opponents add their revealed hand card values to their cumulative score.

---

## Tech Stack

- Frontend: Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion, Lucide React
- Backend: Node.js, Express, Socket.IO
- State and Storage: React Context, LocalStorage, Document Cookies

---

## Project Structure

```
cabo-app/
├── server/
│   ├── server.js          # Express and HTTP server entry point
│   ├── socket.js          # Authoritative Socket.IO game logic
│   └── package.json       # Backend dependencies
├── src/
│   ├── app/
│   │   ├── layout.jsx     # Root layout with context providers
│   │   ├── page.jsx       # Landing page (create/join room, session recovery)
│   │   └── game/[roomId]/ # Game room route (supports encrypted token URLs)
│   ├── components/
│   │   ├── Card.jsx       # Animated card component
│   │   └── GameBoard.jsx  # Primary game arena and HUD
│   ├── contexts/
│   │   ├── LanguageContext.jsx
│   │   ├── SocketContext.jsx
│   │   └── ThemeContext.jsx
│   ├── locales/
│   │   ├── id.js          # Indonesian dictionary
│   │   └── en.js          # English dictionary
│   └── utils/
│       ├── sessionCrypto.js   # URL token encryption and decryption
│       └── sessionStorage.js  # LocalStorage and Cookie session persistence
├── .env.example           # Example environment variables
├── .gitignore             # Git ignore configuration
├── package.json           # Frontend dependencies and scripts
└── vercel.json            # Vercel framework configuration
```

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
# Frontend (Next.js)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Backend (Express / Socket.IO)
PORT=3001
CLIENT_URL=http://localhost:3000
```

---

## Local Development

### Prerequisites
- Node.js version 18.0.0 or higher
- npm or yarn package manager

### 1. Install Dependencies
Install dependencies in both the root directory and the server directory:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Run Backend Server
In your first terminal:

```bash
cd server
npm run dev
```
The Socket.IO server will start on `http://localhost:3001`.

### 3. Run Frontend Development Server
In your second terminal:

```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Deployment Guide

For optimal reliability and persistent WebSocket connections, deploy the backend Socket.IO server to Render and the frontend application to Vercel.

### Deploy Backend to Render

1. Create a Render Account at render.com.
2. In the Render Dashboard, click New + and select Web Service.
3. Connect your GitHub or GitLab repository containing the Cabo codebase.
4. Configure the Web Service settings:
   - Name: `cabo-socket-server` (or your preferred name)
   - Region: Choose the region closest to your primary user base (e.g., Singapore for Southeast Asia)
   - Branch: `main`
   - Root Directory: `server`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Configure Environment Variables in the Environment tab:
   - `PORT`: `3001` (or leave default, Render sets PORT automatically)
   - `CLIENT_URL`: `https://your-cabo-frontend.vercel.app` (your Vercel production URL)
6. Health Check Path:
   - Set Health Check Path to `/health`
7. Click Create Web Service. Once deployment completes, copy your Render service URL (e.g., `https://cabo-socket-server.onrender.com`).

### Deploy Frontend to Vercel

1. Create a Vercel Account at vercel.com.
2. In the Vercel Dashboard, click Add New > Project.
3. Import your Cabo git repository.
4. Configure Project Settings:
   - Framework Preset: `Next.js`
   - Root Directory: `./` (leave default)
   - Build Command: `next build` (leave default)
   - Output Directory: `.next` (leave default)
5. Configure Environment Variables in the Environment Variables section:
   - Key: `NEXT_PUBLIC_SOCKET_URL`
     Value: `https://cabo-socket-server.onrender.com` (your Render backend URL from the previous step)
   - Key: `NEXT_PUBLIC_APP_URL`
     Value: `https://your-cabo-frontend.vercel.app` (your Vercel project domain)
6. Click Deploy.
7. After deployment finishes, update the `CLIENT_URL` environment variable on Render if your Vercel URL changed, and trigger a redeployment on Render if necessary.

---

## Socket.IO Events

### Client to Server
- `join-room`: Join room with `{ roomId, playerName, gameMode, sessionToken }`.
- `player-ready`: Set ready state in waiting lobby or round transition.
- `peek-initial-card`: Peek at 1 of the 2 initial cards during initial peek phase.
- `skip-initial-peek`: Skip remaining initial peeks and mark self ready.
- `draw-card`: Draw from `deck` or `discard`.
- `swap-card`: Swap drawn card with a hand card slot.
- `discard-drawn-card`: Discard drawn card without swapping.
- `use-ability`: Activate Peek, Spy, or Swap ability.
- `execute-peek`: Execute Peek on a selected hand index.
- `execute-spy`: Execute Spy on a selected opponent card.
- `execute-swap`: Execute Swap between player card and opponent card.
- `call-cabo`: Call Cabo on current turn.
- `set-round-mode`: Configure `{ roundMode, targetRounds, targetScore }`.
- `set-game-mode`: Set mode to `classic` or `endless`.
- `set-deck-edition`: Set pool to `auto`, `first` (52), or `second` (70).
- `set-timer-config`: Set timer duration for initial or ability peeks.
- `player-idle-timeout`: Emit when local 30s idle + 10s countdown expires.
- `resume-from-afk`: Emit when returning from AFK state.
- `restart-game`: Reset scores and restart match from game over screen.

### Server to Client
- `game-state`: Full public state synchronization.
- `player-joined`: Notification of a new player joining.
- `player-reconnected`: Broadcast when a player reconnects.
- `player-reconnected-state`: Private hand and draw state sent to reconnected client.
- `player-afk-status`: Broadcast player AFK state changes.
- `turn-skipped`: Broadcast when an AFK player's turn is skipped.
- `player-offline`: Broadcast when a player disconnects during an active game.
- `turn-changed`: Active player turn update and remaining turns.
- `card-drawn`: Emitted to active player with card value and ability.
- `player-drew-card`: Broadcast to opponents with draw source.
- `card-discarded`: Discard pile update broadcast.
- `card-peeked`: Private card revelation for Peek ability or initial peek.
- `card-spied`: Opponent card revelation for Spy ability.
- `cards-swapped`: Notification of completed swap.
- `cabo-called`: Alert broadcast when Cabo is called.
- `round-ended`: Round summary, revealed hands, and score calculations.
- `game-over`: Final game results, rankings, and winner identification.
- `error`: Error message string or object.

---

## License

This project is licensed under the MIT License.
