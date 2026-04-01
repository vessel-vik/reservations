import { NextResponse, NextRequest } from "next/server";
import { storage } from "@/lib/appwrite.config";
import { InputFile, ID } from "node-appwrite";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bucketId = formData.get('bucketId') as string;

    if (!file || !bucketId) {
      return NextResponse.json({ error: 'Missing file or bucketId' }, { status: 400 });
    }

    // Convert the File object to a Buffer for node-appwrite
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // node-appwrite expects an InputFile
    // InputFile.fromBuffer() requires a filename
    const appwriteFile = InputFile.fromBuffer(buffer, file.name);

    const uploaded = await storage.createFile(
      bucketId,
      ID.unique(),
      appwriteFile
    );

    const endpoint = process.env.NEXT_PUBLIC_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID || 'demo';
    
    const fileUrl = `${endpoint}/storage/buckets/${bucketId}/files/${uploaded.$id}/view?project=${projectId}`;

    return NextResponse.json({ url: fileUrl, fileId: uploaded.$id, success: true });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
