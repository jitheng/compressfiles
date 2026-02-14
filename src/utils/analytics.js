/**
 * analytics.js — GA4 Advanced Event Tracking
 *
 * Wraps gtag() with safe checks so calls work in local dev
 * (no GA script loaded) without throwing.
 *
 * Usage:
 *   import { trackFileUploaded, trackCompressionStarted,
 *            trackCompressionSuccess, trackDownloadClicked } from '../utils/analytics'
 *
 * All events flow to GA4 property G-JXNG6DQVH8.
 * trackCompressionSuccess is also marked as a GA4 Conversion.
 */

const GA_ID = 'G-JXNG6DQVH8'

/** Safe gtag wrapper — no-ops if script not loaded (local dev) */
function gtag(...args) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...args)
  }
}

/**
 * Fired when a user selects or drops a PDF file.
 * @param {object} params
 * @param {number} params.file_size_bytes  - Raw file size in bytes
 * @param {string} params.file_name        - Original filename
 */
export function trackFileUploaded({ file_size_bytes, file_name }) {
  gtag('event', 'file_uploaded', {
    event_category: 'engagement',
    file_size_bytes,
    file_size_mb: +(file_size_bytes / 1024 / 1024).toFixed(2),
    file_name,
  })
}

/**
 * Fired when the user clicks "Compress PDF" and compression begins.
 * @param {object} params
 * @param {string} params.compression_level - 'low' | 'medium' | 'high'
 * @param {number} params.file_size_bytes   - Original file size in bytes
 */
export function trackCompressionStarted({ compression_level, file_size_bytes }) {
  gtag('event', 'compression_started', {
    event_category: 'engagement',
    compression_level,
    file_size_bytes,
    file_size_mb: +(file_size_bytes / 1024 / 1024).toFixed(2),
  })
}

/**
 * Fired when compression completes successfully.
 * This event is also marked as a GA4 Conversion (set in GA4 dashboard).
 * @param {object} params
 * @param {number} params.original_size_bytes    - Original file size in bytes
 * @param {number} params.compressed_size_bytes  - Compressed file size in bytes
 * @param {string} params.compression_level      - 'low' | 'medium' | 'high'
 */
export function trackCompressionSuccess({
  original_size_bytes,
  compressed_size_bytes,
  compression_level,
}) {
  const reduction_pct = original_size_bytes > 0
    ? +(((original_size_bytes - compressed_size_bytes) / original_size_bytes) * 100).toFixed(1)
    : 0

  // Primary conversion event — mark this as a conversion in GA4 dashboard
  gtag('event', 'compression_success', {
    event_category: 'conversion',
    compression_level,
    original_size_bytes,
    compressed_size_bytes,
    original_size_mb: +(original_size_bytes / 1024 / 1024).toFixed(2),
    compressed_size_mb: +(compressed_size_bytes / 1024 / 1024).toFixed(2),
    reduction_pct,
  })
}

/**
 * Fired when the user clicks the "Download compressed PDF" button.
 * @param {object} params
 * @param {number} params.compressed_size_bytes - Final compressed file size
 * @param {string} params.compression_level     - 'low' | 'medium' | 'high'
 */
export function trackDownloadClicked({ compressed_size_bytes, compression_level }) {
  gtag('event', 'download_clicked', {
    event_category: 'conversion',
    compression_level,
    compressed_size_bytes,
    compressed_size_mb: +(compressed_size_bytes / 1024 / 1024).toFixed(2),
  })
}
