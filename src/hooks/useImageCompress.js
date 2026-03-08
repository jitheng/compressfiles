import { useState, useCallback, useRef } from 'react'

const QUALITY_MAP = {
  low:    0.85,
  medium: 0.60,
  high:   0.35,
}

/**
 * useImageCompress — browser-side image compression using the Canvas API.
 *
 * States: idle → processing → done | error
 *
 * No server roundtrip. Uses createImageBitmap + canvas.toBlob to re-encode
 * JPG/PNG/WebP as JPEG at a reduced quality. Entirely client-side — no
 * Vercel body limit concerns.
 *
 * If the canvas-encoded output is larger than the original file, the original
 * file bytes are used as the download (no point making it bigger).
 */
export function useImageCompress() {
  const [status, setStatus]               = useState('idle')
  const [progress, setProgress]           = useState(0)
  const [originalSize, setOriginalSize]   = useState(null)
  const [compressedSize, setCompressedSize] = useState(null)
  const [downloadUrl, setDownloadUrl]     = useState(null)
  const [downloadName, setDownloadName]   = useState(null)
  const [errorMessage, setErrorMessage]   = useState(null)

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
    setStatus('processing')
    setProgress(10)

    try {
      // Decode the image file into an ImageBitmap
      const bitmap = await createImageBitmap(file)
      setProgress(40)

      const { width, height } = bitmap

      // Use a regular canvas element (OffscreenCanvas is not available in jsdom)
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      // Fill white before drawing — transparent PNG areas become white in JPEG
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close?.()

      setProgress(80)

      const quality = QUALITY_MAP[level] ?? 0.60

      // canvas.toBlob is callback-based — wrap in Promise
      const compressedBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })

      // If canvas output is larger than original, use the original file as-is
      // (File extends Blob — no need to copy bytes)
      let finalBlob
      let finalSize
      if (compressedBlob && compressedBlob.size < file.size) {
        finalBlob = compressedBlob
        finalSize = compressedBlob.size
      } else {
        finalBlob = file
        finalSize = file.size
      }

      blobRef.current = finalBlob

      const url = URL.createObjectURL(finalBlob)
      blobUrlRef.current = url

      setCompressedSize(finalSize)
      setDownloadUrl(url)

      const baseName = file.name.replace(/\.[^.]+$/, '')
      setDownloadName(`${baseName}_compressed.jpg`)

      setProgress(100)
      setStatus('done')

    } catch (err) {
      setErrorMessage(err.message || 'Failed to compress image. Please try again.')
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
