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

#### Backend Configuration Options

The backend server supports the following command-line flags:

```bash
# Run with custom network address
go run cmd/server.go -addr :9000

# Run with verbose logging
go run cmd/server.go -verbose

# Run with custom tick interval (in milliseconds, default is 50ms = 20Hz)
go run cmd/server.go -tick-interval 100  # 10Hz

# Run with custom maximum game session length (in ticks, default is 100000)
go run cmd/server.go -max-ticks 6000     # 5 minutes at 20Hz

# All options can be combined
go run cmd/server.go -addr :9000 -verbose -tick-interval 100 -max-ticks 6000
```

#### Using the Convenience Script

A convenience script is provided to run the server with different presets:

```bash
# Run with default settings (20Hz, ~30 mins)
./backend/scripts/run_server.sh

# Run a quick game (20Hz, 5 mins)
./backend/scripts/run_server.sh quick

# Run a slow game (10Hz, ~30 mins)
./backend/scripts/run_server.sh slow

# Run a fast game (40Hz, ~30 mins)
./backend/scripts/run_server.sh fast

# Run a test game (20Hz, 1 min) with verbose logging
./backend/scripts/run_server.sh test

# Show help
./backend/scripts/run_server.sh --help
```

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
