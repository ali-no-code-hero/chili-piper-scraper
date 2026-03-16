import type { BookCalendlySlotOptions, BookCalendlySlotResult } from '@/lib/calendly-booker';
import { getDirectPaypercloseCalendlyUrl } from '@/lib/calendly-booker';

const DEFAULT_BQL_URL = 'https://production-sfo.browserless.io/stealth/bql';
const FETCH_TIMEOUT_MS = 28_000;

/** Build Browserless API URL with optional proxy and options (matches BrowserQL editor). */
function buildBrowserlessApiUrl(baseUrl: string, token: string): string {
  const params = new URLSearchParams();
  params.set('token', token);
  const proxy = process.env.BROWSERLESS_PROXY?.trim();
  if (proxy) params.set('proxy', proxy);
  const blockConsent = process.env.BROWSERLESS_BLOCK_CONSENT_MODALS?.trim();
  if (blockConsent === 'true' || blockConsent === '1') params.set('blockConsentModals', 'true');
  return `${baseUrl.replace(/\?.*$/, '')}?${params.toString()}`;
}

/** Escape a string for use inside a GraphQL double-quoted string (backslash and quote). */
function escapeForGraphQLString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Book a payperclose (housejet-ppc) Calendly slot via Browserless BQL.
 * Requires BROWSERLESS_API_TOKEN. Builds the direct URL from opts and runs
 * goto → click submit → waitForNavigation, then reads final URL and optional error message.
 */
export async function bookCalendlySlotViaBrowserless(
  opts: BookCalendlySlotOptions
): Promise<BookCalendlySlotResult> {
  if (opts.calendlyType !== 'payperclose') {
    return {
      success: false,
      error: 'bookCalendlySlotViaBrowserless only supports calendlyType: "payperclose"',
    };
  }

  const token = process.env.BROWSERLESS_API_TOKEN?.trim();
  if (!token) {
    return {
      success: false,
      error: 'BROWSERLESS_API_TOKEN is not set',
    };
  }

  const directUrl = getDirectPaypercloseCalendlyUrl(opts);
  const escapedUrl = escapeForGraphQLString(directUrl);
  const bqlUrl = process.env.BROWSERLESS_BQL_URL?.trim() || DEFAULT_BQL_URL;
  const apiUrl = buildBrowserlessApiUrl(bqlUrl, token);

  const operationName = 'BookCalendlyFinal';
  const query = `mutation ${operationName} {
  viewport(width: 1366, height: 768) {
    width
    height
    time
  }
  goto(url: "${escapedUrl}", waitUntil: networkIdle) {
    status
  }
  click(selector: "button[type='submit']") {
    time
  }
  waitForNavigation(waitUntil: networkIdle, timeout: 15000) {
    status
  }
  currentUrl: url {
    url
  }
  errorMessage: text(selector: "[role='alert'], .error, .alert, .message-error") {
    text
  }
  screenshot {
    base64
  }
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      query,
      operationName,
    });
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await response.text();
    let json: {
      data?: {
        currentUrl?: { url?: string };
        errorMessage?: { text?: string } | Array<{ text?: string }>;
        screenshot?: { base64?: string };
      };
      errors?: Array<{ message?: string }>;
    };
    try {
      json = rawText ? (JSON.parse(rawText) as typeof json) : {};
    } catch {
      const snippet = rawText.slice(0, 300).replace(/\s+/g, ' ');
      return {
        success: false,
        error: `Browserless returned non-JSON (HTTP ${response.status}): ${snippet}${rawText.length > 300 ? '...' : ''}`,
      };
    }

    if (!response.ok) {
      const errMsg = json.errors?.[0]?.message ?? `HTTP ${response.status}`;
      return { success: false, error: errMsg };
    }

    const errors = json.errors;
    if (errors?.length) {
      const errMsg = errors.map((e) => e.message ?? '').filter(Boolean).join('; ') || 'BQL error';
      return { success: false, error: errMsg };
    }

    const data = json.data;
    if (!data?.currentUrl?.url) {
      return {
        success: false,
        error: 'BQL response missing currentUrl.url',
      };
    }

    const finalUrl = data.currentUrl.url;
    const isStillOnCalendly =
      finalUrl.includes('calendly.com') && !finalUrl.includes('invitee_confirmations');

    if (!isStillOnCalendly) {
      return {
        success: true,
        date: opts.date,
        time: opts.time,
      };
    }

    let reason: string;
    const rawError = data.errorMessage;
    if (rawError != null) {
      const list = Array.isArray(rawError) ? rawError : [rawError];
      const first = list[0];
      const text = first?.text?.trim();
      if (text) {
        reason = text;
      } else {
        reason = 'Unknown. No error text found, but no redirect occurred.';
      }
    } else {
      reason = 'Unknown. No error text found, but no redirect occurred.';
    }

    return {
      success: false,
      error: reason,
      validationMessages: [reason],
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message.includes('abort') ? 'Browserless request timed out' : message,
    };
  }
}
