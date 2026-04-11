/**
 * DropZone — drag-and-drop + tap-to-browse file selector.
 *
 * Mobile fixes applied:
 *  1. <label htmlFor="pdf-file-input"> is the SOLE tap target for opening the
 *     file picker. The native htmlFor association is reliable on iOS Safari,
 *     Android Chrome, and Samsung Internet without any JS .click() call.
 *     DO NOT add inputRef.current?.click() inside the label's onClick —
 *     it triggers the picker a second time, causing iOS/Android to silently
 *     discard the user's selection (requires multiple attempts to select).
 *  2. `noClick: true` on react-dropzone — prevents the outer div's own click
 *     handler from also firing and opening a second picker.
 *  3. `accept="application/pdf,.pdf"` on the <input> — restricts the file
 *     picker to PDFs on iOS/Android.
 *  4. `touch-action: manipulation` via Tailwind `touch-manipulation` to
 *     prevent the 300 ms tap delay on mobile browsers.
 *  5. Keyboard: Enter/Space on the outer div calls open() from react-dropzone
 *     (the only legitimate use of programmatic open).
 */

import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

const MAX_SIZE_MB    = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export default function DropZone({ onFile, disabled }) {
  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        const code = rejectedFiles[0].errors[0]?.code
        if (code === 'file-too-large') {
          alert(`File is too large. Maximum size is ${MAX_SIZE_MB} MB.`)
        } else if (code === 'file-invalid-type') {
          alert('Only PDF files are accepted.')
        }
        return
      }
      if (acceptedFiles.length > 0) {
        onFile(acceptedFiles[0])
      }
    },
    [onFile],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept:   { 'application/pdf': ['.pdf'] },
    maxSize:  MAX_SIZE_BYTES,
    multiple: false,
    disabled,
    // noClick: true — the <label htmlFor> handles tap/click reliably on all
    // platforms. The outer div must NOT also open a picker or the browser
    // receives two concurrent open requests and may discard the selection.
    noClick: true,
    // noKeyboard: false — keep keyboard support; we add our own onKeyDown below
    noKeyboard: true,
  })

  // Keyboard handler: Enter or Space on the drop zone opens the picker.
  // This is the only place where programmatic open() is correct — it fires
  // from a keyboard event (not a touch/click that the label already handles).
  const handleKeyDown = useCallback(
    (e) => {
      if (disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
    [disabled, open],
  )

  return (
    <div
      {...getRootProps()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload PDF file"
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      // touch-manipulation removes the 300 ms tap delay on mobile
      className={[
        'relative flex flex-col items-center justify-center gap-4 touch-manipulation',
        'border-2 border-dashed rounded-2xl p-8 sm:p-12 transition-all duration-200',
        isDragActive
          ? 'border-brand-500 bg-brand-50 drop-active cursor-copy'
          : 'border-slate-300 bg-white hover:border-brand-500 hover:bg-brand-50 cursor-pointer',
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
      ].join(' ')}
      data-testid="dropzone"
    >
      {/*
        Hidden native <input> — react-dropzone attaches its onChange handler.
        The <label htmlFor="pdf-file-input"> below is the tap target on mobile.
        accept includes both MIME type and extension for broadest mobile support.
      */}
      <input
        {...getInputProps()}
        id="pdf-file-input"
        accept="application/pdf,.pdf"
        data-testid="file-input"
      />

      {/* PDF icon */}
      <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-8 h-8 text-brand-500"
          fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={1.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>

      {isDragActive ? (
        <p className="text-brand-600 font-semibold text-base">Drop your PDF here…</p>
      ) : (
        <div className="text-center space-y-2">
          <p className="text-slate-700 font-semibold text-base">
            Drag & drop a PDF here, or
          </p>
          {/*
            <label htmlFor> is the ONLY tap handler — no onClick needed.
            The native browser association between <label> and <input id>
            opens the file picker on first tap on iOS Safari, Android Chrome,
            and Samsung Internet without any JS involvement.
            Adding onClick with .click() here causes a double-open and
            silently discards the user's selection on mobile — DO NOT add it.
          */}
          <label
            htmlFor="pdf-file-input"
            className={[
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold',
              'bg-brand-500 text-white cursor-pointer select-none touch-manipulation',
              'hover:bg-brand-600 active:bg-brand-700 transition-colors duration-150',
              disabled ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Choose file
          </label>
          <p className="text-slate-400 text-xs">PDF only · Max {MAX_SIZE_MB} MB</p>
        </div>
      )}
    </div>
  )
}
