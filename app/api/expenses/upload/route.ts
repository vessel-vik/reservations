import { NextRequest, NextResponse } from 'next/server'
import { storage } from '@/lib/appwrite.config'
import { InputFile, ID } from 'node-appwrite'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file || file.size === 0)
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: 'File too large. Maximum 5 MB' }, { status: 400 })
    if (!ALLOWED.includes(file.type))
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: JPEG, PNG, WebP, PDF' },
        { status: 400 }
      )

    const bucket = process.env.RECEIPTS_BUCKET_ID!
    const uploaded = await storage.createFile(
      bucket,
      ID.unique(),
      InputFile.fromBuffer(Buffer.from(await file.arrayBuffer()), file.name)
    )
    const ep = process.env.NEXT_PUBLIC_ENDPOINT ?? 'https://cloud.appwrite.io/v1'
    const pid = process.env.NEXT_PUBLIC_PROJECT_ID ?? ''
    const receiptUrl = `${ep}/storage/buckets/${bucket}/files/${uploaded.$id}/view?project=${pid}`
    return NextResponse.json({ receiptUrl })
  } catch (err: any) {
    console.error('[expenses/upload]', err)
    return NextResponse.json({ error: 'Upload failed', details: err?.message }, { status: 500 })
  }
}
