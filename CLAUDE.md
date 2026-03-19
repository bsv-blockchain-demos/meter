# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meter is a BSV blockchain demo app — an on-chain counter that can be incremented and decremented. It uses Runar smart contracts on the BSV overlay network, with a React frontend and a TypeScript backend. Deployed via Docker/docker-compose, targeting Kubernetes via Flux (see bsva-infra-flux).

## Commands

```bash
# Local development with Docker
npm run dev            # docker compose up --build (frontend + backend + MongoDB)
npm run dev:down       # docker compose down
npm run dev:clean      # docker compose down -v (removes MongoDB data)

# Frontend dev without Docker
npm run frontend:dev   # cd frontend && npm run start (webpack-dev-server on port 8090)

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

- **Smart Contract** (`src/contracts/Counter.runar.ts`): Runar `StatefulSmartContract` with `count` (bigint), `creatorIdentityKey`, and `creatorSignature` state fields. Exposes `increment()` and `decrement()` public methods. Compiled via `src/contracts/compile.ts` to `artifacts/Counter.runar.json`.
- **Topic Manager** (`src/topic-managers/MeterTopicManager.ts`): Registered as `tm_meter`. Validates transactions by extracting state from locking scripts via Runar's `extractStateFromScript()` and verifying the creator's signature via `ProtoWallet('anyone')`.
- **Lookup Service** (`src/lookup-services/`): Registered as `ls_meter`, uses MongoDB. `MeterLookupServiceFactory.ts` is a factory `(db: Db) => MeterLookupService`. `MeterStorage.ts` handles CRUD against a `MeterRecords` MongoDB collection. Supports `findAll` queries returning UTXO references.
- **Server** (`src/server.ts`): HTTP entrypoint that creates an `@bsv/overlay` Engine, registers topic manager + lookup service, connects to MongoDB, and listens on `PORT` (default 3001).

### Frontend (`frontend/`)

React 18 SPA bundled with Webpack. Uses MUI v5 for UI. Single-page app in `src/App.tsx`. Served via nginx in Docker (port 8080).

- Connects to a BSV wallet via `WalletClient` from `@bsv/sdk`
- Creates meters by constructing `RunarContract` instances, signing with the wallet, and broadcasting via `SHIPBroadcaster`
- Fetches existing meters via `LookupResolver` querying `ls_meter`, parses state with `extractStateFromScript`
- Increment/decrement uses `RunarContract.fromUtxo()` to reconstruct contract state, `buildUnlockingScript()` for the unlocking script, and broadcasts updated transactions
- `NETWORK_PRESET` constant in `App.tsx` controls local vs mainnet
- Artifact (`Counter.runar.json`) copied from backend via `prebuild` script

### Key BSV SDK Patterns

- Transactions use BEEF / Atomic BEEF for SPV
- Broadcasting goes through `SHIPBroadcaster` targeting topic `tm_meter`
- Lookups go through `LookupResolver` targeting service `ls_meter`
- Creator identity verified with `ProtoWallet('anyone').verifySignature()` using protocol `[0, 'meter']`, keyID `'1'`
- Runar contracts: `new RunarContract(artifact, [args])` to create, `RunarContract.fromUtxo(artifact, utxo)` to reconstruct, `extractStateFromScript(artifact, hex)` to read state

### Docker / Deployment

- `backend/Dockerfile`: Multi-stage Node 20 build — compiles Runar contract, builds TS, runs server
- `frontend/Dockerfile`: Multi-stage — webpack build, then nginx serving on port 8080
- `docker-compose.yml`: 3 services — `mongodb` (mongo:6), `meter-back` (port 3001), `meter-front` (port 8080)
- K8s deployment via Flux in separate bsva-infra-flux repo (GHCR images, Kustomize overlays)

## Dependencies

- `@bsv/sdk` — BSV blockchain SDK (transactions, wallets, broadcasting, lookups)
- `@bsv/overlay` — Overlay network interfaces (TopicManager, LookupService, Engine)
- `runar-lang` / `runar-compiler` / `runar-sdk` — Runar smart contract framework
- `mongodb` — Lookup service storage backend
