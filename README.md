# Dogfight

Authoritative multiplayer browser game built with HTML5 Canvas 2D, Node.js, and WebSocket. Players join rooms, pilot ships in real-time combat, and the server validates every input to prevent cheating.

## Project Overview

Dogfight is a real-time multiplayer space combat game. Players connect through a WebSocket to an authoritative Node.js server that runs a deterministic simulation at 30 Hz. Clients send inputs (thrust, turn, fire), never positions, so the server is the sole source of truth for ship locations, collisions, and scoring.

### How players interact

1. Open the game in a browser and click **Enable Audio & Start**.
2. Enter a player name and select a room from the lobby.
3. Pilot your ship with keyboard controls, shoot asteroids and missiles, and see other players' ships move in real time.
4. The server broadcasts snapshots 30 times per second; clients interpolate remote objects and predict local input for responsive feel.

### Multiplayer architecture

- **Client**: Renders the game loop with `requestAnimationFrame`, handles input, predicts local ship movement, interpolates remote entities, and displays HUD/netgraph.
- **Server**: Runs the authoritative simulation, validates inputs, resolves collisions, manages rooms, broadcasts snapshots, and handles chat.
- **Shared**: Deterministic simulation code, protocol schemas, binary codec (JSON or `DataView`), and seeded PRNG — identical on client and server.

## Features

### Implemented and verified

- **Multiplayer rooms** — Three rooms (Training Arena, Combat Zone, Survival) plus dynamic room creation via REST API.
- **Real-time player synchronization** — Server-authoritative snapshots at 30 Hz; clients see other players' positions updated every tick.
- **Server-authoritative simulation** — Clients send inputs only; the server computes all positions, collisions, and damage.
- **WebSocket communication** — Control-plane messages (join, chat, leave, ping/pong) always JSON; data-plane messages (input, snapshot) selectable as JSON or binary via `?codec=`.
- **Lobby and game interface** — Room list polled from `/api/rooms`, player name entry, in-game HUD with score and health.
- **Player movement and combat** — Thrust, rotate, fire bullets or homing missiles, weapon switching, asteroid collisions, damage/health system, respawn after destruction.
- **Chat** — Players can send chat messages that broadcast to all room participants.
- **Pickups** — Missile pickups increase missile supply; missiles home in on asteroids.
- **PWA support** — Web app manifest (`manifest.webmanifest`) and service worker (`sw.js`) for installation as a standalone app.
- **Reconnection handling** — Client reconnects with exponential backoff; server maintains connection lifecycle with ping/pong heartbeat and slow-client policy.
- **Production endpoints** — `/health`, `/ready`, `/metrics` for observability; graceful shutdown on `SIGTERM`/`SIGINT`.

### Not implemented

- Cross-device play has been tested locally (two browser tabs) but not on separate machines.
- Horizontal scaling requires sticky sessions or Redis pub/sub (single-process in-memory rooms).

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Client | JavaScript/TypeScript, HTML5 Canvas 2D, Vite | Game rendering, input, prediction, interpolation, lobby UI |
| Server | Node.js 24, native `http`, `ws` library | Authoritative simulation, WebSocket server, REST API, static file serving |
| Shared | TypeScript | Deterministic simulation, protocol schemas, binary codec, seeded PRNG |
| Build tooling | Vite, TypeScript (`tsc`), ESLint, Prettier | Client bundling, type checking, linting, formatting |
| Testing | Vitest (259 unit/property tests), Playwright (2 E2E tests) | Unit, property-based, and end-to-end testing |
| Docker | Multi-stage `node:22-alpine` build, non-root user | Containerized production deployment |
| CI/CD | GitHub Actions | TypeCheck, Lint, Test, Build, E2E on push; Release workflow on `v*` tags |

## Architecture

```
┌─────────────────┐      WebSocket (ws://)      ┌──────────────────┐
│   Browser       │ ◄─────────────────────────► │  Node.js Server  │
│  (Client)       │                             │   (Authoritative)│
│                 │                             │                  │
│ Canvas 2D Render│                             │  World.step()    │
│ Input Handling  │                             │  30 Hz tick      │
│ Prediction      │                             │  Collision       │
│ Interpolation   │                             │  RoomManager     │
│ HUD / Netgraph  │                             │  Metrics / Logs  │
└─────────────────┘                             └──────────────────┘
        ▲                                               ▲
        │                                               │
        │                                         Shared (TypeScript)
        │                              Simulation • Protocol • Codec
        │                                               │
        └───────────────────────────────────────────────┘
```

### Responsibilities

- **Client**: Renders at 60 Hz via `requestAnimationFrame`. Predicts local ship movement using the same `integrate` function as the server. Interpolates remote entities 100 ms into the past to smooth 30 Hz snapshots. Displays a netgraph overlay showing RTT, snapshot age, bytes/sec, and correction magnitude.
- **Server**: Runs `World.step()` at fixed `dt = 1/30` using an absolute timer. Validates every input (sequence number, rate limiting, payload size). Broadcasts snapshots to room participants. Manages room lifecycle (create, join, leave, empty cleanup). Writes NDJSON match logs via Node.js streams.
- **Shared**: Pure TypeScript simulation with no DOM/Node dependencies. Seeded PRNG (`mulberry32`) ensures deterministic results. Branded types (`EntityId`, `Tick`, `Seq`, `Radians`) prevent accidental value mixing. Discriminated unions for entity snapshots with exhaustiveness checking.

### WebSocket message flow

Control plane (always JSON): `join`, `joined`, `roster`, `chat`, `leave`, `ping`, `pong`, `error`, `shutdown`.

Data plane (JSON or binary): `input` (client→server), `snapshot` (server→client). Binary mode uses `DataView` with little-endian encoding and quantized angles (~3.6× smaller snapshots, ~8× smaller inputs).

### Production serving

In production (`NODE_ENV=production`), the server serves the compiled client bundle from `client/dist`. In development, Vite proxies `/api` and `/ws` to the Node.js server on port 3000.

## Screenshots

No screenshots are currently committed to the repository. The `docs/screenshots/` directory contains Lab 03 failure-gallery images (404-sprite, abort-mid-load, corrupt-json, network-timeout) that demonstrate asset-loading error handling, not gameplay.

## Getting Started

### Prerequisites

- Node.js 24 or compatible
- npm

### Install dependencies

```bash
npm install
```

### Development mode

Start the client dev server (Vite on port 5173):

```bash
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to the Node.js server. Start the server separately:

```bash
node --env-file=.env server/src/index.js
```

Or without `.env`:

```bash
node server/src/index.js
```

Open `http://localhost:5173/` in your browser.

### Production build

```bash
npm run build
```

This builds `shared`, `server`, and `client` workspaces. The client bundle is written to `client/dist/` and served by the Node.js server in production mode.

### Running tests

Unit and property-based tests (Vitest):

```bash
npm test
```

Result: **259 tests pass across 28 files** (89.23% statement coverage).

End-to-end tests (Playwright, requires running server and client):

```bash
npx playwright test
```

> **Known limitation**: The multiplayer E2E movement assertion currently fails locally and in CI. All other CI jobs (TypeCheck, Lint, Test, Build) pass.

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Formatting check

```bash
npm run format:check
```

### Docker Compose

```bash
docker compose up --build
```

The server is available at `http://localhost:3000`. The container runs as a non-root user (`nodejs:1001`) with a healthcheck on `/health`.

### Environment variables

See `.env.example` for the full list. Key variables:

- `PORT` — Server listen port (default: 3000)
- `NODE_ENV` — `development` \| `production` \| `test` (default: `development`)
- `LOG_LEVEL` — `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` (default: `info`)
- `LOG_DIR` — Directory for NDJSON match logs (default: `./logs`)
- `ALLOWED_ORIGINS` — Comma-separated allowed WebSocket origins (default: `*`)
- `MAX_CONNECTIONS_PER_IP` — Max concurrent connections per IP (default: 50)
- `MAX_ROOMS` — Max rooms on server (default: 100)
- `MAX_PLAYERS_PER_ROOM` — Max players per room (default: 8)

## Testing

| Check | Status | Details |
|-------|--------|---------|
| Unit/property tests (Vitest) | Pass | 259 tests, 28 files, 89.23% statement coverage |
| E2E tests (Playwright) | Known failure | Smoke test passes; multiplayer movement assertion fails |
| TypeScript typecheck | Pass | All packages (`shared`, `server`, `client`) |
| ESLint | Pass on source | Pre-existing errors only in unrelated local state |
| Prettier format check | Pre-existing warnings | No formatting errors in source files |
| Production build | Pass | ~138 kB client bundle (gzip ~41 kB) |

## Production / Docker

### Docker build

Multi-stage Dockerfile using `node:22-alpine`:

- **Stage 1**: Build shared, server, and client workspaces.
- **Stage 2**: Run only with production dependencies, non-root user (`nodejs:1001`), exec-form CMD, HEALTHCHECK on `/health`.

### Verified endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness: `{ status, version, timestamp }` |
| `/ready` | Readiness: `{ ready, version, timestamp }` |
| `/metrics` | JSON metrics: players, rooms, msg/s, bytes/s, tick p99, RSS |

### Image size

Locally verified at approximately **261 MB**.

> Local Docker verification is complete. Public deployment and GHCR publishing have not yet been successfully verified.

## CI/CD and Release Status

GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`): Runs on every push and pull request. Jobs: TypeCheck, Lint, Test, Build, E2E. TypeCheck, Lint, Test, and Build pass. E2E has a known movement assertion failure.
- **Release** (`.github/workflows/release.yml`): Triggers on `v*` tags. Builds the Docker image and publishes to GHCR (`ghcr.io/ya-sa-29/dogfight`). Passes the tag name as `BUILD_VERSION` so the runtime version stamp reflects the released tag.

### Current status

- CI's TypeCheck, Lint, Test, and Build jobs pass.
- E2E has a known movement assertion failure — the pipeline is not fully green.
- No `v1.0.1` tag exists; GHCR publishing has not yet been successfully verified.
- No public production deployment or WSS URL is currently available.

## Limitations and Future Work

- **Cross-device multiplayer**: Tested locally with two browser tabs; not yet tested on separate machines or networks.
- **E2E movement test**: The multiplayer E2E movement assertion fails locally and in CI. Investigation needed.
- **GHCR release publication**: The release workflow is configured but has not yet produced a published image.
- **Public deployment**: No production deployment, WSS URL, or uptime monitoring is configured.
- **Horizontal scaling**: Single-process in-memory rooms; scaling requires sticky sessions or Redis pub/sub.

## Project History

Dogfight was developed incrementally as a sequence of educational JavaScript laboratory assignments (Labs 01–08), progressing from a basic game loop to a production-ready multiplayer game with TypeScript, testing, CI/CD, Docker, observability, and PWA support. Lab documentation is retained in the repository root (`lab-*.md` files) for historical reference.