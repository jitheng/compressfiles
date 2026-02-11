# PDF Compressor

A free, privacy-first PDF compression web app. Upload a PDF, pick a compression level, and download a smaller file — no sign-up, no cloud storage, files are deleted immediately after processing.

**Live demo:** *(add your Vercel URL here after deployment)*

---

## Features

- Drag & drop PDF upload (up to 50 MB)
- Three compression levels: Low / Medium / High
- Before & after file size with savings percentage
- Instant download — no email, no account
- Files processed in-memory and deleted immediately
- Works on any modern browser

## Compression results (real-world PDFs)

| Level | PDFSETTINGS | DPI | Typical reduction |
|---|---|---|---|
| Low | `/printer` | 300 | 0–10% |
| Medium | `/ebook` | 150 | 50–65% |
| High | `/screen` | 72 | 75–90% |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | TailwindCSS 3 |
| File upload | react-dropzone |
| HTTP client | axios |
| Serverless API | Vercel Node.js functions |
| Compression (primary) | Ghostscript (`gs -dPDFSETTINGS`) |
| Compression (fallback) | MuPDF WASM (`saveToBuffer compress,garbage=4`) |
| Tests | Vitest + Testing Library (21 tests) |

---

## Project structure

```
├── api/
│   └── compress.js        # Vercel serverless function (POST /api/compress)
├── src/
│   ├── components/
│   │   ├── Compressor.jsx            # Main orchestrator component
│   │   ├── DropZone.jsx              # Drag & drop file input
│   │   ├── CompressionLevelPicker.jsx
│   │   ├── FileSizeDisplay.jsx       # Before/after + savings bar
│   │   └── ProgressBar.jsx
│   ├── hooks/
│   │   └── useCompress.js            # Upload → compress → download lifecycle
│   └── test/                         # 21 Vitest unit tests
├── server.dev.js          # Local API dev server (mirrors Vercel function)
├── vercel.json            # Vercel deployment config
├── ARCHITECTURE.md        # Detailed architecture & code reference
└── package.json
```

---

## Getting started

### Prerequisites

- Node.js 20+
- [Ghostscript](https://www.ghostscript.com/) (for full compression — optional, falls back to MuPDF)

```bash
# macOS
brew install ghostscript

# Ubuntu/Debian
sudo apt-get install ghostscript
```

### Install dependencies

```bash
npm install
```

### Run locally

```bash
# Start both the Vite frontend (port 5173) and API server (port 3001)
npm run dev:all

# Or start separately:
node server.dev.js   # API on :3001
npm run dev          # Frontend on :5173
```

Open [http://localhost:5173](http://localhost:5173).

### Run tests

```bash
npm test              # run once
npm run test:watch    # watch mode
```

---

## Deployment (Vercel)

```bash
npx vercel --prod
```

> **Note:** Standard Vercel deployments do not include Ghostscript. The API automatically falls back to MuPDF compression. For full Ghostscript performance, deploy using a Docker-based Vercel runtime or a VPS.

No environment variables are required for the MVP.

---

## Branch strategy

| Branch | Purpose |
|---|---|
| `dev` | Active development — all feature branches merge here |
| `staging` | Pre-production integration testing |
| `main` | Production — deployed to Vercel |

**Workflow:**
```
feature/my-feature  →  dev  →  PR to staging  →  PR to main
```

---

## API reference

### `POST /api/compress`

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | PDF file | Yes | Max 50 MB |
| `level` | `low` \| `medium` \| `high` | No | Default: `medium` |

**Response (success):** `200 application/pdf`

| Header | Description |
|---|---|
| `X-Original-Size` | Original file size in bytes |
| `X-Compressed-Size` | Compressed file size in bytes |
| `X-Engine` | `ghostscript` or `mupdf` |

**Response (error):** `400 / 413 / 500` JSON `{ "error": "..." }`

---

## License

MIT
