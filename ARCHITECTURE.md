# PDF Compressor — Architecture & Code Reference

## Overview
Free online PDF compressor: React + Vite frontend → Vercel serverless API → MuPDF WASM re-render → compressed PDF download. No persistent storage. Live at https://compressfiles.vercel.app

---

## Architecture

```
Browser (React + Vite)
  │
  │  Mode A — Vercel Blob (production, any file size):
  │    1. POST /api/blob-upload  → token exchange (tiny request)
  │    2. PUT  <vercel-blob-cdn> → browser uploads directly to CDN (bypasses 4.5 MB limit)
  │    3. POST /api/compress     → { blobUrl, level, filename } (JSON, tiny)
  │       function: fetch(blobUrl) → compress → del(blobUrl) → return PDF
  │
  │  Mode B — Legacy multipart (local dev / no BLOB_READ_WRITE_TOKEN set):
  │    POST /api/compress  multipart/form-data  { file, level }  (≤4 MB)
  │
  ▼
Response: application/pdf → triggerDownload() → transient <a>.click()
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + Vite | 18 / 5 |
| Styling | TailwindCSS | 3 |
| File drop | react-dropzone | 14 |
| HTTP client | axios | 1 |
| Blob upload | @vercel/blob | 2 |
| Analytics | @vercel/analytics | 1 |
| Serverless runtime | Vercel Node.js | 20 |
| PDF engine (primary) | Ghostscript (`gs` binary) | system |
| PDF engine (fallback) | MuPDF WASM (`mupdf` npm) | 1.27 |
| Form parsing | formidable | 3 |
| Tests | Vitest + Testing Library | 2 / 16 |

---

## Directory Structure

```
PDF Compressor/
├── api/
│   ├── compress.js       ← POST /api/compress — dual-mode (JSON blobUrl or multipart)
│   ├── blob-upload.js    ← POST /api/blob-upload — Vercel Blob token exchange
│   └── package.json      ← "type":"module" (required for ESM)
├── src/
│   ├── main.jsx          ← React entry + <Analytics />
│   ├── index.css         ← Tailwind directives + custom classes
│   ├── App.jsx           ← Shell: header, h1, Compressor, feature grid, FAQ, footer
│   ├── components/
│   │   ├── Compressor.jsx             ← Orchestrates flow; large-file advisory banner (>5 MB)
│   │   ├── DropZone.jsx               ← Mobile-safe file picker (iOS + Android fixes)
│   │   ├── CompressionLevelPicker.jsx ← Low / Medium / High radio buttons
│   │   ├── FileSizeDisplay.jsx        ← Before/after sizes + savings bar
│   │   └── ProgressBar.jsx            ← Accessible progress indicator
│   ├── hooks/
│   │   └── useCompress.js  ← State machine + two-step Vercel Blob upload + triggerDownload
│   └── test/
│       ├── setup.js
│       ├── FileSizeDisplay.test.jsx        (10 tests)
│       ├── CompressionLevelPicker.test.jsx  (4 tests)
│       ├── ProgressBar.test.jsx             (3 tests)
│       └── useCompress.test.js              (5 tests)
├── public/
│   ├── favicon.svg
│   ├── robots.txt         ← Allow all + sitemap reference
│   └── sitemap.xml        ← Single URL entry
├── index.html             ← Full SEO head (title, OG, Twitter Card, JSON-LD, canonical)
├── package.json
├── vite.config.js         ← Vite + Vitest config; proxies /api → localhost:3001
├── tailwind.config.js
├── vercel.json            ← compress (60s/1024MB), blob-upload (10s/256MB)
├── server.dev.js          ← Local HTTP server — /api/compress + /api/blob-upload
├── .env.example           ← BLOB_READ_WRITE_TOKEN documentation
├── ARCHITECTURE.md        ← This file
└── CLAUDE.md              ← AI context file (gitignored)
```

---

## Compression Engines

### Engine 1 — Ghostscript (local dev only, not on Vercel)
```bash
gs -dPDFSETTINGS=/printer|/ebook|/screen -sDEVICE=pdfwrite ...
```
Typical reduction: 50–90%. Auto-detected via `GS_CANDIDATES` path list.

### Engine 2 — MuPDF WASM re-render (Vercel production — always available)
Per-page pipeline in `compressWithMuPDF()`:
1. `page.toPixmap(Matrix.scale(scale, scale), DeviceRGB, false)` → RGB Pixmap
2. `pix.asJPEG(quality, false)` → JPEG Uint8Array; then `pix.destroy()` (free WASM heap)
3. `outDoc.addRawStream(jpegBytes, imgDict)` — **buffer FIRST, dict second**
4. `outDoc.addPage([0,0,w,h], 0, resources, contentStream)` → returns pageObj
5. `outDoc.insertPage(-1, pageObj)` — **must call separately** (addPage alone does not insert)
6. `outDoc.saveToBuffer('compress')` — **no `garbage=N`** (removes freshly added objects)

**Level configuration:**
| Level | JPEG quality | Render scale | GS setting | Approx. reduction |
|-------|-------------|--------------|------------|-------------------|
| low   | 85 | 1.5× | `/printer` | ~70% |
| medium| 60 | 1.2× | `/ebook`   | ~85% |
| high  | 35 | 1.0× | `/screen`  | ~90% |

---

## API Reference

### `POST /api/blob-upload`
Vercel Blob client-upload token exchange.
- **Request:** `application/json` with `{ type: "blob.generate-client-token", payload: { pathname, callbackUrl } }`
- **Response (production):** Vercel Blob upload token (handled by `handleUpload`)
- **Response (local / no token):** `{ localMode: true }` → client auto-falls back to multipart
- **Config:** `maxDuration: 10`, `memory: 256`

### `POST /api/compress`
**Mode A — Vercel Blob (production):**
- **Request:** `application/json` `{ blobUrl, level, filename }`
- Handler calls `fetch(blobUrl)`, compresses, `del(blobUrl)`, returns PDF

**Mode B — Multipart (local dev):**
- **Request:** `multipart/form-data` `{ file, level }`

**Both modes respond:**
- `200 application/pdf` + headers: `X-Original-Size`, `X-Compressed-Size`, `X-Engine`, `Content-Disposition`
- `400` bad input | `413` too large | `500` compression error
- **Config:** `maxDuration: 60`, `memory: 1024`, `sizeLimit: '50mb'`, `responseLimit: '50mb'`

---

## Hook: `src/hooks/useCompress.js`

States: `idle → uploading → processing → done | error`

```
compress(file, level):
  1. POST /api/blob-upload (mode check)
     → { localMode: true }  → Mode B: FormData → POST /api/compress
     → token               → Mode A: upload(file) to CDN → POST /api/compress { blobUrl }
  2. Both paths: responseType:'blob', timeout:60_000
     onDownloadProgress: pulse +3 up to 80% if evt.total is missing (Vercel chunked)
  3. URL.createObjectURL(blob) → setStatus('done')

triggerDownload():
  Creates transient <a>, appends to body, .click(), removes after 60s
  Required for Android Chrome (ignores <a download> on static DOM anchors)

reset():
  URL.revokeObjectURL → clear all state
```

---

## Mobile Fixes Summary

| Issue | Root cause | Fix | File |
|-------|-----------|-----|------|
| File picker doesn't open on iOS | JS `.click()` blocked by user-gesture guard | `<label htmlFor>` as tap target; `noClick:true` on dropzone | DropZone.jsx |
| 300ms tap delay | Default browser behaviour | `touch-manipulation` class | DropZone.jsx |
| File picker broken on Android | `e.preventDefault()` on label breaks `htmlFor` | Removed `preventDefault`; `.click()` is safety-net only | DropZone.jsx |
| Blank screen after upload (Android) | `<a download>` ignored on static DOM anchor | `triggerDownload()` — fresh transient anchor per user gesture | useCompress.js / Compressor.jsx |
| Progress bar freezes | Vercel uses chunked transfer — no `Content-Length` | Pulse fallback: `progress += 3` up to 80% | useCompress.js |

---

## SEO Implementation

**`index.html`:**
- `<title>` with primary keywords
- `<meta name="description/keywords/robots">`
- Canonical URL
- Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`)
- Twitter Card (`summary_large_image`)
- JSON-LD `WebApplication` schema with `featureList` and free `Offer`
- `theme-color` for mobile browser chrome

**`src/App.jsx`:**
- `<h1>` with keyword-rich copy (upgraded from `<h2>`)
- 3-column feature grid (size reduction, privacy, device support)
- FAQ prose section for long-tail keyword signals

**`public/robots.txt`** + **`public/sitemap.xml`**

---

## Vercel Configuration (`vercel.json`)

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/compress.js":    { "maxDuration": 60, "memory": 1024 },
    "api/blob-upload.js": { "maxDuration": 10, "memory": 256  }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Vercel Hobby plan hard limits (cannot be changed by config):**
- Request body: **4.5 MB** — why Vercel Blob is required for larger files
- Memory: 1024 MB max (3008 MB would fail deployment)
- Duration: 60s max

---

## Local Development

```bash
npm install
# Optional: copy BLOB_READ_WRITE_TOKEN to .env.local for blob mode
npm run dev:all    # Vite :5173 + API :3001 concurrently
# Or separately:
node server.dev.js   # API on :3001
npm run dev          # Vite on :5173
```

Without `BLOB_READ_WRITE_TOKEN`, the app uses Mode B (multipart) automatically — works fine for files ≤4 MB.

---

## Tests (22 total)

```bash
npm test           # run once
npm run test:watch # watch mode
```

| File | Count | What's tested |
|------|-------|---------------|
| FileSizeDisplay.test.jsx | 10 | `formatBytes` edge cases, render, savings bar |
| CompressionLevelPicker.test.jsx | 4 | selection, onChange, disabled |
| ProgressBar.test.jsx | 3 | ARIA attributes, label, percentage |
| useCompress.test.js | 5 | idle, done (2-call mock), error, reset, triggerDownload |

**Test pattern for useCompress** — `axios.post` is called twice per `compress()` invocation:
```js
vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }))
axios.post
  .mockResolvedValueOnce({ data: { localMode: true } })        // call 1: blob-upload check
  .mockResolvedValueOnce({ data: pdfBlob, headers: {...} })    // call 2: /api/compress
```

---

## Git Branch History (newest → oldest)

| Branch | Change |
|--------|--------|
| `feat/vercel-blob` | Vercel Blob two-step upload — bypasses 4.5 MB limit |
| `fix/large-file-upload` | `sizeLimit:'50mb'`, `pix.destroy()`, better error messages |
| `fix/mobile-blank-screen` | `triggerDownload()`, remove `preventDefault`, progress pulse |
| `feat/analytics` | `@vercel/analytics` injected in main.jsx |
| `feat/seo` | OG/Twitter/JSON-LD/robots/sitemap, feature grid, FAQ section |
| `fix/mobile-upload` | iOS/Android file picker fixes (label, noClick, touch-manipulation) |
| `fix/compression-engine` | MuPDF JPEG re-render pipeline (replaced pdf-lib) |

Git flow: `fix/feat branch → dev → staging → main → vercel --prod`

---

## Environment Variables

| Var | Required for | Where to set |
|-----|-------------|--------------|
| `BLOB_READ_WRITE_TOKEN` | Files >4.5 MB in production | Vercel dashboard → Project → Settings → Environment Variables |

Local: add to `.env.local` (gitignored). Get from Vercel dashboard → Storage → Blob store → `.env.local` tab.

---

## Known Limitations

| Item | Detail |
|------|--------|
| Vercel Blob required for large files | Must create Blob store + set `BLOB_READ_WRITE_TOKEN` — one-time setup |
| WASM heap limit | Files >30 MB with many pages may OOM at Low compression — recommend High |
| Vercel 60s timeout | Very large files on Low compression may timeout |
| Text-only PDFs | Re-render increases size — original returned if output > input |
| Encrypted PDFs | MuPDF throws — surfaced as user-friendly error message |
