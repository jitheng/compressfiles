import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import FileSizeDisplay, { formatBytes } from '../components/FileSizeDisplay'

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512.00 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
  })

  it('returns em dash for null', () => {
    expect(formatBytes(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(formatBytes(undefined)).toBe('—')
  })
})

describe('FileSizeDisplay', () => {
  it('renders original size', () => {
    render(<FileSizeDisplay originalSize={1024 * 100} compressedSize={null} />)
    expect(screen.getByTestId('original-size')).toHaveTextContent('100.00 KB')
  })

  it('renders compressed size when provided', () => {
    render(<FileSizeDisplay originalSize={1024 * 100} compressedSize={1024 * 60} />)
    expect(screen.getByTestId('compressed-size')).toHaveTextContent('60.00 KB')
  })

  it('shows savings bar when both sizes provided', () => {
    render(<FileSizeDisplay originalSize={1024 * 100} compressedSize={1024 * 60} />)
    expect(screen.getByTestId('savings-bar')).toBeInTheDocument()
  })

  it('does not show savings bar with only original size', () => {
    render(<FileSizeDisplay originalSize={1024 * 100} compressedSize={null} />)
    expect(screen.queryByTestId('savings-bar')).not.toBeInTheDocument()
  })
})
