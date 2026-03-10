import { NextRequest, NextResponse } from 'next/server';

const L2_CAMPAIGN = 'agent-advice-l2';

/**
 * Proxies to the main Schedule Hero slots API with campaign=agent-advice-l2
 * (https://lofty.schedulehero.io/campaign/agent-advice-l2).
 */
async function proxyToMainApi(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const target = new URL('/api/get-schedulehero-slots', url.origin);
  target.searchParams.set('campaign', L2_CAMPAIGN);

  const res = await fetch(target.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.body ? request.body : undefined
  });

  const response = new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
  return response;
}

export async function GET(request: NextRequest) {
  return proxyToMainApi(request);
}

export async function POST(request: NextRequest) {
  return proxyToMainApi(request);
}

export async function OPTIONS(request: NextRequest) {
  const url = new URL(request.url);
  const target = new URL('/api/get-schedulehero-slots', url.origin);
  const res = await fetch(target.toString(), { method: 'OPTIONS', headers: request.headers });
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
