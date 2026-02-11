import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CompressionLevelPicker from '../components/CompressionLevelPicker'

describe('CompressionLevelPicker', () => {
  it('renders three level buttons', () => {
    render(<CompressionLevelPicker value="medium" onChange={() => {}} />)
    expect(screen.getByTestId('level-low')).toBeInTheDocument()
    expect(screen.getByTestId('level-medium')).toBeInTheDocument()
    expect(screen.getByTestId('level-high')).toBeInTheDocument()
  })

  it('marks the selected level as checked', () => {
    render(<CompressionLevelPicker value="high" onChange={() => {}} />)
    expect(screen.getByTestId('level-high')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('level-low')).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange when a level is clicked', () => {
    const onChange = vi.fn()
    render(<CompressionLevelPicker value="medium" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('level-low'))
    expect(onChange).toHaveBeenCalledWith('low')
  })

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn()
    render(<CompressionLevelPicker value="medium" onChange={onChange} disabled />)
    fireEvent.click(screen.getByTestId('level-low'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
