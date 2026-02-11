import React from 'react'

export default function ProgressBar({ progress, label }) {
  return (
    <div className="w-full" data-testid="progress-bar">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{label || 'Processing…'}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-brand-500 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
