/**
 * CapSolver API client for reCAPTCHA v3 and v2 Enterprise.
 * Used to obtain gRecaptchaResponse tokens for Calendly form submission.
 *
 * Proxy behavior: when proxy is omitted or not set (e.g. CALENDLY_USE_PROXY disabled in the
 * Calendly booker), we use the *ProxyLess task types so the solver matches the browser context
 * (no proxy). When proxy is provided, we use the proxied task types and pass formatProxyForCapSolver(proxy).
 *
 * @see https://docs.capsolver.com/en/guide/captcha/ReCaptchaV3/
 * @see https://docs.capsolver.com/guide/captcha/ReCaptchaV2/
 * @see https://docs.capsolver.com/en/guide/api-how-to-use-proxy/
 */

const CAPSOLVER_CREATE_TASK_URL = 'https://api.capsolver.com/createTask';
const CAPSOLVER_GET_RESULT_URL = 'https://api.capsolver.com/getTaskResult';
const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 60000;

/** Proxy options compatible with CreateBookingPageProxyOptions (avoids circular import). */
export interface CapSolverProxyOptions {
  server: string;
  username?: string;
  password?: string;
}

export interface SolveRecaptchaV3EnterpriseOptions {
  websiteURL: string;
  websiteKey: string;
  /** When omitted, ReCaptchaV3EnterpriseTaskProxyLess is used (no proxy). When set, ReCaptchaV3EnterpriseTask is used. */
  proxy?: CapSolverProxyOptions;
  pageAction?: string;
  enterprisePayload?: { s: string };
  isSession?: boolean;
  apiDomain?: string;
}

export interface SolveRecaptchaV3EnterpriseResult {
  gRecaptchaResponse: string;
  recaptchaCaT?: string;
  recaptchaCaE?: string;
}

// --- API request/response types ---

type TaskPayload = Record<string, unknown>;

interface CreateTaskRequest {
  clientKey: string;
  task: TaskPayload;
}

interface CreateTaskResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string;
}

interface GetTaskResultRequest {
  clientKey: string;
  taskId: string;
}

interface GetTaskResultResponse {
  errorId: number;
  errorCode?: string | null;
  errorDescription?: string | null;
  status: 'processing' | 'ready' | 'failed';
  solution?: {
    gRecaptchaResponse?: string;
    'recaptcha-ca-t'?: string;
    'recaptcha-ca-e'?: string;
  };
}

/**
 * Convert proxy options to CapSolver's single-string format.
 * Format: protocol:host:port or protocol:host:port:username:password
 * CapSolver supports: http, https, socks4, socks5
 */
export function formatProxyForCapSolver(proxy: CapSolverProxyOptions): string {
  let protocol = 'http';
  let host: string;
  let port: string;
  try {
    const raw = proxy.server;
    const url = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('socks5://') || raw.startsWith('socks4://')
      ? new URL(raw)
      : new URL(`http://${raw}`);
    host = url.hostname;
    port = url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '1080');
    if (url.protocol === 'https:') protocol = 'https';
    else if (url.protocol === 'socks5:') protocol = 'socks5';
    else if (url.protocol === 'socks4:') protocol = 'socks4';
    else protocol = 'http';
  } catch {
    return '';
  }
  if (proxy.username != null && proxy.password != null) {
    return `${protocol}:${host}:${port}:${proxy.username}:${proxy.password}`;
  }
  return `${protocol}:${host}:${port}`;
}

async function createTask(
  clientKey: string,
  task: TaskPayload
): Promise<CreateTaskResponse> {
  const res = await fetch(CAPSOLVER_CREATE_TASK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, task }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as CreateTaskResponse;
  return data;
}

async function getTaskResult(
  clientKey: string,
  taskId: string
): Promise<GetTaskResultResponse> {
  const res = await fetch(CAPSOLVER_GET_RESULT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, taskId }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json()) as GetTaskResultResponse;
  return data;
}

/**
 * Solve reCAPTCHA v3 Enterprise via CapSolver.
 * Uses ReCaptchaV3EnterpriseTask when proxy is provided, ReCaptchaV3EnterpriseTaskProxyLess otherwise.
 * Returns the token and optional session cookies. Caller should inject the token into the page
 * (e.g. via reCAPTCHA promise-callback) before submitting the form.
 */
export async function solveRecaptchaV3Enterprise(
  options: SolveRecaptchaV3EnterpriseOptions
): Promise<SolveRecaptchaV3EnterpriseResult> {
  const apiKey = process.env.CAPSOLVER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CAPSOLVER_API_KEY is not set');
  }

  const useProxy = options.proxy?.server != null && options.proxy.server.trim() !== '';
  const taskType = useProxy ? 'ReCaptchaV3EnterpriseTask' : 'ReCaptchaV3EnterpriseTaskProxyLess';

  const task: TaskPayload = {
    type: taskType,
    websiteURL: options.websiteURL,
    websiteKey: options.websiteKey,
    pageAction: options.pageAction,
    enterprisePayload: options.enterprisePayload,
    isSession: options.isSession,
    apiDomain: options.apiDomain,
  };

  if (useProxy && options.proxy) {
    task.proxy = formatProxyForCapSolver(options.proxy);
    if (!task.proxy) {
      throw new Error('Invalid proxy format for CapSolver');
    }
  }

  const createRes = await createTask(apiKey, task);
  if (createRes.errorId !== 0 || !createRes.taskId) {
    const msg = createRes.errorDescription || createRes.errorCode || 'Unknown error';
    throw new Error(`CapSolver createTask failed: ${msg}`);
  }

  const taskId = createRes.taskId;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resultRes = await getTaskResult(apiKey, taskId);

    if (resultRes.errorId !== 0) {
      const msg = resultRes.errorDescription || resultRes.errorCode || 'Unknown error';
      throw new Error(`CapSolver getTaskResult error: ${msg}`);
    }

    if (resultRes.status === 'ready' && resultRes.solution?.gRecaptchaResponse) {
      return {
        gRecaptchaResponse: resultRes.solution.gRecaptchaResponse,
        recaptchaCaT: resultRes.solution['recaptcha-ca-t'],
        recaptchaCaE: resultRes.solution['recaptcha-ca-e'],
      };
    }

    if (resultRes.status === 'failed') {
      const msg = resultRes.errorDescription || resultRes.errorCode || 'Task failed';
      throw new Error(`CapSolver task failed: ${msg}`);
    }
  }

  throw new Error('CapSolver solve timed out');
}

// --- reCAPTCHA v2 Enterprise (used when Calendly shows v2 fallback after v3) ---

export interface SolveRecaptchaV2EnterpriseOptions {
  websiteURL: string;
  websiteKey: string;
  /** When omitted, ReCaptchaV2EnterpriseTaskProxyLess is used (no proxy). When set, ReCaptchaV2EnterpriseTask is used. */
  proxy?: CapSolverProxyOptions;
  enterprisePayload?: { s: string };
  apiDomain?: string;
  isInvisible?: boolean;
}

/**
 * Solve reCAPTCHA v2 Enterprise via CapSolver.
 * Use when Calendly shows a v2 Normal challenge (checkbox/image grid) after v3.
 * @see https://docs.capsolver.com/guide/captcha/ReCaptchaV2/
 */
export async function solveRecaptchaV2Enterprise(
  options: SolveRecaptchaV2EnterpriseOptions
): Promise<{ gRecaptchaResponse: string }> {
  const apiKey = process.env.CAPSOLVER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CAPSOLVER_API_KEY is not set');
  }

  const useProxy = options.proxy?.server != null && options.proxy.server.trim() !== '';
  const taskType = useProxy ? 'ReCaptchaV2EnterpriseTask' : 'ReCaptchaV2EnterpriseTaskProxyLess';

  const task: TaskPayload = {
    type: taskType,
    websiteURL: options.websiteURL,
    websiteKey: options.websiteKey,
    enterprisePayload: options.enterprisePayload,
    apiDomain: options.apiDomain,
    isInvisible: options.isInvisible ?? false,
  };

  if (useProxy && options.proxy) {
    task.proxy = formatProxyForCapSolver(options.proxy);
    if (!task.proxy) {
      throw new Error('Invalid proxy format for CapSolver');
    }
  }

  const createRes = await createTask(apiKey, task);
  if (createRes.errorId !== 0 || !createRes.taskId) {
    const msg = createRes.errorDescription || createRes.errorCode || 'Unknown error';
    throw new Error(`CapSolver v2 createTask failed: ${msg}`);
  }

  const taskId = createRes.taskId;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resultRes = await getTaskResult(apiKey, taskId);

    if (resultRes.errorId !== 0) {
      const msg = resultRes.errorDescription || resultRes.errorCode || 'Unknown error';
      throw new Error(`CapSolver v2 getTaskResult error: ${msg}`);
    }

    if (resultRes.status === 'ready' && resultRes.solution?.gRecaptchaResponse) {
      return { gRecaptchaResponse: resultRes.solution.gRecaptchaResponse };
    }

    if (resultRes.status === 'failed') {
      const msg = resultRes.errorDescription || resultRes.errorCode || 'Task failed';
      throw new Error(`CapSolver v2 task failed: ${msg}`);
    }
  }

  throw new Error('CapSolver v2 solve timed out');
}
