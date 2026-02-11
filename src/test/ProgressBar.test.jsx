import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProgressBar from '../components/ProgressBar'

describe('ProgressBar', () => {
  it('renders with a progress value', () => {
    render(<ProgressBar progress={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
  })

  it('shows the progress percentage text', () => {
    render(<ProgressBar progress={75} label="Uploading…" />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('defaults to Processing label', () => {
    render(<ProgressBar progress={0} />)
    expect(screen.getByText('Processing…')).toBeInTheDocument()
  })
})
