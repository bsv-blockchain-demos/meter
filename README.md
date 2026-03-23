# Sign My YearBook

An on-chain yearbook that anyone can sign. Built with Runar smart contracts on the BSV overlay network.

Each yearbook lives as a UTXO on the BSV blockchain with 10 signature slots. Friends can sign it by leaving a message recorded as a Bitcoin transaction, forever on-chain.

## Getting Started

### With Docker (recommended)

```bash
npm run dev        # docker compose up --build
```

This starts 4 services:
- **mongodb** (port 27017) — lookup service storage
- **mysql** (port 3306) — overlay engine internal state
- **yearbook-back** (port 8080) — BSV overlay service
- **yearbook-front** (port 5173) — React SPA via nginx

### Without Docker

```bash
# Backend
cd backend
npm install
npm run compile    # Compile Runar contract
npm run build      # TypeScript compile
npm run start      # Starts overlay server on port 8080

# Frontend (in a separate terminal)
cd frontend
npm install
npm run start      # webpack-dev-server on port 5173
```

Requires MongoDB and MySQL running locally.

## Troubleshooting

If you see:
```
broadcasterResult.description: All local topical hosts have rejected the transaction.
```

Try using your browser with a command switch. Ensure you use a temporary profile if you do disable your security settings.

For Linux:
```
brave-browser --disable-web-security --user-data-dir="/tmp/brave_dev"
```

## Directory Structure

```
├── docker-compose.yml
├── package.json
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── mod.ts                          # Library entry point
│   ├── artifacts/
│   │   └── YearBook.runar.json         # Compiled contract artifact
│   └── src/
│       ├── server.ts                   # HTTP overlay server
│       ├── ChainTracksClient.ts        # ChainTracker implementation
│       ├── types.ts                    # Shared types
│       ├── contracts/
│       │   ├── YearBook.runar.ts       # Runar smart contract
│       │   └── compile.ts              # Contract compiler script
│       ├── lookup-services/
│       │   ├── YearBookLookupServiceFactory.ts
│       │   ├── YearBookStorage.ts
│       │   └── YearBookLookupDocs.md.ts
│       └── topic-managers/
│           ├── YearBookTopicManager.ts
│           └── YearBookTopicDocs.md.ts
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── webpack.common.js / webpack.dev.js / webpack.prod.js
    ├── public/
    │   └── index.html
    └── src/
        ├── App.tsx                     # Main React SPA
        ├── index.tsx                   # Entry point
        ├── theme.ts                    # MUI dark theme
        ├── artifacts/
        │   └── YearBook.runar.json     # Copied from backend
        └── types/
            ├── types.d.ts              # Token, YearBook interfaces
            └── mui.d.ts                # MUI type declarations
```

## License

[Open BSV License](./LICENSE.txt)
