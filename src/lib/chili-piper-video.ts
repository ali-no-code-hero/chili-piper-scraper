import * as fs from 'fs';
import * as path from 'path';

export const CHILI_PIPER_VIDEO_DIR =
  process.env.CHILI_PIPER_VIDEO_DIR || path.join(process.cwd(), '.chili-piper-videos');

export const CHILI_PIPER_VIDEO_ENABLED =
  process.env.CHILI_PIPER_VIDEO_ENABLED !== '0' && process.env.CHILI_PIPER_VIDEO_ENABLED !== 'false';

/**
 * Save Chili Piper failure recording to CHILI_PIPER_VIDEO_DIR/failed.
 * Uses Video.saveAs() so the file is fully flushed (copying path() after page.close() can yield 0 bytes).
 */
export async function saveChiliPiperFailureVideo(
  context: { video?: () => Promise<{ path: () => Promise<string | null> } | null> } | null,
  page: { video?: () => { saveAs: (p: string) => Promise<void> } | null; isClosed?: () => boolean; close?: () => Promise<void> } | null,
  _videoDir: string,
  sessionId: string
): Promise<string | null> {
  let savedPath: string | null = null;
  try {
    const vid = page?.video?.() ?? null;
    if (page && typeof page.isClosed === 'function' && !page.isClosed()) {
      await (page as { close: () => Promise<void> }).close?.().catch(() => {});
    }
    if (vid && typeof vid.saveAs === 'function') {
      const failedDir = path.join(CHILI_PIPER_VIDEO_DIR, 'failed');
      fs.mkdirSync(failedDir, { recursive: true });
      const destPath = path.join(failedDir, `chili-piper-${sessionId}.webm`);
      await vid.saveAs(destPath);
      savedPath = destPath;
      console.log('[Chili Piper] Saved failure video:', destPath);
    }
  } catch (e) {
    console.warn('[Chili Piper] Could not save failure video:', (e as Error)?.message);
  }
  return savedPath;
}
