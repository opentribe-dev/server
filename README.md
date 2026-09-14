# OpenCrew server

Part of https://github.com/opentribe-dev.

## Install

This package depends on `@opencrew/protocol` (a sibling repo at `../protocol`) via a `file:` dependency. Install order matters on a fresh clone:

```bash
cd ../protocol && npm install
cd ../server && npm install
```

## Configuration

- `OPENCREW_PORT` — port to listen on (default `4000`)
- `OPENCREW_DATA_DIR` — directory for the SQLite database and attachments (default `./data`)

## Run

```bash
npm run build
npm start
```

Or for development: `npm run dev` (runs `src/index.ts` directly via `tsx`, no build step needed).
