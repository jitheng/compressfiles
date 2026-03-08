import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useImageCompress } from '../hooks/useImageCompress'

// Mock URL.createObjectURL / revokeObjectURL (not available in jsdom)
global.URL.createObjectURL = vi.fn(() => 'blob:mock-image-url')
global.URL.revokeObjectURL = vi.fn()

// Mock document.body.appendChild / removeChild for triggerDownload
const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => el)
vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

// createImageBitmap is not available in jsdom — mock it globally
global.createImageBitmap = vi.fn()

// canvas.toBlob is not implemented in jsdom — mock it on the prototype
HTMLCanvasElement.prototype.toBlob = vi.fn()
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
}))

function makeMockFile(name = 'photo.png', size = 2000, type = 'image/png') {
  const file = new File(['x'.repeat(size)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('useImageCompress', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: createImageBitmap resolves with a 100x100 bitmap
    global.createImageBitmap.mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    })

    // Default: toBlob calls callback with a small compressed blob
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb) => {
      cb(new Blob(['compressed'], { type: 'image/jpeg' }))
    })
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useImageCompress())
    expect(result.current.status).toBe('idle')
    expect(result.current.progress).toBe(0)
    expect(result.current.downloadUrl).toBeNull()
  })

  it('transitions to done on successful compression', async () => {
    // Compressed blob is 8 bytes; original file is 2000 bytes → compressed wins
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb) => {
      cb(new Blob(['12345678'], { type: 'image/jpeg' }))
    })

    const { result } = renderHook(() => useImageCompress())
    const file = makeMockFile('photo.png', 2000)

    await act(async () => {
      await result.current.compress(file, 'medium')
    })

    expect(result.current.status).toBe('done')
    expect(result.current.originalSize).toBe(2000)
    expect(result.current.compressedSize).toBe(8)
    expect(result.current.downloadUrl).toBe('blob:mock-image-url')
    expect(result.current.downloadName).toBe('photo_compressed.jpg')
  })

  it('uses original file when compressed blob is larger', async () => {
    // Compressed blob is 9999 bytes; original is 500 bytes → use original
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb) => {
      cb(new Blob(['x'.repeat(9999)], { type: 'image/jpeg' }))
    })

    const { result } = renderHook(() => useImageCompress())
    const file = makeMockFile('small.jpg', 500, 'image/jpeg')

    await act(async () => {
      await result.current.compress(file, 'low')
    })

    expect(result.current.status).toBe('done')
    // compressedSize falls back to original file.size
    expect(result.current.compressedSize).toBe(500)
  })

  it('transitions to error when createImageBitmap rejects', async () => {
    global.createImageBitmap.mockRejectedValue(new Error('Failed to decode image'))

    const { result } = renderHook(() => useImageCompress())
    const file = makeMockFile('bad.png', 100)

    await act(async () => {
      await result.current.compress(file, 'high')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('Failed to decode image')
    expect(result.current.progress).toBe(0)
  })

  it('reset() clears all state after a successful compression', async () => {
    const { result } = renderHook(() => useImageCompress())
    const file = makeMockFile('photo.png', 2000)

    await act(async () => {
      await result.current.compress(file, 'medium')
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
    expect(result.current.downloadName).toBeNull()
    expect(result.current.errorMessage).toBeNull()
  })

  it('triggerDownload appends a transient anchor with correct download attribute', async () => {
    const { result } = renderHook(() => useImageCompress())
    const file = makeMockFile('sunset.png', 2000)

    await act(async () => {
      await result.current.compress(file, 'medium')
    })

    expect(result.current.status).toBe('done')

    act(() => {
      result.current.triggerDownload()
    })

    const anchorCall = appendChildSpy.mock.calls.find(([el]) => el?.tagName === 'A')
    expect(anchorCall).toBeTruthy()
    expect(anchorCall[0].download).toBe('sunset_compressed.jpg')
  })
})
