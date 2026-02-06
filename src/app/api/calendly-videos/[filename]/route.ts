import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const GALLERY_ENABLED =
  process.env.CALENDLY_VIDEO_GALLERY_ENABLED === '1' ||
  process.env.CALENDLY_VIDEO_GALLERY_ENABLED === 'true';

const VIDEO_DIR =
  process.env.CALENDLY_VIDEO_DIR || path.join(process.cwd(), '.calendly-videos');
const FAILED_DIR = path.join(VIDEO_DIR, 'failed');

const SAFE_FILENAME = /^calendly-[a-zA-Z0-9_.-]+\.webm$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  if (!GALLERY_ENABLED) {
    return NextResponse.json({ error: 'Video gallery is disabled' }, { status: 404 });
  }

  const { filename } = await params;
  if (!filename || !SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filePath = path.join(FAILED_DIR, filename);
  if (!path.resolve(filePath).startsWith(path.resolve(FAILED_DIR))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const download = request.nextUrl.searchParams.get('download') === '1';
  const disposition = download
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stream = fs.createReadStream(filePath);
    const response = new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/webm',
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600',
      },
    });
    return response;
  } catch (e) {
    console.error('[Calendly videos] Serve error:', e);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
