const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 12_000;

function getBaseDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function isWhitelistedHost(targetHost: string, currentHost: string): boolean {
  if (targetHost === currentHost) return true;
  const targetBase = getBaseDomain(targetHost);
  const currentBase = getBaseDomain(currentHost);
  return targetBase === currentBase;
}

export type HttpGetResult = {
  ok: boolean;
  status?: number;
  contentType?: string;
  data?: unknown;
  text?: string;
  error?: string;
  truncated?: boolean;
};

async function fetchWithScope(
  url: string,
  init: RequestInit,
  currentUrl: string | undefined,
): Promise<HttpGetResult> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!/^https?:$/.test(target.protocol)) {
    return { ok: false, error: 'Only http(s) URLs allowed' };
  }
  if (!currentUrl) {
    return { ok: false, error: 'No active tab — cannot determine scope' };
  }
  let current: URL;
  try {
    current = new URL(currentUrl);
  } catch {
    return { ok: false, error: 'Invalid current tab URL' };
  }
  if (!isWhitelistedHost(target.hostname, current.hostname)) {
    return {
      ok: false,
      error: `URL ${target.hostname} not on same domain as current site (${current.hostname}). Tools are scoped to current site only.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    });
    const status = res.status;
    const contentType = res.headers.get('content-type') ?? 'unknown';
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        status,
        contentType,
        error: `HTTP ${status} ${res.statusText}${errBody ? `: ${errBody.slice(0, 300)}` : ''}`,
      };
    }
    const isJson = contentType.includes('application/json');
    if (isJson) {
      const data = await res.json();
      const json = JSON.stringify(data);
      if (json.length > MAX_RESPONSE_BYTES) {
        return {
          ok: true,
          status,
          contentType,
          data: JSON.parse(json.slice(0, MAX_RESPONSE_BYTES)),
          truncated: true,
        };
      }
      return { ok: true, status, contentType, data };
    }
    let text = await res.text();
    let truncated = false;
    if (text.length > MAX_RESPONSE_BYTES) {
      text = text.slice(0, MAX_RESPONSE_BYTES);
      truncated = true;
    }
    return { ok: true, status, contentType, text, truncated };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: 'Request timed out' };
    }
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function executeHttpGet(
  url: string,
  currentUrl: string | undefined,
): Promise<HttpGetResult> {
  return fetchWithScope(url, { method: 'GET' }, currentUrl);
}

export async function executeHttpPost(
  url: string,
  body: unknown,
  currentUrl: string | undefined,
): Promise<HttpGetResult> {
  return fetchWithScope(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
    currentUrl,
  );
}

