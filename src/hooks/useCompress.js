import { useState, useCallback, useRef } from 'react'
import axios from 'axios'
import { upload } from '@vercel/blob/client'

/**
 * useCompress — handles the full lifecycle of a PDF compression request.
 *
 * States: idle → uploading → processing → done | error
 *
 * Upload strategy (auto-selected):
 *
 *   Mode A — Vercel Blob (production, any file size):
 *     1. POST /api/blob-upload  → token exchange
 *     2. PUT  <vercel-blob-cdn>  → browser uploads DIRECTLY to CDN (no 4.5 MB limit)
 *     3. POST /api/compress      → { blobUrl, level, filename }  (tiny JSON body)
 *        Function fetches from CDN, compresses, deletes blob, returns PDF.
 *
 *   Mode B — Legacy multipart (local dev / BLOB_READ_WRITE_TOKEN not configured):
 *     POST /api/compress  multipart/form-data  { file, level }
 *     Works for files ≤ ~4 MB on local Node server.
 *
 * The mode is determined by calling GET /api/blob-upload first. If the server
 * returns { localMode: true }, Mode B is used; otherwise Mode A proceeds.
 */
export function useCompress() {
  const [status, setStatus]           = useState('idle')
  const [progress, setProgress]       = useState(0)
  const [originalSize, setOriginalSize] = useState(null)
  const [compressedSize, setCompressedSize] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadName, setDownloadName] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  const blobRef    = useRef(null)
  const blobUrlRef = useRef(null)

  const reset = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    blobRef.current = null
    setStatus('idle')
    setProgress(0)
    setOriginalSize(null)
    setCompressedSize(null)
    setDownloadUrl(null)
    setDownloadName(null)
    setErrorMessage(null)
  }, [])

  /**
   * triggerDownload — programmatic download for Android Chrome compatibility.
   * Android Chrome/Samsung Browser can silently ignore <a download> on blob
   * URLs already in the DOM. Creating a transient anchor + clicking it within
   * a user gesture is the only reliable path.
   */
  const triggerDownload = useCallback(() => {
    if (!blobRef.current || !downloadName) return
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const url = URL.createObjectURL(blobRef.current)
    blobUrlRef.current = url

    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      blobUrlRef.current = null
    }, 60_000)
  }, [downloadName])

  const compress = useCallback(async (file, level = 'medium') => {
    reset()
    setOriginalSize(file.size)
    setStatus('uploading')
    setProgress(5)

    try {
      // ── Check if Blob upload is available ─────────────────────────────
      // POST { filename } to /api/blob-upload:
      //   → { clientToken } if BLOB_READ_WRITE_TOKEN is set (production)
      //   → { localMode: true } if not set (local dev) → fall back to multipart
      let useBlob = false
      let clientToken = null
      try {
        const modeCheck = await axios.post('/api/blob-upload',
          JSON.stringify({ filename: file.name }),
          { headers: { 'Content-Type': 'application/json' }, timeout: 5_000 }
        )
        if (modeCheck.data?.clientToken) {
          clientToken = modeCheck.data.clientToken
          useBlob = true
        }
      } catch {
        useBlob = false
      }

      let inputForCompress   // { blobUrl, filename } or FormData
      let useJsonMode = false

      if (useBlob && clientToken) {
        // ── Mode A: Vercel Blob client upload ─────────────────────────
        setProgress(10)

        // Upload file directly from browser to Vercel Blob CDN using pre-issued clientToken
        const newBlob = await upload(file.name, file, {
          access: 'public',
          clientUploadToken: clientToken,
          onUploadProgress: ({ percentage }) => {
            // Scale blob upload progress to 10–50%
            setProgress(Math.round(percentage * 0.4) + 10)
          },
        })

        setProgress(55)
        inputForCompress = { blobUrl: newBlob.url, filename: file.name }
        useJsonMode = true

      } else {
        // ── Mode B: Legacy multipart (local dev) ──────────────────────
        setProgress(10)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('level', level)
        inputForCompress = formData
        useJsonMode = false
      }

      // ── POST to /api/compress ─────────────────────────────────────────
      const response = await axios.post(
        '/api/compress',
        useJsonMode
          ? JSON.stringify({ ...inputForCompress, level })
          : inputForCompress,
        {
          responseType: 'blob',
          headers: useJsonMode ? { 'Content-Type': 'application/json' } : {},
          timeout: 60_000,
          onUploadProgress: useJsonMode ? undefined : (evt) => {
            // Multipart mode: track upload progress 10–50%
            if (evt.total) {
              setProgress(Math.round((evt.loaded / evt.total) * 40) + 10)
            }
          },
          onDownloadProgress: (evt) => {
            if (evt.total) {
              const pct = Math.round((evt.loaded / evt.total) * 40) + 55
              setProgress(pct)
            } else {
              setProgress((prev) => (prev < 80 ? prev + 3 : prev))
            }
          },
        },
      )

      setStatus('processing')
      setProgress(97)

      // Check for error response embedded as JSON blob
      if (response.data.type === 'application/json') {
        const text = await response.data.text()
        const json = JSON.parse(text)
        throw new Error(json.error || 'Compression failed')
      }

      const blob = response.data
      blobRef.current = blob

      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      const compressedBytes =
        parseInt(response.headers['x-compressed-size'], 10) || blob.size

      setCompressedSize(compressedBytes)
      setDownloadUrl(url)

      const baseName = file.name.replace(/\.pdf$/i, '')
      setDownloadName(`${baseName}_compressed.pdf`)

      setProgress(100)
      setStatus('done')

    } catch (err) {
      let msg
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        msg = 'The request timed out. Try the High compression level — it is fastest for large files.'
      } else if (err?.response?.data instanceof Blob) {
        msg = await err.response.data.text().then((t) => {
          try { return JSON.parse(t).error } catch { return t }
        })
      } else if (err?.response?.status === 413) {
        msg = 'File too large. Maximum upload size is 50 MB.'
      } else {
        msg = err.message || 'An unexpected error occurred.'
      }
      setErrorMessage(msg)
      setStatus('error')
      setProgress(0)
    }
  }, [reset])

  return {
    compress,
    reset,
    triggerDownload,
    status,
    progress,
    originalSize,
    compressedSize,
    downloadUrl,
    downloadName,
    errorMessage,
  }
}
