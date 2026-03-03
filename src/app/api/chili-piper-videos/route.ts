import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

function isGalleryEnabled(envValue: string | undefined): boolean {
  if (envValue == null || envValue === '') return false;
  const v = envValue.toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const VIDEO_DIR =
  process.env.CHILI_PIPER_VIDEO_DIR || path.join(process.cwd(), '.chili-piper-videos');
const FAILED_DIR = path.join(VIDEO_DIR, 'failed');

export async function GET() {
  const galleryEnabled = isGalleryEnabled(process.env.CHILI_PIPER_VIDEO_GALLERY_ENABLED);
  if (!galleryEnabled) {
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
    console.error('[Chili Piper videos] List error:', e);
    return NextResponse.json(
      { enabled: true, error: 'Failed to list videos', files: [] },
      { status: 500 }
    );
  }
}
