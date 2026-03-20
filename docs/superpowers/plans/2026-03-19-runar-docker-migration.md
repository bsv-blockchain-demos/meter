# Meter: sCrypt-to-Runar + Docker Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sCrypt smart contracts with Runar, and replace CARS/LARS deployment tooling with standard Dockerfiles + docker-compose for local dev and Kubernetes deployment.

**Architecture:** The app keeps its monorepo structure with `backend/` (overlay service) and `frontend/` (React SPA). The sCrypt contract + artifact system is replaced with Runar's compiler + `RunarContract` SDK. The CARS/LARS tooling is replaced with a `docker-compose.yml` that runs frontend, backend, and MongoDB locally. Dockerfiles produce images publishable to GHCR for the Flux-based K8s deployment in `bsva-infra-flux`.

**Tech Stack:** Runar (runar-lang, runar-compiler, runar-sdk), @bsv/sdk, @bsv/overlay, MongoDB, React 18, MUI 5, Webpack, Docker, docker-compose, nginx (frontend prod serving)

---

## File Map

### Files to Create

| Path | Purpose |
|------|---------|
| `backend/src/contracts/Counter.runar.ts` | Runar counter contract source |
| `backend/src/contracts/compile.ts` | Script to compile `.runar.ts` → artifact JSON |
| `backend/src/server.ts` | HTTP server entrypoint wrapping overlay engine |
| `backend/Dockerfile` | Multi-stage Node build for backend overlay service |
| `backend/.dockerignore` | Exclude node_modules, dist from backend builds |
| `frontend/Dockerfile` | Multi-stage build: webpack → nginx static serve |
| `frontend/nginx.conf` | nginx config for SPA routing |
| `frontend/.dockerignore` | Exclude node_modules, build from frontend builds |
| `docker-compose.yml` | Local dev: frontend + backend + MongoDB |

### Files to Modify

| Path | What Changes |
|------|-------------|
| `backend/package.json` | Replace scrypt-ts deps with runar-lang, runar-compiler, runar-sdk. Add compile script. Remove scrypt-cli. |
| `backend/mod.ts` | Export Runar artifact + contract helpers instead of sCrypt |
| `backend/src/topic-managers/MeterTopicManager.ts` | Replace `MeterContract.fromLockingScript` with `RunarContract.fromUtxo` / `extractStateFromScript` |
| `backend/src/lookup-services/MeterLookupServiceFactory.ts` | Same: replace sCrypt deserialization with Runar |
| `backend/src/lookup-services/MeterStorage.ts` | No changes needed (pure MongoDB CRUD) |
| `backend/src/types.ts` | No changes needed |
| `backend/src/topic-managers/MeterTopicDocs.md.ts` | Update docs text (sCrypt → Runar) |
| `frontend/package.json` | Remove scrypt-ts deps, add runar-compiler + runar-sdk |
| `frontend/tsconfig.json` | Remove `../backend/src/contracts` from include array |
| `frontend/src/App.tsx` | Replace all sCrypt contract usage with Runar SDK |
| `frontend/src/types/types.d.ts` | Remove `declare module 'react-toastify'` (outdated), keep Token/Meter |
| `package.json` | Replace lars/cars scripts with docker-compose commands |

### Files to Delete

| Path | Reason |
|------|--------|
| `backend/artifacts/Meter.json` | sCrypt compiled artifact — replaced by Runar artifact |
| `backend/artifacts/Meter.transformer.json` | sCrypt transformer artifact |
| `backend/src/contracts/Meter.ts` | sCrypt contract — replaced by Counter.runar.ts |
| `backend/src/script-templates/` | sCrypt template directory — Runar doesn't use these |
| `backend/scrypt.index.json` | sCrypt index |
| `backend/tsconfig-scryptTS.json` | sCrypt-specific tsconfig |
| `deployment-info.json` | CARS deployment manifest — replaced by Docker/K8s |

---

## Task 1: Set Up Runar Contract + Compilation

**Files:**
- Create: `backend/src/contracts/Counter.runar.ts`
- Create: `backend/src/contracts/compile.ts`
- Modify: `backend/package.json`
- Delete: `backend/src/contracts/Meter.ts`, `backend/artifacts/Meter.json`, `backend/artifacts/Meter.transformer.json`, `backend/scrypt.index.json`, `backend/tsconfig-scryptTS.json`

- [ ] **Step 1: Create the Runar counter contract**

Create `backend/src/contracts/Counter.runar.ts`:

```typescript
import { StatefulSmartContract, assert } from 'runar-lang'

export class Counter extends StatefulSmartContract {
  count: bigint
  creatorIdentityKey: ByteString
  creatorSignature: ByteString

  constructor(count: bigint, creatorIdentityKey: ByteString, creatorSignature: ByteString) {
    super(count, creatorIdentityKey, creatorSignature)
    this.count = count
    this.creatorIdentityKey = creatorIdentityKey
    this.creatorSignature = creatorSignature
  }

  public increment() {
    this.count++
  }

  public decrement() {
    assert(this.count > 0n)
    this.count--
  }
}
```

Note: The original sCrypt contract allowed decrement below zero. Runar's counter example adds an assert. Preserve this guard — decrementing below 0 is likely a bug in the original.

- [ ] **Step 2: Create the compile script**

Create `backend/src/contracts/compile.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { compile } from 'runar-compiler'

const source = readFileSync(new URL('./Counter.runar.ts', import.meta.url), 'utf-8')
const result = compile(source, { fileName: 'Counter.runar.ts' })

if (!result.success) {
  const errors = result.diagnostics
    .filter((d: any) => d.severity === 'error')
    .map((d: any) => `  ${d.message} (${d.loc?.line}:${d.loc?.column})`)
    .join('\n')
  console.error(`Compilation failed:\n${errors}`)
  process.exit(1)
}

mkdirSync(new URL('../../artifacts', import.meta.url), { recursive: true })
writeFileSync(
  new URL('../../artifacts/Counter.runar.json', import.meta.url),
  JSON.stringify(result.artifact, null, 2)
)
console.log(`Compiled: ${result.artifact.contractName}`)
```

- [ ] **Step 3: Update backend/package.json dependencies**

Remove from `dependencies`: `scrypt-ts`, `scrypt-ts-lib`
Remove from `devDependencies`: `scrypt-cli`
Add to `dependencies`: `runar-lang`, `runar-compiler`, `runar-sdk`

Update scripts:
- Replace `"compile": "scrypt-cli c"` with `"compile": "tsx src/contracts/compile.ts"`
- Add `tsx` to devDependencies for running the compile script

Note: Pin Runar package versions after confirming actual published names on npm. The GitHub repo is `icellan/runar` — packages may be scoped (e.g. `@runar/sdk`). Check npm and adjust accordingly. The `knex` dependency is removed — only MongoDB is used.

```json
{
  "dependencies": {
    "@bsv/overlay": "^0.5.2",
    "@bsv/sdk": "^1.8.11",
    "mongodb": "^6.11.0",
    "runar-lang": "^0.1.0",
    "runar-compiler": "^0.1.0",
    "runar-sdk": "^0.1.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "ts-standard": "^12.0.2",
    "ts2md": "^0.2.0",
    "tsconfig-to-dual-package": "^1.2.0",
    "tsx": "^4.7.0",
    "typescript": "^5.2.2"
  }
}
```

- [ ] **Step 4: Delete sCrypt files**

```bash
rm backend/src/contracts/Meter.ts
rm backend/artifacts/Meter.json
rm backend/artifacts/Meter.transformer.json
rm backend/scrypt.index.json
rm backend/tsconfig-scryptTS.json
rm -rf backend/src/script-templates
```

- [ ] **Step 5: Run compile and verify artifact is generated**

```bash
cd backend && npm install && npm run compile
```

Expected: `artifacts/Counter.runar.json` is created, console prints `Compiled: Counter`

- [ ] **Step 6: Commit**

```bash
git add -A backend/src/contracts/ backend/artifacts/ backend/package.json backend/package-lock.json
git commit -m "feat: replace sCrypt contract with Runar counter contract"
```

---

## Task 2: Migrate Backend Overlay Services to Runar

**Files:**
- Modify: `backend/mod.ts`
- Modify: `backend/src/topic-managers/MeterTopicManager.ts`
- Modify: `backend/src/lookup-services/MeterLookupServiceFactory.ts`
- Modify: `backend/src/topic-managers/MeterTopicDocs.md.ts`

- [ ] **Step 1: Update mod.ts exports**

Replace the file contents with:

```typescript
export { default as CounterArtifact } from './artifacts/Counter.runar.json' with { type: 'json' }
export { default as MeterLookupServiceFactory } from './src/lookup-services/MeterLookupServiceFactory.js'
export { default as MeterTopicManager } from './src/topic-managers/MeterTopicManager.js'
export * from './src/types.js'
```

Note: The original `mod.ts` had a bug — it exported the docs string file as `MeterTopicManager` instead of the actual class. This is fixed here. The sCrypt-specific exports (`MeterContract`, `MeterTemplate`) are gone. The frontend will import `runar-sdk` + the artifact directly.

- [ ] **Step 2: Rewrite MeterTopicManager.ts to use Runar**

Replace the full file with:

```typescript
import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils } from '@bsv/sdk'
import { RunarContract, extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './MeterTopicDocs.md.js'
import counterArtifact from '../../artifacts/Counter.runar.json' with { type: 'json' }

const artifact = counterArtifact as unknown as RunarArtifact
const anyoneWallet = new ProtoWallet('anyone')

export default class MeterTopicManager implements TopicManager {
  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const scriptHex = output.lockingScript.toHex()

          // Try to extract state from the locking script using Runar
          const state = extractStateFromScript(artifact, scriptHex)
          if (!state) continue

          const creatorIdentityKey = state.creatorIdentityKey as string
          const creatorSignature = state.creatorSignature as string

          // Verify creator signature
          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'meter'],
            keyID: '1',
            counterparty: creatorIdentityKey,
            data: [1],
            signature: Utils.toArray(creatorSignature, 'hex')
          })

          if (verifyResult.valid !== true) {
            throw new Error('Signature invalid')
          }

          outputsToAdmit.push(i)
        } catch (error) {
          continue
        }
      }
    } catch (error) {
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `topicManager:Error:identifying admissible outputs:${error} beef:${beefStr}}`
      )
    }

    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Meter Topic Manager',
      shortDescription: 'Meters, up and down.'
    }
  }
}
```

- [ ] **Step 3: Rewrite MeterLookupServiceFactory.ts to use Runar**

Replace the sCrypt import/usage block. The key change is replacing `MeterContract.fromLockingScript(hex)` with `extractStateFromScript(artifact, hex)`:

```typescript
import {
  LookupService,
  LookupQuestion,
  LookupFormula,
  AdmissionMode,
  SpendNotificationMode,
  OutputAdmittedByTopic,
  OutputSpent
} from '@bsv/overlay'
import { MeterStorage } from './MeterStorage.js'
import { extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './MeterLookupDocs.md.js'
import counterArtifact from '../../artifacts/Counter.runar.json' with { type: 'json' }
import { Db } from 'mongodb'

const artifact = counterArtifact as unknown as RunarArtifact

class MeterLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: MeterStorage) { }

  async outputAdmittedByTopic(
    payload: OutputAdmittedByTopic
  ): Promise<void> {
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_meter') return
    try {
      const state = extractStateFromScript(artifact, lockingScript.toHex())
      if (!state) throw new Error('Failed to extract state from script')

      const value = Number(state.count as bigint)
      const creatorIdentityKey = state.creatorIdentityKey as string

      await this.storage.storeRecord(
        txid,
        outputIndex,
        value,
        creatorIdentityKey
      )
    } catch (e) {
      console.error('Error indexing token in lookup database', e)
      return
    }
  }

  async outputSpent?(
    payload: OutputSpent
  ): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_meter') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async outputEvicted(
    txid: string, outputIndex: number
  ): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup(
    question: LookupQuestion
  ): Promise<LookupFormula> {
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_meter') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      creatorIdentityKey?: string
      findAll?: boolean
    }
    if (query.findAll) {
      return await this.storage.findAll()
    }
    const mess = JSON.stringify(question, null, 2)
    throw new Error(`question.query:${mess}}`)
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Meter Lookup Service',
      shortDescription: 'Meters, up and down.'
    }
  }
}

export default (db: Db): MeterLookupService => {
  return new MeterLookupService(new MeterStorage(db))
}
```

- [ ] **Step 4: Update topic manager docs**

In `backend/src/topic-managers/MeterTopicDocs.md.ts`, replace "sCrypt contract" with "Runar contract":

```typescript
export default `# Meter Topic Manager Docs

To have outputs accepted into the Meter overlay network, use the Runar counter contract to create valid locking scripts.

Submit transactions that start new meters at 1, or spend existing meters already submitted.

The latest state of all meters will be tracked, and will be available through the corresponding Meter Lookup Service.`
```

- [ ] **Step 5: Create backend HTTP server entrypoint**

The current `mod.ts` is a library export — it doesn't start a server. For Docker, we need an HTTP entrypoint. Create `backend/src/server.ts` that sets up the overlay engine with Express.

Check `@bsv/overlay` for an `OverlayExpress` or `Engine` class. The server should:
1. Connect to MongoDB using `MONGO_URL` env var
2. Register `MeterTopicManager` for topic `tm_meter`
3. Register `MeterLookupServiceFactory` for service `ls_meter`
4. Bind to `PORT` env var (default 3001)

```typescript
import { Engine } from '@bsv/overlay'
import { MongoClient } from 'mongodb'
import MeterTopicManager from './topic-managers/MeterTopicManager.js'
import MeterLookupServiceFactory from './lookup-services/MeterLookupServiceFactory.js'

const PORT = Number(process.env.PORT ?? 3001)
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017'

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db('meter')

  const engine = new Engine({
    topicManagers: {
      tm_meter: new MeterTopicManager()
    },
    lookupServices: {
      ls_meter: MeterLookupServiceFactory(db)
    }
  })

  // The exact API depends on @bsv/overlay version — check docs for
  // Engine.startHTTP(), OverlayExpress, or similar. Adjust as needed.
  await engine.listen(PORT)
  console.log(`Meter overlay service listening on port ${PORT}`)
}

main().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
```

Note: The `Engine` constructor API may differ. Consult `@bsv/overlay` docs/types for the exact setup. The key point is this file replaces what LARS previously provided — an HTTP server hosting the overlay.

Update `backend/package.json` scripts to add a start command:

```json
{
  "scripts": {
    "start": "node dist/esm/src/server.js"
  }
}
```

- [ ] **Step 6: Build backend and verify no TypeScript errors**

```bash
cd backend && npm run build
```

Expected: Clean compilation, `dist/` generated without errors.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: migrate backend overlay services from sCrypt to Runar"
```

---

## Task 3: Migrate Frontend to Runar

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types/types.d.ts`

- [ ] **Step 1: Update frontend dependencies**

In `frontend/package.json`:

Remove from `dependencies`: `scrypt-ts`, `scrypt-ts-lib`, `@bsv/backend` (file: link — we'll import the artifact directly)
Add to `dependencies`: `runar-compiler`, `runar-sdk`

Keep `@bsv/sdk` — it's still used for `WalletClient`, `SHIPBroadcaster`, `LookupResolver`, `Transaction`, `Utils`.

- [ ] **Step 1b: Update frontend/tsconfig.json**

Remove `../backend/src/contracts` from the `include` array — the frontend no longer compiles contract source files. The sCrypt `experimentalDecorators` option can also be removed.

```json
{
  "include": [
    "src",
    "src/types"
  ]
}
```

- [ ] **Step 1c: Copy artifact into frontend for Docker build compatibility**

The frontend needs access to the compiled Runar artifact. For local dev, the relative path `../../backend/artifacts/Counter.runar.json` works. For Docker builds (where the frontend build context is `./frontend`), the artifact must be inside the context.

Add a `prebuild` script to `frontend/package.json` that copies the artifact:

```json
{
  "scripts": {
    "prebuild": "mkdir -p src/artifacts && cp ../backend/artifacts/Counter.runar.json src/artifacts/",
    "start": "npm run prebuild && webpack serve --config webpack.dev.js",
    "build": "npm run prebuild && webpack --config webpack.prod.js"
  }
}
```

Then update the import in `App.tsx` to use the local copy:

```typescript
import counterArtifact from './artifacts/Counter.runar.json'
```

This way the artifact is always local to the frontend, works in both dev and Docker.

- [ ] **Step 2: Clean up types**

In `frontend/src/types/types.d.ts`, remove the `declare module 'react-toastify'` line (react-toastify has its own types now):

```typescript
export interface Token {
  atomicBeefTX: HexString
  txid: TXIDHexString
  outputIndex: PositiveIntegerOrZero
  lockingScript: HexString
  satoshis: SatoshiValue
}

export interface Meter {
  value: number
  token: Token
  creatorIdentityKey: PubKeyHex
}
```

- [ ] **Step 3: Rewrite App.tsx to use Runar**

This is the largest change. The key replacements:

| sCrypt pattern | Runar replacement |
|---|---|
| `MeterContract.loadArtifact(MeterArtifact)` | Import artifact JSON, cast to `RunarArtifact` |
| `new MeterContract(count, key, sig)` | `new RunarContract(artifact, [count, key, sig])` |
| `meter.lockingScript.toHex()` | `contract.getLockingScript()` |
| `MeterContract.fromLockingScript(hex)` | `RunarContract.fromUtxo(artifact, utxo)` |
| `meterContract.getUnlockingScript(async self => { ... })` | `contract.buildUnlockingScript('increment', [])` |
| `bsv.Transaction` (sCrypt compat layer) | Removed — Runar doesn't need it |
| `toByteString(val, false)` | Direct hex string (Runar uses plain hex strings for ByteString) |

Replace `frontend/src/App.tsx` entirely. The new file removes all sCrypt imports (`bsv`, `toByteString`, `MeterContract`, `MeterArtifact`) and uses `RunarContract` + `extractStateFromScript` from `runar-sdk`.

Key sections that change:

**Imports:**
```typescript
import { RunarContract, extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import counterArtifact from './artifacts/Counter.runar.json'
const artifact = counterArtifact as unknown as RunarArtifact
```

**handleCreateSubmit** — contract creation:
```typescript
// Old: new MeterContract(BigInt(1), toByteString(publicKey, false), toByteString(signature, false))
// New:
const counter = new RunarContract(artifact, [BigInt(1), publicKey, signature])
const lockingScript = counter.getLockingScript()
```

**useAsyncEffect** — parsing lookup results:
```typescript
// Old: MeterContract.fromLockingScript(script) as MeterContract
// New:
const state = extractStateFromScript(artifact, script)
// state.count, state.creatorIdentityKey, state.creatorSignature
```

**handleIncrement / handleDecrement** — building unlocking scripts:
```typescript
// Old: complex sCrypt getUnlockingScript with bsv.Transaction interop
// New:
const contract = RunarContract.fromUtxo(artifact, {
  txid: meter.token.txid,
  outputIndex: meter.token.outputIndex,
  satoshis: meter.token.satoshis,
  script: meter.token.lockingScript
})

// Build next state
const nextContract = RunarContract.fromUtxo(artifact, {
  txid: meter.token.txid,
  outputIndex: meter.token.outputIndex,
  satoshis: meter.token.satoshis,
  script: meter.token.lockingScript
})
// Manually update state for the next output
const nextState = { ...contract.state, count: (contract.state.count as bigint) + 1n }
nextContract.setState(nextState)
const nextScript = nextContract.getLockingScript()

// Unlocking script — Runar handles OP_PUSH_TX internally
const unlockingScript = contract.buildUnlockingScript('increment', [])
```

The `bsv.Transaction` interop layer (creating fake sCrypt transactions for `self.to`/`self.from`) is completely eliminated.

- [ ] **Step 4: Install dependencies and verify frontend builds**

```bash
cd frontend && npm install && npm run build
```

Expected: Webpack produces `build/bundle.js` without errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: migrate frontend from sCrypt to Runar SDK"
```

---

## Task 4: Replace CARS/LARS with Docker + docker-compose

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `package.json` (root)
- Delete: `deployment-info.json`

- [ ] **Step 1: Create backend Dockerfile**

Pattern follows `bsva-infra-flux` apps (e.g. weather-proof-back, message-box). Backend is a Node.js overlay service.

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run compile && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/esm/src/server.js"]
```

- [ ] **Step 2: Create frontend Dockerfile**

Pattern: multi-stage build, webpack prod → nginx static serve.

Create `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Create nginx.conf for SPA routing**

Create `frontend/nginx.conf`:

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 4: Create .dockerignore files**

Docker looks for `.dockerignore` relative to the build context, not the repo root. Since docker-compose sets `context: ./backend` and `context: ./frontend`, create one in each.

Create `backend/.dockerignore`:

```
node_modules
dist
*.md
```

Create `frontend/.dockerignore`:

```
node_modules
build
*.md
```

- [ ] **Step 5: Create docker-compose.yml**

Follows the patterns from `bsva-infra-flux` — specifically the `message-box` app which uses MongoDB. Service names match what K8s services will use (`mongodb`, `meter-back`, `meter-front`).

Create `docker-compose.yml` at repo root:

```yaml
services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: example
    volumes:
      - mongo-data:/data/db

  meter-back:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      PORT: "3001"
      MONGO_URL: mongodb://root:example@mongodb:27017
      BSV_NETWORK: main
    depends_on:
      - mongodb

  meter-front:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    depends_on:
      - meter-back

volumes:
  mongo-data:
```

- [ ] **Step 6: Update root package.json**

Replace LARS/CARS scripts with docker-compose commands:

```json
{
  "name": "@bsv/meter",
  "private": true,
  "version": "1.0.0",
  "description": "Meter - on-chain counter demo using Runar smart contracts",
  "scripts": {
    "dev": "docker compose up --build",
    "dev:down": "docker compose down",
    "dev:clean": "docker compose down -v",
    "build": "docker compose build",
    "frontend:dev": "cd frontend && npm run start",
    "backend:build": "cd backend && npm run build",
    "backend:compile": "cd backend && npm run compile"
  },
  "keywords": [],
  "author": "",
  "license": "SEE LICENSE IN LICENSE.txt"
}
```

Remove `@bsv/cars-cli` and `@bsv/lars` from devDependencies.

- [ ] **Step 7: Delete deployment-info.json**

```bash
rm deployment-info.json
```

- [ ] **Step 8: Verify docker-compose builds**

```bash
docker compose build
```

Expected: Both `meter-front` and `meter-back` images build successfully.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml backend/.dockerignore frontend/.dockerignore backend/Dockerfile frontend/Dockerfile frontend/nginx.conf package.json
git rm deployment-info.json
git commit -m "feat: replace CARS/LARS with Docker and docker-compose"
```

---

## Task 5: Update CLAUDE.md + Cleanup

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the CLAUDE.md to reflect the new Runar + Docker setup. Replace sCrypt references, LARS/CARS commands, and update the architecture section.

- [ ] **Step 3: Final verification**

```bash
cd backend && npm run compile && npm run build
cd ../frontend && npm run build
cd .. && docker compose build
```

All three should succeed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: update docs and clean up sCrypt remnants"
```

---

## Important Notes for Implementer

1. **Runar package names** — if `npm install` fails for `runar-lang`, `runar-compiler`, or `runar-sdk`, check the exact package names on npm. The GitHub repo is `icellan/runar` and packages may be scoped (e.g. `@runar/sdk`). Check https://www.npmjs.com/search?q=runar and the repo's `packages/` directory for actual published names.

2. **extractStateFromScript return shape** — The research shows state is returned as `{ count: bigint, creatorIdentityKey: string, creatorSignature: string }`. Verify this matches the actual API by checking the installed package types. Note: the original sCrypt code did an encoding conversion on creatorIdentityKey (`Utils.toHex(Utils.toArray(meter.creatorIdentityKey, 'utf8'))`). If Runar returns raw hex rather than the sCrypt ByteString encoding, you may need to apply the same conversion for backward compatibility with existing DB records.

3. **buildUnlockingScript for stateful contracts** — Runar's `buildUnlockingScript` handles OP_PUSH_TX preimage computation internally. However, it may require the contract to be connected to a provider/signer via `contract.connect(provider, signer)`. If `buildUnlockingScript` alone doesn't produce a complete unlocking script (with preimage), use `contract.prepareCall()` instead and integrate with the wallet's `createAction`.

4. **Backend Engine API** — The `server.ts` uses a placeholder `Engine` constructor. Check `@bsv/overlay` docs for the exact API — it may be `OverlayExpress`, `Engine.create()`, or similar. The key requirement is registering topic managers + lookup services and binding to HTTP.
