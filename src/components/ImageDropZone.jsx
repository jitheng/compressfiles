/**
 * ImageDropZone — drag-and-drop + tap-to-browse for image files.
 *
 * Mirrors DropZone.jsx exactly with image-specific accept types and copy.
 * All mobile fixes from DropZone.jsx apply here verbatim:
 *  1. <label htmlFor="image-file-input"> is the SOLE tap target — no onClick.
 *  2. `noClick: true` on react-dropzone — prevents the outer div from also
 *     opening a picker (would cause double-open and silent selection discard
 *     on iOS/Android — see CLAUDE.md bug #11).
 *  3. `touch-action: manipulation` removes the 300 ms tap delay on mobile.
 *  4. Keyboard: Enter/Space calls open() — only legitimate programmatic use.
 */

import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

const MAX_SIZE_MB    = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export default function ImageDropZone({ onFile, disabled }) {
  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        const code = rejectedFiles[0].errors[0]?.code
        if (code === 'file-too-large') {
          alert(`File is too large. Maximum size is ${MAX_SIZE_MB} MB.`)
        } else if (code === 'file-invalid-type') {
          alert('Only JPG, PNG, and WebP images are accepted.')
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
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png':  ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize:  MAX_SIZE_BYTES,
    multiple: false,
    disabled,
    // noClick: true — <label htmlFor> handles tap/click reliably on all platforms.
    // Adding onClick or calling .click() here causes a double-open and silently
    // discards the user's selection on iOS/Android (CLAUDE.md bug #11).
    noClick: true,
    noKeyboard: true,
  })

  // Keyboard handler: Enter or Space on the drop zone opens the picker.
  // This is the only place where programmatic open() is correct.
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
      aria-label="Upload image file"
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      className={[
        'relative flex flex-col items-center justify-center gap-4 touch-manipulation',
        'border-2 border-dashed rounded-2xl p-8 sm:p-12 transition-all duration-200',
        isDragActive
          ? 'border-brand-500 bg-brand-50 drop-active cursor-copy'
          : 'border-slate-300 bg-white hover:border-brand-500 hover:bg-brand-50 cursor-pointer',
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
      ].join(' ')}
      data-testid="image-dropzone"
    >
      {/*
        Hidden native <input> — react-dropzone attaches its onChange handler.
        The <label htmlFor="image-file-input"> below is the tap target on mobile.
        accept includes both MIME types and extensions for broadest mobile support.
      */}
      <input
        {...getInputProps()}
        id="image-file-input"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        data-testid="image-file-input"
      />

      {/* Image icon */}
      <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-8 h-8 text-brand-500"
          fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={1.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </div>

      {isDragActive ? (
        <p className="text-brand-600 font-semibold text-base">Drop your image here…</p>
      ) : (
        <div className="text-center space-y-2">
          <p className="text-slate-700 font-semibold text-base">
            Drag & drop an image here, or
          </p>
          {/*
            <label htmlFor> is the ONLY tap handler — no onClick needed.
            DO NOT add onClick with .click() here — causes double-open and
            silently discards the user's selection on iOS/Android (CLAUDE.md bug #11).
          */}
          <label
            htmlFor="image-file-input"
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
            Choose image
          </label>
          <p className="text-slate-400 text-xs">JPG, PNG, WebP · Max {MAX_SIZE_MB} MB</p>
        </div>
      )}
    </div>
  )
}
