import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { useCompress } from '../hooks/useCompress'

vi.mock('axios')

// Mock URL.createObjectURL / revokeObjectURL (not available in jsdom)
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// Mock document.body.appendChild / removeChild for triggerDownload
const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
  // Simulate the anchor click without actually navigating
  return el
})
const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

describe('useCompress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useCompress())
    expect(result.current.status).toBe('idle')
    expect(result.current.progress).toBe(0)
  })

  it('transitions to done on successful compression', async () => {
    const mockBlob = new Blob(['%PDF compressed'], { type: 'application/pdf' })
    axios.post.mockResolvedValue({
      data: mockBlob,
      headers: { 'x-compressed-size': '1000' },
    })

    const { result } = renderHook(() => useCompress())
    const mockFile = new File(['%PDF original content'], 'test.pdf', {
      type: 'application/pdf',
    })
    Object.defineProperty(mockFile, 'size', { value: 2000 })

    await act(async () => {
      await result.current.compress(mockFile, 'medium')
    })

    expect(result.current.status).toBe('done')
    expect(result.current.originalSize).toBe(2000)
    expect(result.current.compressedSize).toBe(1000)
    expect(result.current.downloadUrl).toBe('blob:mock-url')
    expect(result.current.downloadName).toBe('test_compressed.pdf')
  })

  it('transitions to error on API failure', async () => {
    axios.post.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCompress())
    const mockFile = new File(['%PDF'], 'broken.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.compress(mockFile, 'low')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('Network error')
  })

  it('resets state correctly', async () => {
    const mockBlob = new Blob(['%PDF'], { type: 'application/pdf' })
    axios.post.mockResolvedValue({
      data: mockBlob,
      headers: { 'x-compressed-size': '500' },
    })

    const { result } = renderHook(() => useCompress())
    const mockFile = new File(['%PDF'], 'reset.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.compress(mockFile, 'high')
    })

    expect(result.current.status).toBe('done')

    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.progress).toBe(0)
    expect(result.current.originalSize).toBeNull()
    expect(result.current.compressedSize).toBeNull()
    expect(result.current.downloadUrl).toBeNull()
  })

  it('triggerDownload creates a transient anchor and clicks it (Android fallback)', async () => {
    const mockBlob = new Blob(['%PDF'], { type: 'application/pdf' })
    axios.post.mockResolvedValue({
      data: mockBlob,
      headers: { 'x-compressed-size': '500' },
    })

    const { result } = renderHook(() => useCompress())
    const mockFile = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.compress(mockFile, 'medium')
    })

    expect(result.current.status).toBe('done')

    // triggerDownload should be a function
    expect(typeof result.current.triggerDownload).toBe('function')

    act(() => {
      result.current.triggerDownload()
    })

    // Should have appended at least one transient <a> to body
    const anchorCall = appendChildSpy.mock.calls.find(
      ([el]) => el?.tagName === 'A',
    )
    expect(anchorCall).toBeTruthy()
    expect(anchorCall[0].download).toBe('doc_compressed.pdf')
  })
})
