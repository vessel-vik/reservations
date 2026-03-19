import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const filePath = resolvedParams.path.join('/');
    const fileSystemPath = join(process.cwd(), 'public', '.well-known', filePath);
    
    // Only allow serving files from .well-known directory
    if (!filePath || filePath.includes('..')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fileContent = await readFile(fileSystemPath, 'utf-8');
    
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/text',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving .well-known file:', error);
    return new NextResponse('Not Found', { status: 404 });
  }
}
