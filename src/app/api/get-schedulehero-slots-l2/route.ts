import { NextRequest, NextResponse } from 'next/server';

const L2_CAMPAIGN = 'agent-advice-l2';

/** Build absolute URL for internal proxy using request (works behind Railway/proxy). */
function getProxyTargetUrl(request: NextRequest): string {
  const url = new URL(request.url);
  let base: string;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol || 'https:';
  const fromHeaders = `${proto.replace(/:$/, '')}://${host}`;
  const railwayUrl = process.env.RAILWAY_STATIC_URL;
  const publicUrl = process.env.PUBLIC_APP_URL;
  if (railwayUrl) {
    base = railwayUrl.startsWith('http') ? railwayUrl : `https://${railwayUrl}`;
  } else if (publicUrl) {
    base = publicUrl.startsWith('http') ? publicUrl : `https://${publicUrl}`;
  } else {
    base = fromHeaders;
  }
  const target = new URL('/api/get-schedulehero-slots', base);
  target.searchParams.set('campaign', L2_CAMPAIGN);
  return target.toString();
}

/** Headers to forward to the main API (auth + content-type only). */
function getForwardHeaders(request: NextRequest): Headers {
  const out = new Headers();
  const auth = request.headers.get('authorization');
  if (auth) out.set('Authorization', auth);
  const xApiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
  if (xApiKey) out.set('X-API-Key', xApiKey);
  const contentType = request.headers.get('content-type');
  if (contentType) out.set('Content-Type', contentType);
  return out;
}

const PROXY_TIMEOUT_MS = 95000;

/**
 * Proxies to the main Schedule Hero slots API with campaign=agent-advice-l2
 * (https://lofty.schedulehero.io/campaign/agent-advice-l2).
 */
async function proxyToMainApi(request: NextRequest): Promise<NextResponse> {
  const targetUrl = getProxyTargetUrl(request);
  const headers = getForwardHeaders(request);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.body ? request.body : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const cloned = res.clone();
    let loggedBody: unknown = null;
    try {
      const text = await cloned.text();
      try {
        loggedBody = JSON.parse(text) as unknown;
      } catch {
        loggedBody = text;
      }
    } catch {
      // ignore
    }
    console.log('[Lofty ScheduleHero L2] proxy response', { status: res.status, ok: res.ok, body: loggedBody });

    const response = new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = message.includes('abort') || err instanceof Error && err.name === 'AbortError';
    console.error('[ScheduleHero L2] Proxy error:', message);
    return NextResponse.json(
      {
        success: false,
        error: isAbort ? 'Gateway Timeout' : 'Bad Gateway',
        message: isAbort
          ? 'The schedulehero slots request took too long.'
          : `Proxy to schedulehero slots failed: ${message}`
      },
      { status: isAbort ? 504 : 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyToMainApi(request);
}

export async function POST(request: NextRequest) {
  return proxyToMainApi(request);
}

export async function OPTIONS(request: NextRequest) {
  const targetUrl = getProxyTargetUrl(request);
  try {
    const res = await fetch(targetUrl, {
      method: 'OPTIONS',
      headers: getForwardHeaders(request)
    });
    return new NextResponse(null, { status: res.status, headers: res.headers });
  } catch {
    return new NextResponse(null, { status: 200 });
  }
}
