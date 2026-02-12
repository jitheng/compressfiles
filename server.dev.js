/**
 * Local development server for /api/compress and /api/blob-upload.
 * Mirrors the Vercel serverless functions locally.
 *
 * Usage:
 *   node server.dev.js          (port 3001 by default)
 *   PORT=4000 node server.dev.js
 *
 * The Vite dev server proxies /api → http://localhost:3001
 *
 * Note: /api/blob-upload returns { localMode: true } when BLOB_READ_WRITE_TOKEN
 * is not set — the client automatically falls back to legacy multipart upload.
 */

import http from 'http'
import compressHandler from './api/compress.js'
import blobUploadHandler from './api/blob-upload.js'

const PORT = process.env.PORT || 3001

const server = http.createServer((req, res) => {
  const url = req.url?.split('?')[0]

  if (url === '/api/compress' || url === '/api/compress/') {
    return compressHandler(req, res)
  }
  if (url === '/api/blob-upload' || url === '/api/blob-upload/') {
    return blobUploadHandler(req, res)
  }
  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`[dev-api] Listening on http://localhost:${PORT}`)
  console.log('[dev-api] POST /api/compress    is ready')
  console.log('[dev-api] POST /api/blob-upload is ready')
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('[dev-api] Note: BLOB_READ_WRITE_TOKEN not set — using localMode (multipart upload)')
  }
})
