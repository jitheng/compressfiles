/**
 * Vercel Serverless Function: POST /api/blob-noop
 *
 * No-op endpoint for Vercel Blob's onUploadCompleted callback.
 * Vercel Blob requires a callbackUrl when onUploadCompleted is set.
 * This endpoint just returns 200 OK — the actual blob cleanup is
 * handled by /api/compress after it fetches and compresses the file.
 */

export const config = {
  api: { bodyParser: false },
}

export default function handler(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end('{"ok":true}')
}
