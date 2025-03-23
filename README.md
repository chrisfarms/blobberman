# Blobberman

A massively multiplayer, paint-splashing twist on the classic Bomberman formula.

## Project Overview

Blobberman is a fast-paced, massively multiplayer competitive game where players battle for paint dominance in a shared arena. The game uses a deterministic lockstep networking architecture, where all game clients compute the game state independently based on shared input data.

The game simulates movement in a 2D grid but renders with a 3D isometric perspective using Three.js and React Three Fiber.

## Project Structure

- `./frontend` - React/Three.js game client (TypeScript)
- `./backend` - Go WebSocket relay server

## Getting Started

### Environment Configuration

The frontend uses environment variables to configure the WebSocket connection:

```bash
# In frontend/.env.local (create if it doesn't exist)
VITE_WS_URL=ws://localhost:8080/ws  # For local development
```

For production deployments, the WebSocket URL can be set in `frontend/.env.production`.

### Running the Backend

```bash
cd backend
go run cmd/server.go
```

The server will start on port 8080 by default.

### Running the Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend development server will start on port 3000 by default.

## Architecture

- **Deterministic Lockstep**: The game uses a deterministic lockstep architecture where all game clients compute the game state independently.
- **Input Relay**: The backend server acts only as a relay for player inputs, not calculating game state.
- **WebSockets**: Communication between client and server uses WebSockets for low-latency updates.
- **3D Rendering**: The game is rendered in 3D using Three.js and React Three Fiber, with a top-down/slightly isometric perspective.

## Technology Stack

- **Frontend**: TypeScript, React, Three.js, React Three Fiber, NippleJS
- **Backend**: Go, WebSockets
- **Build Tools**: Vite, pnpm
