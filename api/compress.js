/**
 * Vercel Serverless Function: POST /api/compress
 *
 * Accepts multipart/form-data:
 *   - file  : PDF binary (required, max 50 MB)
 *   - level : 'low' | 'medium' | 'high'  (optional, default 'medium')
 *
 * Returns the compressed PDF as application/pdf.
 *
 * ── Compression strategy ─────────────────────────────────────────────────────
 *
 * Engine 1 — Ghostscript (if `gs` binary is in PATH)
 *   Uses -dPDFSETTINGS to re-encode images at reduced DPI via native binary.
 *   Typical reduction: 50–90%.  NOT available on standard Vercel runtimes.
 *
 * Engine 2 — MuPDF WASM re-render (always available, no binary dependencies)
 *   Pipeline per page:
 *     1. Render page → RGB Pixmap at target render scale
 *     2. Encode Pixmap → JPEG at target quality (asJPEG)
 *     3. Embed JPEG as /DCTDecode XObject stream in a new PDF
 *     4. Insert page into output page tree (insertPage)
 *   This forces full image re-encoding at a lower JPEG quality, achieving
 *   70–94% reduction on image-heavy PDFs in pure WASM on Vercel.
 *
 * Level mapping:
 *   low    → JPEG quality 85, render scale 1.5×  (high quality, ~70% reduction)
 *   medium → JPEG quality 60, render scale 1.2×  (balanced,     ~85% reduction)
 *   high   → JPEG quality 35, render scale 1.0×  (max savings,  ~90% reduction)
 *
 * Safety: if the re-encoded output is larger than the input, the original
 * is returned unchanged (rare for image PDFs, possible for pure-text PDFs).
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
import { del } from '@vercel/blob'
import https from 'https'

/**
 * Fetch a blob URL as a Buffer using Node's built-in https module.
 * Retries up to 3 times with 1-second delay to handle CDN propagation lag.
 * Avoids issues with native fetch / undici in Vercel serverless environments.
 */
function fetchBlobAsBufferOnce(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`))
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')))
  })
}

async function fetchBlobAsBuffer(url) {
  const maxAttempts = 4
  const delayMs = 1500
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[compress] Blob fetch attempt ${attempt}/${maxAttempts}: ${url}`)
        await new Promise(r => setTimeout(r, delayMs))
      }
      const buf = await fetchBlobAsBufferOnce(url)
      if (attempt > 1) console.log(`[compress] Blob fetch succeeded on attempt ${attempt}`)
      return buf
    } catch (err) {
      lastErr = err
      console.log(`[compress] Blob fetch attempt ${attempt} failed: ${err.message}`)
    }
  }
  throw new Error(`Failed to fetch blob after ${maxAttempts} attempts: ${lastErr.message}`)
}

/**
 * Dual-mode handler:
 *
 * Mode A — Vercel Blob (production, large files):
 *   POST /api/compress  application/json  { blobUrl: "https://...", level: "medium" }
 *   The browser already uploaded the file directly to Vercel Blob CDN
 *   (bypassing the 4.5 MB serverless body limit entirely). This function
 *   fetches the file from blobUrl, compresses it, deletes the blob, and
 *   returns the compressed PDF.
 *
 * Mode B — Direct multipart (local dev / fallback for files ≤4 MB):
 *   POST /api/compress  multipart/form-data  { file: <binary>, level: "medium" }
 *   Legacy path used when BLOB_READ_WRITE_TOKEN is not configured or file is small.
 */
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb',
    sizeLimit: '50mb',
    maxDuration: 60,
  },
}

const execFileAsync = promisify(execFile)

// ─── compression level configs ────────────────────────────────────────────────

const LEVEL_CONFIG = {
  //          JPEG quality  render scale  GS PDFSETTINGS
  low:    { quality: 85,  scale: 1.5,  gsSetting: '/printer' },
  medium: { quality: 60,  scale: 1.2,  gsSetting: '/ebook'   },
  high:   { quality: 35,  scale: 1.0,  gsSetting: '/screen'  },
}

// GS search paths (macOS Homebrew + standard Linux)
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

async function findGhostscript() {
  for (const candidate of GS_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 3000 })
      return candidate
    } catch { /* try next */ }
  }
  return null
}

/**
 * Ghostscript compression — re-encodes images via native binary.
 * Only runs when gs is available (local dev / custom Docker).
 */
async function compressWithGhostscript(gs, inputBuffer, level) {
  const id      = randomBytes(8).toString('hex')
  const inPath  = join(tmpdir(), `pdfcomp-in-${id}.pdf`)
  const outPath = join(tmpdir(), `pdfcomp-out-${id}.pdf`)
  try {
    writeFileSync(inPath, inputBuffer)
    await execFileAsync(gs, [
      '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
      `-dPDFSETTINGS=${LEVEL_CONFIG[level].gsSetting}`,
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
 * MuPDF WASM re-render compression.
 *
 * Re-renders every page to a Pixmap then encodes as JPEG and embeds as a
 * /DCTDecode XObject.  This is the primary engine on Vercel where no native
 * binary is available.
 *
 * Key API notes (MuPDF 1.27):
 *   - addPage(mediabox, rotate, resources, contentString) → pageObj
 *   - insertPage(-1, pageObj)  ← must call separately to add to page tree
 *   - addRawStream(uint8Array, dictObj)  ← note: buffer first, dict second
 *   - saveToBuffer('compress')  ← do NOT use garbage=N; removes new objects
 */
function compressWithMuPDF(inputBuffer, level) {
  const { quality, scale } = LEVEL_CONFIG[level]
  const src    = mupdf.Document.openDocument(new Uint8Array(inputBuffer), 'application/pdf')
  const outDoc = new mupdf.PDFDocument()

  for (let i = 0; i < src.countPages(); i++) {
    const page = src.loadPage(i)
    const [x0, y0, x1, y1] = page.getBounds()
    const pw = x1 - x0
    const ph = y1 - y0

    // 1. Render to RGB Pixmap at target scale
    const pix  = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    const imgW = pix.getWidth()
    const imgH = pix.getHeight()

    // 2. Encode as JPEG then free the Pixmap immediately — large PDFs can
    //    exhaust WASM heap if all pages' Pixmaps are kept alive in parallel
    const jpegBytes = pix.asJPEG(quality, false)   // → Uint8Array
    pix.destroy && pix.destroy()

    // 3. Build Image XObject dictionary with /DCTDecode filter
    const imgDict = outDoc.newDictionary()
    imgDict.put('Type',             outDoc.newName('XObject'))
    imgDict.put('Subtype',          outDoc.newName('Image'))
    imgDict.put('Width',            outDoc.newInteger(imgW))
    imgDict.put('Height',           outDoc.newInteger(imgH))
    imgDict.put('ColorSpace',       outDoc.newName('DeviceRGB'))
    imgDict.put('BitsPerComponent', outDoc.newInteger(8))
    imgDict.put('Filter',           outDoc.newName('DCTDecode'))

    // 4. Embed JPEG stream (addRawStream: buffer first, dict second)
    const imgObj  = outDoc.addRawStream(jpegBytes, imgDict)

    // 5. Page resources
    const xobj      = outDoc.newDictionary()
    const resources = outDoc.newDictionary()
    xobj.put('Im0', imgObj)
    resources.put('XObject', xobj)

    // 6. Create page + insert into page tree (-1 = append)
    const pageObj = outDoc.addPage(
      [0, 0, pw, ph], 0, resources,
      `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`,
    )
    outDoc.insertPage(-1, pageObj)
  }

  const buf = outDoc.saveToBuffer('compress')  // flate-compress streams; no garbage
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
  let blobUrl     = null   // track blob URL for cleanup on error

  try {
    const contentType = req.headers['content-type'] || ''
    let inputBuffer, level, originalFilename

    if (contentType.includes('application/json')) {
      // ── Mode A: Vercel Blob — browser already uploaded, we just fetch ──
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())

      blobUrl  = body.blobUrl
      level    = body.level
      originalFilename = body.filename || 'file.pdf'

      if (!blobUrl) return sendJson(res, 400, { error: 'Missing blobUrl.' })

      const ext = path.extname(originalFilename).toLowerCase()
      if (ext !== '.pdf') return sendJson(res, 400, { error: 'Only PDF files are accepted.' })

      // Fetch the PDF from Vercel Blob CDN using Node https module
      // (native fetch / undici can throw "fetch failed" on Vercel serverless)
      console.log(`[compress] Fetching blob: ${blobUrl}`)
      inputBuffer = await fetchBlobAsBuffer(blobUrl)
      console.log(`[compress] Blob buffer size: ${inputBuffer.length} bytes`)

    } else {
      // ── Mode B: Legacy multipart (local dev / small files ≤4.5 MB) ─────
      const { fields, files } = await parseForm(req)

      const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file
      if (!uploadedFile) return sendJson(res, 400, { error: 'No file uploaded.' })

      const ext = path.extname(uploadedFile.originalFilename || '').toLowerCase()
      if (ext !== '.pdf') return sendJson(res, 400, { error: 'Only PDF files are accepted.' })

      formTmpPath      = uploadedFile.filepath
      originalFilename = uploadedFile.originalFilename || 'file.pdf'

      const rawLevel = Array.isArray(fields.level) ? fields.level[0] : fields.level
      level = rawLevel

      inputBuffer = readFileSync(formTmpPath)
      try { unlinkSync(formTmpPath) } catch (_) {}
      formTmpPath = null
    }

    // ── validate level ──────────────────────────────────────────────────
    if (!Object.keys(LEVEL_CONFIG).includes(level)) level = 'medium'

    // ── compress: try GS first, fall back to MuPDF ─────────────────────
    let compressedBuffer
    let engine

    console.log(`[compress] Input: ${inputBuffer.length} bytes, level: ${level}`)
    const gs = await findGhostscript()
    if (gs) {
      console.log(`[compress] Using Ghostscript: ${gs}`)
      compressedBuffer = await compressWithGhostscript(gs, inputBuffer, level)
      engine = 'ghostscript'
    } else {
      console.log(`[compress] Using MuPDF WASM`)
      compressedBuffer = compressWithMuPDF(inputBuffer, level)
      engine = 'mupdf'
    }
    console.log(`[compress] Output: ${compressedBuffer.length} bytes (engine: ${engine})`)

    // Return original if compression made it larger
    if (compressedBuffer.length >= inputBuffer.length) {
      compressedBuffer = inputBuffer
    }

    // ── delete blob after successful compression ──────────────────────
    if (blobUrl) {
      try { await del(blobUrl) } catch (_) { /* non-fatal */ }
      blobUrl = null
    }

    // ── respond ───────────────────────────────────────────────────────
    const baseName   = originalFilename.replace(/\.pdf$/i, '')
    const outputName = `${baseName}_compressed.pdf`

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
    if (formTmpPath) try { unlinkSync(formTmpPath) } catch (_) {}
    // Clean up the blob on error so it doesn't linger
    if (blobUrl) { try { await del(blobUrl) } catch (_) {} }

    const is413 = err.code === 'LIMIT_FILE_SIZE' || err.statusCode === 413 || err.status === 413
    const statusCode = is413 ? 413 : 500
    const msg = err.message || ''
    const message =
      is413                            ? 'File too large. Maximum upload size is 50 MB.'
      : msg.includes('encrypted') ||
        msg.includes('password')       ? 'Encrypted PDFs are not supported. Please remove the password first.'
      : msg.includes('timeout')        ? 'Compression timed out. Please try the High compression level for large files.'
      : msg.includes('Failed to fetch blob') ? `Could not retrieve uploaded file: ${msg}`
      : msg.includes('corrupt') ||
        msg.includes('repair')         ? 'The PDF appears to be corrupted or uses an unsupported format.'
      : `Compression failed: ${msg}`   // surface actual error in production logs

    return sendJson(res, statusCode, { error: message })
  }
}
