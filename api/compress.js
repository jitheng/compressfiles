/**
 * Vercel Serverless Function: POST /api/compress
 *
 * Accepts a multipart/form-data request with:
 *   - file: PDF file (required)
 *   - level: 'low' | 'medium' | 'high' (optional, default 'medium')
 *
 * Returns the compressed PDF as application/pdf.
 *
 * Compression engine priority:
 *   1. Ghostscript (gs) — if available in PATH.
 *      Uses -dPDFSETTINGS which re-encodes images at lower JPEG quality.
 *      Achieves 30–90% reduction on image-heavy PDFs.
 *
 *   2. MuPDF (fallback) — pure WASM, always available.
 *      Uses saveToBuffer('compress,garbage=4,clean,sanitize').
 *      Achieves 5–15% reduction (stream compression + xref dedup).
 *
 * Level → Ghostscript PDFSETTINGS mapping:
 *   low    → /printer  (300dpi images, minimal quality loss)
 *   medium → /ebook    (150dpi images, ~60-70% reduction)
 *   high   → /screen   (72dpi images,  ~80-90% reduction)
 */

import { IncomingForm } from 'formidable'
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import * as mupdf from 'mupdf'
import path from 'path'

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb',
    maxDuration: 60,
  },
}

const execFileAsync = promisify(execFile)

// ─── Ghostscript settings per compression level ───────────────────────────────

const GS_SETTINGS = {
  low:    '/printer',   // 300 dpi — near-lossless, ~0-10% reduction
  medium: '/ebook',     // 150 dpi — ~50-70% reduction
  high:   '/screen',    // 72 dpi  — ~70-90% reduction (visible quality loss on photos)
}

// Common GS search paths (macOS/Linux)
const GS_CANDIDATES = [
  'gs',
  '/usr/local/bin/gs',
  '/usr/bin/gs',
  '/opt/homebrew/bin/gs',
  '/opt/local/bin/gs',
]

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024,
    })
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

/** Find the first working gs binary, or null. */
async function findGhostscript() {
  for (const candidate of GS_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 3000 })
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Compress with Ghostscript.
 * Writes input to a temp file, runs gs, reads output, cleans up both.
 */
async function compressWithGhostscript(gs, inputBuffer, level) {
  const id      = randomBytes(8).toString('hex')
  const inPath  = join(tmpdir(), `pdfcomp-in-${id}.pdf`)
  const outPath = join(tmpdir(), `pdfcomp-out-${id}.pdf`)

  try {
    writeFileSync(inPath, inputBuffer)

    await execFileAsync(gs, [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      `-dPDFSETTINGS=${GS_SETTINGS[level]}`,
      '-dCompatibilityLevel=1.5',
      `-sOutputFile=${outPath}`,
      inPath,
    ], { timeout: 55_000 })

    return readFileSync(outPath)
  } finally {
    try { unlinkSync(inPath)  } catch (_) {}
    try { unlinkSync(outPath) } catch (_) {}
  }
}

/**
 * Fallback: compress with MuPDF saveToBuffer.
 * Much less effective on image-heavy PDFs but always available.
 * garbage=4 deduplicates and removes unreferenced objects.
 * compress flate-compresses all streams.
 * clean/sanitize repair and normalise content streams.
 */
function compressWithMuPDF(inputBuffer) {
  const src = mupdf.Document.openDocument(new Uint8Array(inputBuffer), 'application/pdf')
  const pd  = src.asPDF()
  const buf = pd.saveToBuffer('compress,garbage=4,clean,sanitize')
  return Buffer.from(buf.asUint8Array())
}

// ─── plain-Node response helpers ─────────────────────────────────────────────

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function sendBuffer(res, statusCode, headers, buffer) {
  res.writeHead(statusCode, headers)
  res.end(buffer)
}

// ─── handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    return res.end()
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  let formTmpPath = null

  try {
    const { fields, files } = await parseForm(req)

    // ── validate file ──────────────────────────────────────────────────────
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file
    if (!uploadedFile) {
      return sendJson(res, 400, { error: 'No file uploaded.' })
    }

    const ext = path.extname(uploadedFile.originalFilename || '').toLowerCase()
    if (ext !== '.pdf') {
      return sendJson(res, 400, { error: 'Only PDF files are accepted.' })
    }

    formTmpPath = uploadedFile.filepath

    // ── validate level ────────────────────────────────────────────────────
    const rawLevel = Array.isArray(fields.level) ? fields.level[0] : fields.level
    const level = ['low', 'medium', 'high'].includes(rawLevel) ? rawLevel : 'medium'

    // ── read input ────────────────────────────────────────────────────────
    const inputBuffer = readFileSync(formTmpPath)
    try { unlinkSync(formTmpPath) } catch (_) {}
    formTmpPath = null

    // ── compress ──────────────────────────────────────────────────────────
    let compressedBuffer
    let engine

    const gs = await findGhostscript()

    if (gs) {
      compressedBuffer = await compressWithGhostscript(gs, inputBuffer, level)
      engine = 'ghostscript'
    } else {
      compressedBuffer = compressWithMuPDF(inputBuffer)
      engine = 'mupdf'
    }

    // If compression made the file larger (can happen with /printer on
    // already-optimised PDFs), return the original unchanged.
    if (compressedBuffer.length >= inputBuffer.length) {
      compressedBuffer = inputBuffer
    }

    // ── respond ───────────────────────────────────────────────────────────
    const originalName = uploadedFile.originalFilename || 'compressed.pdf'
    const baseName     = originalName.replace(/\.pdf$/i, '')
    const outputName   = `${baseName}_compressed.pdf`

    return sendBuffer(res, 200, {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${outputName}"`,
      'Content-Length':      compressedBuffer.length,
      'X-Original-Size':     inputBuffer.length,
      'X-Compressed-Size':   compressedBuffer.length,
      'X-Engine':            engine,
      'Cache-Control':       'no-store',
      'Access-Control-Allow-Origin':   '*',
      'Access-Control-Expose-Headers': 'X-Original-Size, X-Compressed-Size, X-Engine',
    }, compressedBuffer)

  } catch (err) {
    console.error('[compress] Error:', err)

    if (formTmpPath) {
      try { unlinkSync(formTmpPath) } catch (_) {}
    }

    const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 50 MB limit.'
        : err.message?.includes('encrypted')
        ? 'Encrypted PDFs are not supported. Please remove the password first.'
        : 'Failed to compress the PDF. The file may be corrupted or unsupported.'

    return sendJson(res, statusCode, { error: message })
  }
}
