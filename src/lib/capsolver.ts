/**
 * CapSolver API client for reCAPTCHA v2 (image classification) and v3 (token).
 * @see https://docs.capsolver.com/en/guide/recognition/ReCaptchaClassification/
 * @see https://docs.capsolver.com/en/guide/captcha/ReCaptchaV3/
 * @see https://docs.capsolver.com/en/guide/api-createtask/
 */

const CAPSOLVER_CREATE_TASK_URL = 'https://api.capsolver.com/createTask';
const CAPSOLVER_GET_TASK_RESULT_URL = 'https://api.capsolver.com/getTaskResult';

/** Official question ID -> label map from CapSolver docs */
export const RECAPTCHA_V2_QUESTION_MAP: Record<string, string> = {
  '/m/0pg52': 'taxis',
  '/m/01bjv': 'bus',
  '/m/02yvhj': 'school bus',
  '/m/04_sv': 'motorcycles',
  '/m/013xlm': 'tractors',
  '/m/01jk_4': 'chimneys',
  '/m/014xcs': 'crosswalks',
  '/m/015qff': 'traffic lights',
  '/m/0199g': 'bicycles',
  '/m/015qbp': 'parking meters',
  '/m/0k4j': 'cars',
  '/m/015kr': 'bridges',
  '/m/019jd': 'boats',
  '/m/0cdl1': 'palm trees',
  '/m/09d_r': 'mountains or hills',
  '/m/01pns0': 'fire hydrant',
  '/m/01lynh': 'stairs',
};

/** Reverse map: label/keyword -> question ID (for mapping challenge text) */
const LABEL_TO_QUESTION_ID: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, label] of Object.entries(RECAPTCHA_V2_QUESTION_MAP)) {
    const lower = label.toLowerCase();
    out[lower] = id;
    out[lower.replace(/\s+/g, '')] = id;
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (w.length > 2) out[w] = id;
    }
    // Common singular/plural for "cars" -> "car", "buses" -> "bus", etc.
    if (lower.endsWith('s') && lower.length > 3) out[lower.slice(0, -1)] = id;
  }
  return out;
})();

export type ReCaptchaV2MultiSolution = {
  type: 'multi';
  objects: number[];
  size: number;
};

export type ReCaptchaV2SingleSolution = {
  type: 'single';
  hasObject: boolean;
  size: number;
};

export type ReCaptchaV2Solution = ReCaptchaV2MultiSolution | ReCaptchaV2SingleSolution;

export interface SolveReCaptchaV2Options {
  websiteURL?: string;
  websiteKey?: string;
}

/**
 * Maps reCAPTCHA challenge instruction text to a CapSolver question ID.
 * e.g. "Select all images with cars" -> "/m/0k4j"
 */
export function mapChallengeTextToQuestionId(text: string): string | null {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  // Try longer phrases first (e.g. "mountains or hills" before "hills")
  const entries = Object.entries(LABEL_TO_QUESTION_ID).sort((a, b) => b[0].length - a[0].length);
  for (const [label, id] of entries) {
    if (normalized.includes(label)) return id;
  }
  return null;
}

function getApiKey(): string | undefined {
  return process.env.CAPSOLVER_API_KEY;
}

export class CapSolverNotConfiguredError extends Error {
  constructor() {
    super('CapSolver is not configured: CAPSOLVER_API_KEY is not set');
    this.name = 'CapSolverNotConfiguredError';
  }
}

/**
 * Solves a reCAPTCHA v2 image classification challenge via CapSolver createTask.
 * Returns synchronously (API returns result in the same response).
 */
export async function solveReCaptchaV2Classification(
  imageBase64: string,
  questionId: string,
  options?: SolveReCaptchaV2Options
): Promise<ReCaptchaV2Solution> {
  const clientKey = getApiKey();
  if (!clientKey) {
    throw new CapSolverNotConfiguredError();
  }

  const task: Record<string, unknown> = {
    type: 'ReCaptchaV2Classification',
    image: imageBase64,
    question: questionId,
  };
  if (options?.websiteURL) task.websiteURL = options.websiteURL;
  if (options?.websiteKey) task.websiteKey = options.websiteKey;

  const res = await fetch(CAPSOLVER_CREATE_TASK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, task }),
  });

  const data = (await res.json()) as {
    errorId?: number;
    errorCode?: string;
    errorDescription?: string;
    status?: string;
    solution?: {
      type?: string;
      objects?: number[];
      size?: number;
      hasObject?: boolean;
    };
  };

  if (data.errorId !== 0) {
    const msg = data.errorDescription || data.errorCode || `CapSolver errorId ${data.errorId}`;
    throw new Error(`CapSolver API error: ${msg}`);
  }

  if (data.status !== 'ready' || !data.solution) {
    throw new Error('CapSolver did not return a ready solution');
  }

  const sol = data.solution;
  if (sol.type === 'multi' && Array.isArray(sol.objects) && typeof sol.size === 'number') {
    return { type: 'multi', objects: sol.objects, size: sol.size };
  }
  if (sol.type === 'single' && typeof sol.hasObject === 'boolean' && typeof sol.size === 'number') {
    return { type: 'single', hasObject: sol.hasObject, size: sol.size };
  }

  throw new Error('CapSolver returned an unexpected solution format');
}

/** Options for reCAPTCHA v3 (token-based). */
export interface SolveReCaptchaV3Options {
  pageAction?: string;
}

/**
 * Solves reCAPTCHA v3 via CapSolver: createTask (ReCaptchaV3TaskProxyLess) then poll getTaskResult.
 * Returns the gRecaptchaResponse token and optional recaptcha-ca-t for session.
 * @see https://docs.capsolver.com/en/guide/captcha/ReCaptchaV3/
 */
export async function solveReCaptchaV3(
  websiteURL: string,
  websiteKey: string,
  options?: SolveReCaptchaV3Options
): Promise<{ gRecaptchaResponse: string; recaptchaCaT?: string }> {
  const clientKey = getApiKey();
  if (!clientKey) {
    throw new CapSolverNotConfiguredError();
  }

  const task: Record<string, unknown> = {
    type: 'ReCaptchaV3TaskProxyLess',
    websiteURL,
    websiteKey,
  };
  if (options?.pageAction) task.pageAction = options.pageAction;

  const createRes = await fetch(CAPSOLVER_CREATE_TASK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, task }),
  });

  const createData = (await createRes.json()) as {
    errorId?: number;
    errorCode?: string;
    errorDescription?: string;
    taskId?: string;
  };

  if (createData.errorId !== 0) {
    const msg =
      createData.errorDescription || createData.errorCode || `CapSolver errorId ${createData.errorId}`;
    throw new Error(`CapSolver API error: ${msg}`);
  }

  const taskId = createData.taskId;
  if (!taskId) {
    throw new Error('CapSolver did not return a taskId');
  }

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const resultRes = await fetch(CAPSOLVER_GET_TASK_RESULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey, taskId }),
    });

    const resultData = (await resultRes.json()) as {
      errorId?: number;
      errorCode?: string;
      errorDescription?: string;
      status?: string;
      solution?: { gRecaptchaResponse?: string; 'recaptcha-ca-t'?: string };
    };

    if (resultData.errorId !== 0) {
      const msg =
        resultData.errorDescription || resultData.errorCode || `CapSolver getTaskResult error`;
      throw new Error(`CapSolver API error: ${msg}`);
    }

    if (resultData.status === 'ready' && resultData.solution?.gRecaptchaResponse) {
      return {
        gRecaptchaResponse: resultData.solution.gRecaptchaResponse,
        recaptchaCaT: resultData.solution['recaptcha-ca-t'],
      };
    }

    if (resultData.status === 'failed') {
      throw new Error('CapSolver task failed');
    }
  }

  throw new Error('CapSolver getTaskResult timeout');
}
