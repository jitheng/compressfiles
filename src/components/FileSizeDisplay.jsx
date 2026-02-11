import React from 'react'

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

function SavingsBadge({ original, compressed }) {
  if (!original || !compressed) return null
  const pct = Math.round(((original - compressed) / original) * 100)
  if (pct <= 0) return (
    <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      No reduction
    </span>
  )
  return (
    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      -{pct}% smaller
    </span>
  )
}

export default function FileSizeDisplay({ originalSize, compressedSize }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid="size-display">
      <div className="grid grid-cols-2 divide-x divide-slate-200">
        {/* Before */}
        <div className="p-4 text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Before</p>
          <p className="text-xl font-bold text-slate-800" data-testid="original-size">
            {formatBytes(originalSize)}
          </p>
        </div>
        {/* After */}
        <div className="p-4 text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">After</p>
          <p
            className={`text-xl font-bold ${compressedSize ? 'text-emerald-600' : 'text-slate-800'}`}
            data-testid="compressed-size"
          >
            {formatBytes(compressedSize)}
          </p>
        </div>
      </div>

      {/* Savings bar */}
      {originalSize && compressedSize && (
        <div className="px-4 pb-4 pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Compression</span>
            <SavingsBadge original={originalSize} compressed={compressedSize} />
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-700"
              style={{ width: `${Math.max(0, Math.min(100, ((originalSize - compressedSize) / originalSize) * 100))}%` }}
              data-testid="savings-bar"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export { formatBytes }
