/**
 * Playwright integration for solving reCAPTCHA v2 (image challenge) and v3 (token) via CapSolver.
 * v2: finds bframe, captures grid + question, calls CapSolver, clicks tiles and Verify.
 * v3: extracts site key from page, gets token from CapSolver, injects via callback.
 */

import type { Page, Frame } from 'playwright';
import {
  solveReCaptchaV2Classification,
  mapChallengeTextToQuestionId,
  solveReCaptchaV3,
} from './capsolver';

const CHALLENGE_FRAME_URL_SUBSTR = 'recaptcha';
const BFRAME_SUBSTR = 'bframe';
const GRID_TABLE_33 = 'table.rc-imageselect-table-33';
const GRID_TABLE_44 = 'table.rc-imageselect-table-44';
const TILE_CELLS_33 = 'table.rc-imageselect-table-33 td';
const TILE_CELLS_44 = 'table.rc-imageselect-table-44 td';
const QUESTION_SELECTORS = ['.rc-imageselect-desc-wrapper', '.rc-imageselect-desc-no-canonical'];
const VERIFY_BUTTON = '#recaptcha-verify-button';
const DEFAULT_MAX_ROUNDS = 5;
const ROUND_WAIT_MS = 1500;
const ELEMENT_TIMEOUT_MS = 10000;
const FRAME_DETECT_TIMEOUT_MS = 3000;

export interface WaitForAndSolveRecaptchaOptions {
  maxRounds?: number;
  websiteKey?: string;
}

function findChallengeFrame(page: Page): Frame | null {
  for (const frame of page.frames()) {
    const url = frame.url().toLowerCase();
    if (url.includes(CHALLENGE_FRAME_URL_SUBSTR) && url.includes(BFRAME_SUBSTR)) {
      return frame;
    }
  }
  return null;
}

async function getChallengeImageBase64(frame: Frame, gridSize: 3 | 4): Promise<string> {
  const tableSelector = gridSize === 3 ? GRID_TABLE_33 : GRID_TABLE_44;
  const locator = frame.locator(tableSelector).first();
  await locator.waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT_MS });
  const buffer = await locator.screenshot({ type: 'png', timeout: ELEMENT_TIMEOUT_MS });
  return buffer.toString('base64');
}

async function getQuestionText(frame: Frame): Promise<string> {
  for (const sel of QUESTION_SELECTORS) {
    try {
      const el = frame.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 2000 });
      const text = await el.innerText();
      if (text && text.trim()) return text.trim();
    } catch {
      continue;
    }
  }
  throw new Error('Could not find reCAPTCHA challenge question text');
}

async function detectGridSize(frame: Frame): Promise<3 | 4> {
  try {
    await frame.locator(GRID_TABLE_33).first().waitFor({ state: 'visible', timeout: 2000 });
    return 3;
  } catch {
    await frame.locator(GRID_TABLE_44).first().waitFor({ state: 'visible', timeout: 2000 });
    return 4;
  }
}

async function clickTilesByIndices(
  frame: Frame,
  indices: number[],
  gridSize: 3 | 4
): Promise<void> {
  const cellSelector = gridSize === 3 ? TILE_CELLS_33 : TILE_CELLS_44;
  const cells = await frame.locator(cellSelector).all();
  for (const idx of indices) {
    if (idx >= 0 && idx < cells.length) {
      await cells[idx].click({ timeout: 2000 });
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

async function solveOneRound(
  page: Page,
  frame: Frame,
  options: WaitForAndSolveRecaptchaOptions,
  round: number
): Promise<boolean> {
  const gridSize = await detectGridSize(frame);
  const questionText = await getQuestionText(frame);
  const questionId = mapChallengeTextToQuestionId(questionText);
  if (!questionId) {
    console.error('[reCAPTCHA] Unsupported challenge question:', questionText);
    throw new Error(`Unsupported reCAPTCHA challenge question: "${questionText}"`);
  }

  console.log(`[reCAPTCHA] Round ${round + 1}: question="${questionText.slice(0, 50)}..." grid=${gridSize}x${gridSize}, calling CapSolver...`);
  const imageBase64 = await getChallengeImageBase64(frame, gridSize);
  const solution = await solveReCaptchaV2Classification(imageBase64, questionId, {
    websiteURL: page.url(),
    websiteKey: options.websiteKey,
  });

  if (solution.type === 'multi') {
    console.log(`[reCAPTCHA] CapSolver returned multi: clicking ${solution.objects.length} tiles (indices: ${solution.objects.join(', ')})`);
    await clickTilesByIndices(frame, solution.objects, gridSize as 3 | 4);
  } else if (solution.type === 'single' && solution.hasObject) {
    console.log('[reCAPTCHA] CapSolver returned single: hasObject=true, clicking tile');
    const cellSelector = gridSize === 3 ? TILE_CELLS_33 : TILE_CELLS_44;
    const first = frame.locator(cellSelector).first();
    await first.click({ timeout: 2000 });
  }
  // If single and !hasObject, we could click Skip/Next if present; for now we still click Verify

  const verifyBtn = frame.locator(VERIFY_BUTTON);
  await verifyBtn.waitFor({ state: 'visible', timeout: 5000 });
  await verifyBtn.click({ timeout: 2000 });
  console.log(`[reCAPTCHA] Round ${round + 1}: clicked Verify`);
  return true;
}

async function isChallengeStillVisible(frame: Frame): Promise<boolean> {
  try {
    const table33 = frame.locator(GRID_TABLE_33).first();
    const table44 = frame.locator(GRID_TABLE_44).first();
    await Promise.race([
      table33.waitFor({ state: 'visible', timeout: 2000 }),
      table44.waitFor({ state: 'visible', timeout: 2000 }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Try to get reCAPTCHA v3 site key from the page (data-sitekey or script src). */
async function getRecaptchaV3SiteKey(page: Page): Promise<string | null> {
  const key = await page.evaluate(() => {
    const el = document.querySelector('[data-sitekey]');
    if (el && el.getAttribute('data-sitekey')) return el.getAttribute('data-sitekey');
    const scripts = document.querySelectorAll('script[src*="recaptcha"]');
    for (const s of scripts) {
      const src = s.getAttribute('src') || '';
      const m = src.match(/[?&]render=([^&]+)/);
      if (m) return m[1];
    }
    return null;
  });
  return key;
}

/**
 * Inject reCAPTCHA v3 token by calling the callback stored in ___grecaptcha_cfg.
 * See e.g. puppeteer-extra recaptcha callback injection.
 */
async function injectRecaptchaV3Token(page: Page, token: string): Promise<void> {
  await page.evaluate((t) => {
    const w = window as Window & { ___grecaptcha_cfg?: { clients: unknown[] } };
    if (typeof w.___grecaptcha_cfg === 'undefined' || !w.___grecaptcha_cfg.clients?.length) {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        (textarea as HTMLTextAreaElement).value = t;
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    try {
      const clients = w.___grecaptcha_cfg.clients;
      for (const client of clients) {
        const arr = Object.values(client as object);
        const rt = arr.find((k: unknown) => k && (k as { constructor?: { name?: string } }).constructor?.name === 'RT');
        if (!rt) continue;
        const inner = Object.values(rt as object).find(Boolean) as { callback?: unknown } | undefined;
        if (!inner?.callback) continue;
        let cb = inner.callback;
        if (typeof cb === 'string') cb = (window as Record<string, unknown>)[cb];
        if (typeof cb === 'function') {
          (cb as (token: string) => void)(t);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
    if (textarea) {
      (textarea as HTMLTextAreaElement).value = t;
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, token);
}

/**
 * If reCAPTCHA v3 is on the page, get site key, solve via CapSolver, and inject the token.
 * Returns true if we attempted (and completed) v3 solve; false if no v3 site key found.
 */
async function trySolveRecaptchaV3(page: Page, options: WaitForAndSolveRecaptchaOptions): Promise<boolean> {
  const websiteKey = options.websiteKey ?? (await getRecaptchaV3SiteKey(page));
  if (!websiteKey) return false;

  console.log('[reCAPTCHA] reCAPTCHA v3 detected; getting token from CapSolver...');
  const { gRecaptchaResponse, recaptchaCaT } = await solveReCaptchaV3(page.url(), websiteKey, {
    pageAction: 'submit',
  });
  if (recaptchaCaT) {
    await page.context().addCookies([
      { name: 'recaptcha-ca-t', value: recaptchaCaT, domain: new URL(page.url()).hostname, path: '/' },
    ]);
    console.log('[reCAPTCHA] Set recaptcha-ca-t cookie (session mode).');
  }
  console.log('[reCAPTCHA] Injecting v3 token into page...');
  await injectRecaptchaV3Token(page, gRecaptchaResponse);
  console.log('[reCAPTCHA] reCAPTCHA v3 token injected.');
  return true;
}

/**
 * If a reCAPTCHA v2 image challenge is present in the page, solve it using CapSolver.
 * Call only when CAPSOLVER_API_KEY is set.
 * Returns true if no challenge was present or at least one round was solved; throws on unsupported question or API error.
 */
export async function waitForAndSolveRecaptchaIfPresent(
  page: Page,
  options: WaitForAndSolveRecaptchaOptions = {}
): Promise<boolean> {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  console.log('[reCAPTCHA] Checking for reCAPTCHA challenge iframe...');

  for (let round = 0; round < maxRounds; round++) {
    let frame = findChallengeFrame(page);
    if (!frame && round === 0) {
      console.log('[reCAPTCHA] No v2 challenge frame yet, waiting 2s for it to load...');
      await new Promise((r) => setTimeout(r, 2000));
      frame = findChallengeFrame(page);
    }
    if (!frame) {
      if (round === 0) {
        const v3Attempted = await trySolveRecaptchaV3(page, options);
        if (!v3Attempted) {
          console.log('[reCAPTCHA] No reCAPTCHA v2 or v3 detected; continuing.');
        }
      }
      return true;
    }

    const stillVisible = await isChallengeStillVisible(frame);
    if (!stillVisible) {
      console.log('[reCAPTCHA] Challenge no longer visible; continuing.');
      return true;
    }

    console.log(`[reCAPTCHA] Challenge detected (round ${round + 1}/${maxRounds}), solving...`);
    try {
      await solveOneRound(page, frame, options, round);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[reCAPTCHA] Solve failed:', msg);
      throw err;
    }
    await new Promise((r) => setTimeout(r, ROUND_WAIT_MS));
  }

  console.log('[reCAPTCHA] Completed max rounds; continuing.');
  return true;
}
