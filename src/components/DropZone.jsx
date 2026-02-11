import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

const MAX_SIZE_MB = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export default function DropZone({ onFile, disabled }) {
  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        const err = rejectedFiles[0].errors[0]
        if (err.code === 'file-too-large') {
          alert(`File is too large. Maximum size is ${MAX_SIZE_MB} MB.`)
        } else if (err.code === 'file-invalid-type') {
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={[
        'relative flex flex-col items-center justify-center gap-4',
        'border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all duration-200',
        isDragActive
          ? 'border-brand-500 bg-brand-50 drop-active'
          : 'border-slate-300 bg-white hover:border-brand-500 hover:bg-brand-50',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
      data-testid="dropzone"
    >
      <input {...getInputProps()} data-testid="file-input" />

      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>

      {isDragActive ? (
        <p className="text-brand-600 font-semibold text-base">Drop your PDF here…</p>
      ) : (
        <>
          <div className="text-center">
            <p className="text-slate-700 font-semibold text-base">
              Drag & drop a PDF here, or{' '}
              <span className="text-brand-500 underline underline-offset-2">browse</span>
            </p>
            <p className="text-slate-400 text-sm mt-1">PDF only · Max {MAX_SIZE_MB} MB</p>
          </div>
        </>
      )}
    </div>
  )
}
