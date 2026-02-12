/**
 * Vercel Serverless Function: POST /api/blob-upload
 *
 * Issues a short-lived Vercel Blob client-upload token so the browser can
 * PUT a file directly to Vercel Blob CDN — bypassing the 4.5 MB serverless
 * function body limit entirely.
 *
 * Uses generateClientTokenFromReadWriteToken() — the correct low-level API
 * for non-Next.js (raw Node HTTP) handlers.  handleUpload() requires a Web
 * API Request object and is Next.js-only.
 *
 * Protocol:
 *   Browser → POST /api/blob-upload { filename: "foo.pdf" }
 *   Server  ← { token: "<client-token>", blobApiUrl: "https://blob.vercel-storage.com" }
 *
 *   Browser → PUT <blobApiUrl>/<pathname>?token=<client-token>  (file bytes)
 *   CDN     ← { url: "https://…vercel-storage.com/foo-<rand>.pdf" }
 *
 *   Browser → POST /api/compress { blobUrl, level, filename }
 *
 * Local dev:
 *   BLOB_READ_WRITE_TOKEN not set → returns { localMode: true }
 *   Client falls back to legacy multipart POST (works for files ≤ ~4 MB).
 */

import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'

export const config = {
  api: {
    bodyParser: false,
  },
}

function sendJson(res, code, body) {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': '*',
  })
  res.end(payload)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    return res.end()
  }

  // Local dev fallback — no BLOB_READ_WRITE_TOKEN configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 200, { localMode: true })
  }

  try {
    // Parse request body to get the filename
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const filename = body.filename || 'upload.pdf'

    // Validate: PDFs only
    if (!filename.toLowerCase().endsWith('.pdf')) {
      return sendJson(res, 400, { error: 'Only PDF files are accepted.' })
    }

    // Generate a short-lived client upload token
    // This does NOT require a Web API Request object — works with raw Node HTTP
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname: filename,
      onUploadCompleted: {
        // callbackUrl is required by the API but we don't need the callback —
        // we handle cleanup in /api/compress after fetching the blob.
        // Use a dummy URL that returns 200 (Vercel ignores non-2xx gracefully).
        callbackUrl: `https://${process.env.VERCEL_URL || 'localhost'}/api/blob-noop`,
      },
      allowedContentTypes: ['application/pdf'],
      // Token valid for 30 minutes — generous for large file uploads
      maximumSizeInBytes: 50 * 1024 * 1024,
    })

    return sendJson(res, 200, { clientToken })
  } catch (err) {
    console.error('[blob-upload] Error generating token:', err)
    return sendJson(res, 500, { error: err.message || 'Failed to generate upload token.' })
  }
}
