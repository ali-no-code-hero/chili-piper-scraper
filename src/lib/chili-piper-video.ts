import * as fs from 'fs';
import * as path from 'path';

export const CHILI_PIPER_VIDEO_DIR =
  process.env.CHILI_PIPER_VIDEO_DIR || path.join(process.cwd(), '.chili-piper-videos');

export const CHILI_PIPER_VIDEO_ENABLED =
  process.env.CHILI_PIPER_VIDEO_ENABLED !== '0' && process.env.CHILI_PIPER_VIDEO_ENABLED !== 'false';

/**
 * Save Chili Piper failure video before context is closed (avoids "Controller is already closed").
 * Call with the context and page that were recording. Does not close context.
 */
export async function saveChiliPiperFailureVideo(
  context: { video?: () => Promise<{ path: () => Promise<string | null> } | null> } | null,
  page: { video?: () => Promise<{ path: () => Promise<string | null> } | null>; isClosed?: () => boolean; close?: () => Promise<void> } | null,
  videoDir: string,
  sessionId: string
): Promise<string | null> {
  let savedPath: string | null = null;
  try {
    const videoPromise = page?.video?.() ?? context?.video?.() ?? null;
    if (page && typeof page.isClosed === 'function' && !page.isClosed()) {
      await (page as { close: () => Promise<void> }).close?.().catch(() => {});
    }
    if (videoPromise) {
      const video = await videoPromise;
      if (video) {
        const srcPath = await video.path();
        if (srcPath && fs.existsSync(srcPath)) {
          const failedDir = path.join(CHILI_PIPER_VIDEO_DIR, 'failed');
          fs.mkdirSync(failedDir, { recursive: true });
          const destName = `chili-piper-${sessionId}.webm`;
          const destPath = path.join(failedDir, destName);
          fs.copyFileSync(srcPath, destPath);
          savedPath = destPath;
          console.log('[Chili Piper] Saved failure video:', destPath);
        }
      }
    }
  } catch (e) {
    console.warn('[Chili Piper] Could not save failure video:', (e as Error)?.message);
  }
  return savedPath;
}
