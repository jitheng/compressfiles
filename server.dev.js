/**
 * Local development server for the /api/compress endpoint.
 * Mirrors the Vercel serverless function locally.
 *
 * Usage:
 *   node server.dev.js          (port 3001 by default)
 *   PORT=4000 node server.dev.js
 *
 * The Vite dev server proxies /api → http://localhost:3001
 */

import http from 'http'
import handler from './api/compress.js'

const PORT = process.env.PORT || 3001

const server = http.createServer((req, res) => {
  if (req.url === '/api/compress' || req.url === '/api/compress/') {
    return handler(req, res)
  }
  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`[dev-api] Listening on http://localhost:${PORT}`)
  console.log('[dev-api] POST /api/compress is ready')
})
