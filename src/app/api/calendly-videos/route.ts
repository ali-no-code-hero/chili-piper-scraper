import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const GALLERY_ENABLED =
  process.env.CALENDLY_VIDEO_GALLERY_ENABLED === '1' ||
  process.env.CALENDLY_VIDEO_GALLERY_ENABLED === 'true';

const VIDEO_DIR =
  process.env.CALENDLY_VIDEO_DIR || path.join(process.cwd(), '.calendly-videos');
const FAILED_DIR = path.join(VIDEO_DIR, 'failed');

export async function GET() {
  if (!GALLERY_ENABLED) {
    return NextResponse.json({ enabled: false, files: [] }, { status: 200 });
  }

  try {
    if (!fs.existsSync(FAILED_DIR)) {
      return NextResponse.json({ enabled: true, files: [] }, { status: 200 });
    }

    const names = fs.readdirSync(FAILED_DIR);
    const files: { name: string; size: number; mtime: string }[] = [];

    for (const name of names) {
      if (!name.endsWith('.webm')) continue;
      const filePath = path.join(FAILED_DIR, name);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      files.push({
        name,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    return NextResponse.json({ enabled: true, files }, { status: 200 });
  } catch (e) {
    console.error('[Calendly videos] List error:', e);
    return NextResponse.json(
      { enabled: true, error: 'Failed to list videos', files: [] },
      { status: 500 }
    );
  }
}
