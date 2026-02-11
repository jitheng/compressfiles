import { useState, useCallback, useRef } from 'react'
import axios from 'axios'

/**
 * useCompress — handles the full lifecycle of a PDF compression request.
 *
 * States: idle → uploading → processing → done | error
 *
 * Mobile notes:
 * - We keep a blobRef so the caller can trigger a forced download on Android
 *   (Android Chrome sometimes silently ignores <a download> on blob URLs).
 * - The triggerDownload() helper creates a transient <a> element and
 *   programmatically clicks it — the only reliable download path on Android.
 */
export function useCompress() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [originalSize, setOriginalSize] = useState(null)
  const [compressedSize, setCompressedSize] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadName, setDownloadName] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // Keep the raw blob so we can force-download on Android
  const blobRef = useRef(null)
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
   * triggerDownload — programmatic download that works on Android Chrome.
   *
   * Android Chrome/Samsung Browser can silently ignore <a href=blob: download>
   * when the anchor is already in the DOM at render time. Creating a transient
   * anchor and clicking it within the same user-gesture stack bypasses that.
   */
  const triggerDownload = useCallback(() => {
    if (!blobRef.current || !downloadName) return

    // Revoke any previous URL and create a fresh one
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const url = URL.createObjectURL(blobRef.current)
    blobUrlRef.current = url

    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    // Clean up the DOM element; keep the blob URL alive for 60 s
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
    setProgress(10)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('level', level)

    try {
      const response = await axios.post('/api/compress', formData, {
        responseType: 'blob',
        // Do NOT set Content-Type manually — browser must set the
        // multipart boundary; axios will do it automatically.
        // 60 s matches Vercel function maxDuration; large files can take 40-55 s.
        timeout: 60_000,
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded / evt.total) * 40) + 10 // 10–50%
            setProgress(pct)
          }
        },
        onDownloadProgress: (evt) => {
          // Content-Length may be absent on Vercel (chunked transfer),
          // so guard against evt.total being 0/undefined.
          if (evt.total) {
            const pct = Math.round((evt.loaded / evt.total) * 40) + 55 // 55–95%
            setProgress(pct)
          } else {
            // Pulse between 60–80% so the bar doesn't appear frozen
            setProgress((prev) => (prev < 80 ? prev + 3 : prev))
          }
        },
      })

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

      // Create the object URL for the inline <a> fallback (desktop)
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      // Parse compressed size from header (or fallback to blob size)
      const compressedBytes =
        parseInt(response.headers['x-compressed-size'], 10) || blob.size

      setCompressedSize(compressedBytes)
      setDownloadUrl(url)

      // Build download filename: original_compressed.pdf
      const baseName = file.name.replace(/\.pdf$/i, '')
      setDownloadName(`${baseName}_compressed.pdf`)

      setProgress(100)
      setStatus('done')
    } catch (err) {
      let msg
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        msg = 'The request timed out. Your PDF may be too large or complex — try the High compression level which is faster to process.'
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
