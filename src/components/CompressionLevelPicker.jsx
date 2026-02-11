import React from 'react'

const LEVELS = [
  {
    value: 'low',
    label: 'Low',
    description: 'Smaller reduction, best quality',
    icon: '🟢',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Balanced size & quality',
    icon: '🟡',
  },
  {
    value: 'high',
    label: 'High',
    description: 'Maximum reduction',
    icon: '🔴',
  },
]

export default function CompressionLevelPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Compression level">
      {LEVELS.map((level) => {
        const selected = value === level.value
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(level.value)}
            className={[
              'flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all duration-150',
              selected
                ? 'border-brand-500 bg-brand-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
            data-testid={`level-${level.value}`}
          >
            <span className="text-xl">{level.icon}</span>
            <span className={`font-semibold text-sm ${selected ? 'text-brand-600' : 'text-slate-700'}`}>
              {level.label}
            </span>
            <span className="text-xs text-slate-400 leading-tight">{level.description}</span>
          </button>
        )
      })}
    </div>
  )
}
