import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/expenses/upload/route'

vi.mock('@/lib/appwrite.config', () => ({
  storage: { createFile: vi.fn() },
  ID: { unique: vi.fn(() => 'mock-id') },
}))
// Also mock node-appwrite so ID.unique() is intercepted
vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  return { ...actual, ID: { unique: () => 'mock-id' }, InputFile: actual.InputFile }
})

import { storage } from '@/lib/appwrite.config'

process.env.RECEIPTS_BUCKET_ID = 'test-bucket'
process.env.NEXT_PUBLIC_ENDPOINT = 'https://cloud.appwrite.io/v1'
process.env.NEXT_PUBLIC_PROJECT_ID = 'test-proj'

function makeReq(file?: File) {
  const form = new FormData()
  if (file) form.append('file', file)

  const req = new Request('http://localhost/api/expenses/upload', { method: 'POST', body: form })

  // Patch formData() to return the original form instead of re-parsing the body
  // This works around a jsdom limitation where large FormData files get corrupted during serialization
  ;(req as any).formData = async () => form

  return req
}

describe('POST /api/expenses/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns receiptUrl on successful JPEG upload', async () => {
    vi.mocked(storage.createFile).mockResolvedValueOnce({ $id: 'file123' } as any)
    const blob = new Blob(['test data'], { type: 'image/jpeg' })
    const file = new File([blob], 'r.jpg', { type: 'image/jpeg' })
    const res = await POST(makeReq(file))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.receiptUrl).toContain('file123')
  })

  it('returns 400 when no file field', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided')
  })

  it('returns 400 when file exceeds 5 MB', async () => {
    // Create multiple chunks to build a large file
    // Using multiple Blob parts instead of a single large string
    const chunkCount = 6 // 6 * 1MB > 5MB
    const chunkSize = 1024 * 1024
    const chunks = Array(chunkCount).fill(null).map(() => new Blob(['x'.repeat(chunkSize)]))
    const largeBlob = new Blob(chunks, { type: 'image/jpeg' })
    const file = new File([largeBlob], 'b.jpg', { type: 'image/jpeg' })

    const res = await POST(makeReq(file))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/5 MB/)
  })

  it('returns 400 for unsupported MIME type', async () => {
    const res = await POST(makeReq(new File(['x'], 'f.gif', { type: 'image/gif' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Unsupported/)
  })

  it('returns 500 when Appwrite Storage throws', async () => {
    vi.mocked(storage.createFile).mockRejectedValueOnce(new Error('Storage down'))
    const res = await POST(makeReq(new File(['x'], 'r.png', { type: 'image/png' })))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Upload failed')
  })
})
