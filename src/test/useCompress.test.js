import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { useCompress } from '../hooks/useCompress'

vi.mock('axios')

// Mock @vercel/blob/client — upload() should never be called in test
// (tests always run in localMode because blob-upload returns { localMode: true })
vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn().mockRejectedValue(new Error('upload() should not be called in tests')),
}))

// Mock URL.createObjectURL / revokeObjectURL (not available in jsdom)
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// Mock document.body.appendChild / removeChild for triggerDownload
const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => el)
vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

/**
 * axios.post is called twice in compress():
 *   call 1: /api/blob-upload mode-check  → { localMode: true }  (triggers multipart fallback)
 *            server returns { localMode: true } when BLOB_READ_WRITE_TOKEN not set
 *            (no clientToken → useBlob=false → Mode B: multipart)
 *   call 2: /api/compress multipart      → { data: pdfBlob, headers: {...} }
 */
function mockCompressSuccess(pdfBlob, compressedSize = '1000') {
  axios.post
    .mockResolvedValueOnce({ data: { localMode: true } })   // blob-upload: no token → localMode
    .mockResolvedValueOnce({                                 // /api/compress response
      data: pdfBlob,
      headers: { 'x-compressed-size': compressedSize },
    })
}

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
    mockCompressSuccess(mockBlob, '1000')

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
    // Both calls fail — mode check throws, so useBlob=false, then compress throws
    axios.post
      .mockRejectedValueOnce(new Error('timeout'))  // blob-upload mode check fails
      .mockRejectedValueOnce(new Error('Network error'))  // compress fails

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
    mockCompressSuccess(mockBlob, '500')

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
    mockCompressSuccess(mockBlob, '500')

    const { result } = renderHook(() => useCompress())
    const mockFile = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.compress(mockFile, 'medium')
    })

    expect(result.current.status).toBe('done')
    expect(typeof result.current.triggerDownload).toBe('function')

    act(() => {
      result.current.triggerDownload()
    })

    // Should have appended at least one transient <a> to body
    const anchorCall = appendChildSpy.mock.calls.find(([el]) => el?.tagName === 'A')
    expect(anchorCall).toBeTruthy()
    expect(anchorCall[0].download).toBe('doc_compressed.pdf')
  })
})
