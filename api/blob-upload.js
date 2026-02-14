/**
 * Vercel Serverless Function: POST /api/blob-upload
 *
 * Implements the handleUploadUrl wire protocol that @vercel/blob/client's
 * upload() function expects. This is the correct approach for non-Next.js
 * (raw Node HTTP) handlers — instead of using handleUpload() which requires
 * a Web API Request object and is Next.js-only.
 *
 * Wire protocol (sent by upload() client):
 *   Browser → POST /api/blob-upload
 *             { type: 'blob.generate-client-token',
 *               payload: { pathname: 'foo.pdf', callbackUrl: '', ... } }
 *   Server  ← { clientToken: '<signed-token>' }
 *
 *   Browser then PUTs the file directly to Vercel Blob CDN using the token.
 *   This bypasses the 4.5 MB serverless function body limit entirely.
 *
 *   After CDN upload, browser → POST /api/compress { blobUrl, level, filename }
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
    // Parse request body
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())

    // Handle the handleUploadUrl wire protocol:
    // upload() sends { type: 'blob.generate-client-token', payload: { pathname, callbackUrl } }
    if (body.type === 'blob.generate-client-token') {
      const { pathname, callbackUrl } = body.payload || {}

      if (!pathname || !pathname.toLowerCase().endsWith('.pdf')) {
        return sendJson(res, 400, { error: 'Only PDF files are accepted.' })
      }

      // Use generateClientTokenFromReadWriteToken — works with raw Node HTTP,
      // unlike handleUpload() which requires a Web API Request object.
      //
      // IMPORTANT: Do NOT fabricate a callbackUrl using VERCEL_URL.
      // VERCEL_URL points to the deployment preview URL which has Vercel SSO
      // protection — Vercel's callback POST gets a 401/302 instead of 200,
      // leaving the blob object in a pending/unconfirmed state that resolves
      // as HTTP 404 when compress.js tries to fetch it immediately after upload.
      // Only set onUploadCompleted when the client provides a real callbackUrl.
      const tokenOptions = {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname,
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 50 * 1024 * 1024,
      }
      if (callbackUrl) {
        tokenOptions.onUploadCompleted = { callbackUrl }
      }

      const clientToken = await generateClientTokenFromReadWriteToken(tokenOptions)

      return sendJson(res, 200, { clientToken })
    }

    // Unknown request type
    return sendJson(res, 400, { error: 'Unknown request type.' })

  } catch (err) {
    console.error('[blob-upload] Error:', err)
    return sendJson(res, 500, { error: err.message || 'Failed to generate upload token.' })
  }
}
