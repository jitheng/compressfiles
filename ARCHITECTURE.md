# PDF Compressor — Architecture & Code Reference

## Overview

A production-ready, single-page web application that compresses PDF files in a
Vercel serverless function and streams the result back to the browser for
download. No files are stored; all processing is in-memory/temporary.

---

## High-Level Architecture

```
Browser (React + Vite)
        │
        │  POST /api/compress
        │  multipart/form-data (file, level)
        ▼
Vercel Serverless Function  (/api/compress.js)
        │
        │  Engine 1: Ghostscript (gs -dPDFSETTINGS) — re-encodes images
        │  Engine 2: MuPDF fallback (saveToBuffer compress,garbage=4)
        │
        ▼
Response: application/pdf blob
        │
        ▼
Browser: URL.createObjectURL → <a download> → auto-revoke after 60 s
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 18 |
| Build tool | Vite | 5 |
| Styling | TailwindCSS | 3 |
| File drop | react-dropzone | 14 |
| HTTP client | axios | 1 |
| Serverless runtime | Vercel Node.js | 20 |
| PDF engine | pdf-lib | 1.17 |
| Form parsing | formidable | 3 |
| Unit tests | Vitest + Testing Library | 2 / 16 |

---

## Directory Structure

```
PDF Compressor/
│
├── api/
│   ├── compress.js          ← Vercel serverless function (POST /api/compress)
│   └── package.json         ← "type":"module" so api/ is treated as ESM
│
├── src/
│   ├── main.jsx             ← React entry point
│   ├── index.css            ← Tailwind directives + global utility classes
│   ├── App.jsx              ← Shell: header, footer, mounts <Compressor>
│   │
│   ├── components/
│   │   ├── Compressor.jsx         ← Orchestrates full upload→compress→download flow
│   │   ├── DropZone.jsx           ← react-dropzone wrapper (PDF only, 50 MB max)
│   │   ├── CompressionLevelPicker.jsx  ← Low / Medium / High radio buttons
│   │   ├── FileSizeDisplay.jsx    ← Before/after sizes + animated savings bar
│   │   └── ProgressBar.jsx        ← Accessible progress indicator
│   │
│   ├── hooks/
│   │   └── useCompress.js   ← State machine: idle→uploading→processing→done|error
│   │
│   └── test/
│       ├── setup.js                       ← @testing-library/jest-dom import
│       ├── FileSizeDisplay.test.jsx       ← formatBytes + render tests (10 tests)
│       ├── CompressionLevelPicker.test.jsx ← selection + onChange + disabled (4 tests)
│       ├── ProgressBar.test.jsx            ← ARIA + label tests (3 tests)
│       └── useCompress.test.js            ← Hook lifecycle: done/error/reset (4 tests)
│
├── public/
│   └── favicon.svg
│
├── index.html               ← Vite HTML entry
├── package.json             ← Root (type:module, scripts, all deps)
├── vite.config.js           ← Vite + Vitest config; /api proxy → localhost:3001
├── tailwind.config.js
├── postcss.config.js
├── vercel.json              ← Vercel routing + function config
├── server.dev.js            ← Local dev API server (mirrors Vercel function)
├── .gitignore
└── .env.example
```

---

## Component Details

### `src/components/Compressor.jsx`
Central orchestrator. Holds `file` and `level` state, calls `useCompress`, and
conditionally renders the drop zone, level picker, progress bar, error state,
and the done/download card.

**State transitions rendered:**

| `status` | UI shown |
|---|---|
| `idle` | DropZone only |
| `idle` + file selected | DropZone + file chip + level picker + Compress button |
| `uploading` / `processing` | Progress bar + spinner button |
| `done` | Download card with FileSizeDisplay |
| `error` | Red error banner |

### `src/components/DropZone.jsx`
Wraps `react-dropzone`. Accepts only `application/pdf`, max 50 MB. Shows
animated border pulse when a file is dragged over. Passes validation errors to
`window.alert`.

### `src/components/CompressionLevelPicker.jsx`
Three `role="radio"` buttons. Each holds an emoji indicator, label, and
description. Emits the chosen value via `onChange`. Fully disabled while
compressing.

### `src/components/FileSizeDisplay.jsx`
Displays original and compressed byte counts (formatted via `formatBytes`).
Renders a green progress bar proportional to savings, and a badge showing
percentage reduction. Exported `formatBytes` is unit-tested independently.

### `src/components/ProgressBar.jsx`
Accessible `role="progressbar"` with `aria-valuenow`. Accepts a `label` prop
for contextual text ("Uploading…" vs "Compressing…").

---

## Hook: `src/hooks/useCompress.js`

```
compress(file, level)
  → reset()                          clears previous state
  → setStatus('uploading')
  → axios.post('/api/compress', formData, { onUploadProgress, onDownloadProgress })
      upload progress   → 10–50%
      download progress → 55–95%
  → setStatus('processing')          97%
  → URL.createObjectURL(blob)        stored in ref for cleanup
  → setStatus('done')                100%

reset()
  → URL.revokeObjectURL(blobUrlRef)  free memory
  → all state back to defaults
```

Progress percentages are split: 10–50% upload, 55–95% download, 97–100% local
object URL creation.

---

## API: `api/compress.js`

**Route:** `POST /api/compress`

**Request:** `multipart/form-data`
- `file` — PDF binary (required, max 50 MB)
- `level` — `"low"` | `"medium"` | `"high"` (optional, default `"medium"`)

**Response (success):**
- `200 application/pdf`
- Headers: `X-Original-Size`, `X-Compressed-Size`, `Content-Disposition`

**Response (error):**
- `400` — no file, wrong type
- `413` — file exceeds 50 MB
- `500` — pdf-lib error, encrypted PDF, etc.

**Compression logic (`compressPdf`):**

```js
PDFDocument.load(buffer)           // parse existing PDF
PDFDocument.save({
  useObjectStreams: true,           // compress object streams
  objectsPerTick: 10|20|50         // high/medium/low trade-off
})
```

`objectsPerTick` controls how many PDF objects are serialised per event-loop
tick. Smaller values = slower but slightly better deduplication for large files.

**Temp file cleanup:**
`formidable` writes uploads to OS `/tmp`. The handler calls `unlinkSync(tmpPath)`
immediately after reading the buffer — and again in the `catch` block to handle
errors. Files never persist beyond the function invocation.

---

## Vercel Configuration (`vercel.json`)

```json
{
  "functions": {
    "api/compress.js": {
      "maxDuration": 60,   // seconds — allows large PDF processing
      "memory": 1024       // MB
    }
  }
}
```

Routes: `/api/*` → serverless functions; `/*` → `index.html` (SPA fallback).

---

## Local Development

```bash
# Install dependencies
npm install

# Start both servers concurrently
npm run dev:all

# Or individually:
node server.dev.js      # API on :3001
npm run dev             # Vite on :5173 (proxies /api → :3001)
```

Vite proxy config in `vite.config.js`:
```js
server: {
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true }
  }
}
```

---

## Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
```

**21 tests across 4 files:**

| File | Tests | What's covered |
|---|---|---|
| `FileSizeDisplay.test.jsx` | 10 | `formatBytes` edge cases, render, savings bar visibility |
| `CompressionLevelPicker.test.jsx` | 4 | selection state, `onChange`, disabled mode |
| `ProgressBar.test.jsx` | 3 | ARIA attributes, label text, percentage display |
| `useCompress.test.js` | 4 | idle state, success flow, error flow, reset |

axios is mocked via `vi.mock('axios')`. `URL.createObjectURL` / `revokeObjectURL`
are stubbed since jsdom doesn't implement them.

---

## Deployment to Vercel

```bash
# One-time setup
npm i -g vercel
vercel login

# Deploy
vercel --prod
```

No environment variables required for MVP. Vercel auto-detects the
`@vercel/static-build` + `@vercel/node` setup from `vercel.json`.

---

## Known Limitations & V2 Ideas

| Item | Notes |
|---|---|
| **Compression ratio** | pdf-lib re-serialises but doesn't re-encode images. Ghostscript (`gs -dPDFSETTINGS=/screen`) achieves 60–80% reduction on image-heavy PDFs. Swap `compressPdf` for a GS child_process call on a server/container. |
| **Encrypted PDFs** | pdf-lib throws on password-protected files. Detected and surfaced as a user-friendly error. |
| **50 MB limit** | Set in both formidable (`maxFileSize`) and the drop zone. Raise both to increase. |
| **No analytics** | Add Vercel Analytics (`@vercel/analytics`) with one import line. |
| **Batch processing** | V2: accept multiple files, compress in parallel, return a zip. |
