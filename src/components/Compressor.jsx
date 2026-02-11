import React, { useState, useCallback } from 'react'
import DropZone from './DropZone'
import CompressionLevelPicker from './CompressionLevelPicker'
import FileSizeDisplay from './FileSizeDisplay'
import ProgressBar from './ProgressBar'
import { useCompress } from '../hooks/useCompress'

export default function Compressor() {
  const [file, setFile] = useState(null)
  const [level, setLevel] = useState('medium')

  const {
    compress,
    reset,
    status,      // 'idle' | 'uploading' | 'processing' | 'done' | 'error'
    progress,
    originalSize,
    compressedSize,
    downloadUrl,
    downloadName,
    errorMessage,
  } = useCompress()

  const handleFile = useCallback(
    (f) => {
      setFile(f)
      reset()
    },
    [reset],
  )

  const handleCompress = useCallback(() => {
    if (!file) return
    compress(file, level)
  }, [file, level, compress])

  const handleReset = useCallback(() => {
    setFile(null)
    reset()
  }, [reset])

  const isIdle = status === 'idle'
  const isBusy = status === 'uploading' || status === 'processing'
  const isDone = status === 'done'
  const isError = status === 'error'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Drop zone (always visible unless done) */}
      {!isDone && (
        <DropZone onFile={handleFile} disabled={isBusy} />
      )}

      {/* Selected file info */}
      {file && !isDone && (
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          {!isBusy && (
            <button
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Remove file"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Compression level picker */}
      {file && !isDone && (
        <div>
          <p className="text-sm font-semibold text-slate-600 mb-3">Compression level</p>
          <CompressionLevelPicker value={level} onChange={setLevel} disabled={isBusy} />
        </div>
      )}

      {/* Progress */}
      {isBusy && (
        <ProgressBar
          progress={progress}
          label={status === 'uploading' ? 'Uploading…' : 'Compressing…'}
        />
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Compression failed</p>
            <p className="text-xs text-red-500 mt-0.5">{errorMessage || 'An unexpected error occurred. Please try again.'}</p>
          </div>
        </div>
      )}

      {/* Action button */}
      {file && !isDone && (
        <button
          className="btn-primary w-full py-3 text-base"
          onClick={handleCompress}
          disabled={isBusy}
          data-testid="compress-btn"
        >
          {isBusy ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Compressing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5.25-9.75L12 3 6.75 6.25M3 12l9 9 9-9" />
              </svg>
              Compress PDF
            </>
          )}
        </button>
      )}

      {/* Done state */}
      {isDone && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          {/* Success header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Compression complete!</p>
              <p className="text-xs text-slate-400">Your file is ready to download</p>
            </div>
          </div>

          {/* Size comparison */}
          <FileSizeDisplay originalSize={originalSize} compressedSize={compressedSize} />

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href={downloadUrl}
              download={downloadName}
              className="btn-primary flex-1 py-3 text-base no-underline"
              data-testid="download-btn"
              onClick={() => {
                // Revoke object URL after a short delay to free memory
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000)
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download compressed PDF
            </a>
            <button
              className="btn-secondary px-4"
              onClick={handleReset}
              data-testid="compress-another-btn"
            >
              Compress another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
