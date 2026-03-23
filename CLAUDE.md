# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YearBook is a BSV blockchain demo app — an on-chain yearbook that anyone can sign. It uses Runar smart contracts on the BSV overlay network, with a React frontend and a TypeScript backend. Deployed via Docker/docker-compose, targeting Kubernetes via Flux (see bsva-infra-flux).

## Commands

```bash
# Local development with Docker
npm run dev            # docker compose up --build (frontend + backend + MongoDB + MySQL)
npm run dev:down       # docker compose down
npm run dev:clean      # docker compose down -v (removes DB data)

# Frontend dev without Docker
npm run frontend:dev   # cd frontend && npm run start (webpack-dev-server on port 5173)

# Backend
cd backend
npm run compile        # Compile Runar contract (tsx src/contracts/compile.ts)
npm run build          # TypeScript compile (tsc -b)
npm run start          # Run overlay server (node dist/esm/src/server.js)
npm test               # Build then run Jest tests
npm run lint           # ts-standard --fix on src/**/*.ts

# Frontend
cd frontend
npm run start          # prebuild (copy artifact) + webpack-dev-server
npm run build          # prebuild (copy artifact) + webpack production build

# Docker
docker compose build   # Build both images
docker compose up      # Run all services
```

## Architecture

**Monorepo** with two packages: `backend/` and `frontend/`. Orchestrated via docker-compose for local dev. Images published to GHCR for Kubernetes deployment.

### Backend (`backend/`)

BSV Overlay Service — ESM TypeScript package. Library entry point: `mod.ts`. Server entry point: `src/server.ts`.

- **Smart Contract** (`src/contracts/YearBook.runar.ts`): Runar `StatefulSmartContract` with `creatorIdentityKey` (PubKey, readonly) and 10 `friend` fields (`friend1`–`friend10`, ByteString). Constructor takes `creatorIdentityKey` and `entryCount`. Exposes `sign(message, publicKey, signature)` to fill the next empty friend slot, and `burn(signature)` to let the creator destroy it. Compiled via `src/contracts/compile.ts` to `artifacts/YearBook.runar.json`.
- **Topic Manager** (`src/topic-managers/YearBookTopicManager.ts`): Registered as `tm_yearbook`. Validates transactions by extracting state from locking scripts via Runar's `extractStateFromScript()` and checking for valid `creatorIdentityKey` and `entryCount` fields.
- **Lookup Service** (`src/lookup-services/`): Registered as `ls_yearbook`, uses MongoDB. `YearBookLookupServiceFactory.ts` is a factory `(db: Db) => YearBookLookupService`. `YearBookStorage.ts` handles CRUD against a `YearBookRecords` MongoDB collection. Supports `findAll` queries returning UTXO references.
- **Server** (`src/server.ts`): HTTP entrypoint using `OverlayExpress` from `@bsv/overlay-express`. Registers topic manager + lookup service, connects to MongoDB and MySQL (Knex), configures ARC broadcaster and ChainTracks, and listens on `PORT` (default 8080).
- **ChainTracksClient** (`src/ChainTracksClient.ts`): `ChainTracker` implementation that calls a ChainTracks REST API to validate merkle roots and get current block height.

### Frontend (`frontend/`)

React 18 SPA bundled with Webpack. Uses MUI v5 for UI (dark theme). Single-page app in `src/App.tsx`. Served via nginx in Docker (port 8080, mapped to 5173 in docker-compose).

- Connects to a BSV wallet via `WalletClient` from `@bsv/sdk`
- Creates yearbooks by constructing `RunarContract` instances, signing with the wallet, and broadcasting via `SHIPBroadcaster`
- Fetches existing yearbooks via `LookupResolver` querying `ls_yearbook`, parses state with `extractStateFromScript`
- Signing uses `RunarContract.fromUtxo()` to reconstruct contract state, `buildUnlockingScript('sign', [])` for the unlocking script, and broadcasts updated transactions
- Displays friend messages decoded from hex, shows slot usage (X/10 signatures), share links, and a "FULL" badge when all 10 slots are taken
- `NETWORK_PRESET` constant in `App.tsx` controls local vs mainnet
- Artifact (`YearBook.runar.json`) copied from backend via `prebuild` script

### Key BSV SDK Patterns

- Transactions use BEEF / Atomic BEEF for SPV
- Broadcasting goes through `SHIPBroadcaster` targeting topic `tm_yearbook`
- Lookups go through `LookupResolver` targeting service `ls_yearbook`
- Runar contracts: `new RunarContract(artifact, [args])` to create, `RunarContract.fromUtxo(artifact, utxo)` to reconstruct, `extractStateFromScript(artifact, hex)` to read state

### Docker / Deployment

- `backend/Dockerfile`: Multi-stage Node 20 build — compiles Runar contract, builds TS, runs server on port 8080
- `frontend/Dockerfile`: Multi-stage — webpack build (build context is repo root to access backend artifact), then nginx serving on port 8080
- `docker-compose.yml`: 4 services — `mongodb` (mongo:8), `mysql` (mysql:8), `yearbook-back` (port 8080), `yearbook-front` (port 5173 -> 8080)
- K8s deployment via Flux in separate bsva-infra-flux repo (GHCR images, Kustomize overlays)

## Dependencies

- `@bsv/sdk` — BSV blockchain SDK (transactions, wallets, broadcasting, lookups)
- `@bsv/overlay` — Overlay network interfaces (TopicManager, LookupService)
- `@bsv/overlay-express` — HTTP server wrapper for overlay engine
- `runar-lang` / `runar-compiler` / `runar-sdk` — Runar smart contract framework
- `mongodb` — Lookup service storage backend
- `mysql2` — Required by overlay-express for Knex-based internal state
