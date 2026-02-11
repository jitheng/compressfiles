import { useState, useCallback, useRef } from 'react'
import axios from 'axios'

/**
 * useCompress — handles the full lifecycle of a PDF compression request.
 *
 * States: idle → uploading → processing → done | error
 */
export function useCompress() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [originalSize, setOriginalSize] = useState(null)
  const [compressedSize, setCompressedSize] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadName, setDownloadName] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // Track object URL for cleanup
  const blobUrlRef = useRef(null)

  const reset = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setStatus('idle')
    setProgress(0)
    setOriginalSize(null)
    setCompressedSize(null)
    setDownloadUrl(null)
    setDownloadName(null)
    setErrorMessage(null)
  }, [])

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
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded / evt.total) * 40) + 10 // 10–50%
            setProgress(pct)
          }
        },
        onDownloadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded / evt.total) * 40) + 55 // 55–95%
            setProgress(pct)
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
      const msg =
        err?.response?.data instanceof Blob
          ? await err.response.data.text().then((t) => {
              try { return JSON.parse(t).error } catch { return t }
            })
          : err.message || 'An unexpected error occurred.'
      setErrorMessage(msg)
      setStatus('error')
      setProgress(0)
    }
  }, [reset])

  return {
    compress,
    reset,
    status,
    progress,
    originalSize,
    compressedSize,
    downloadUrl,
    downloadName,
    errorMessage,
  }
}
