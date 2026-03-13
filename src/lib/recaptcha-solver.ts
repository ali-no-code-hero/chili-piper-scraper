/**
 * Playwright integration for solving reCAPTCHA v2 image challenges via CapSolver.
 * Finds the challenge iframe, captures the grid image and question, calls CapSolver,
 * then clicks the correct tiles and Verify.
 */

import type { Page, Frame } from 'playwright';
import {
  solveReCaptchaV2Classification,
  mapChallengeTextToQuestionId,
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
      console.log('[reCAPTCHA] No challenge frame yet, waiting 2s for it to load...');
      await new Promise((r) => setTimeout(r, 2000));
      frame = findChallengeFrame(page);
    }
    if (!frame) {
      if (round === 0) {
        console.log('[reCAPTCHA] No reCAPTCHA challenge present; continuing.');
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
