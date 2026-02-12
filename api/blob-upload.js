/**
 * Vercel Serverless Function: POST /api/blob-upload
 *
 * Handles the Vercel Blob client-upload token exchange.
 * The browser calls this endpoint FIRST to get a short-lived upload token,
 * then uploads the file DIRECTLY to Vercel Blob CDN — bypassing the 4.5 MB
 * serverless function body limit entirely.
 *
 * Flow:
 *   Browser                  /api/blob-upload          Vercel Blob CDN
 *     │                            │                         │
 *     │── POST (filename+level) ──►│                         │
 *     │◄── upload token ───────────│                         │
 *     │                            │                         │
 *     │────── PUT file ────────────────────────────────────►│
 *     │◄───── blobUrl ─────────────────────────────────────│
 *     │                            │                         │
 *     │── POST /api/compress ─────►│                         │
 *     │   { blobUrl, level }        │                         │
 *     │◄── compressed PDF ─────────│                         │
 *
 * Required env var: BLOB_READ_WRITE_TOKEN (set in Vercel dashboard)
 *
 * Local dev fallback:
 *   If BLOB_READ_WRITE_TOKEN is not set, returns { localMode: true }
 *   and the client falls back to the legacy direct multipart POST.
 */

import { handleUpload } from '@vercel/blob/client'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    return res.end()
  }

  // Local dev: BLOB_READ_WRITE_TOKEN not configured — tell client to use
  // legacy direct multipart upload (works fine for files ≤4 MB locally)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const payload = JSON.stringify({ localMode: true })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    })
    return res.end(payload)
  }

  try {
    // Collect request body
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())

    const jsonResponse = await handleUpload({
      body,
      request: {
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
        ),
      },
      onBeforeGenerateToken: async (pathname) => {
        // Validate: only allow PDF files
        if (!pathname.toLowerCase().endsWith('.pdf')) {
          throw new Error('Only PDF files are accepted.')
        }
        return {
          allowedContentTypes: ['application/pdf'],
          addRandomSuffix: true,
          // Token expires after 30 minutes — enough time to upload + compress
          tokenExpirationInSeconds: 1800,
        }
      },
      onUploadCompleted: async ({ blob }) => {
        // Upload is complete — blob.url is now accessible by /api/compress
        // Nothing to persist here; compress will download + delete immediately
        console.log('[blob-upload] Upload completed:', blob.url)
      },
    })

    const payload = JSON.stringify(jsonResponse)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    })
    res.end(payload)
  } catch (err) {
    console.error('[blob-upload] Error:', err)
    const payload = JSON.stringify({ error: err.message || 'Token generation failed.' })
    res.writeHead(400, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }
}
