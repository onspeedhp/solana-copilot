const KNOWN_LLMS_URLS: Record<string, string> = {
  'jupiter.ag': 'https://developers.jup.ag/docs/llms.txt',
  'jup.ag': 'https://developers.jup.ag/docs/llms.txt',
};

const PATHS = ['/llms.txt', '/docs/llms.txt', '/.well-known/llms.txt'];
const SUBDOMAIN_PREFIXES = ['', 'developers.', 'dev.', 'docs.', 'api.'];
const FETCH_TIMEOUT_MS = 5000;
const MAX_CONTENT_BYTES = 50_000;

function getBaseDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join('.');
}

function getCandidateUrls(domain: string): string[] {
  const urls = new Set<string>();
  const override = KNOWN_LLMS_URLS[domain] ?? KNOWN_LLMS_URLS[getBaseDomain(domain)];
  if (override) urls.add(override);
  for (const path of PATHS) {
    urls.add(`https://${domain}${path}`);
  }
  const base = getBaseDomain(domain);
  for (const prefix of SUBDOMAIN_PREFIXES) {
    const host = `${prefix}${base}`;
    if (host === domain) continue;
    for (const path of PATHS) {
      urls.add(`https://${host}${path}`);
    }
  }
  return Array.from(urls);
}

export async function fetchLlmsTxt(domain: string): Promise<string | null> {
  for (const url of getCandidateUrls(domain)) {
    const content = await tryFetch(url);
    if (content) {
      console.log(`[llms-txt] ${domain} resolved via ${url}`);
      return content;
    }
  }
  return null;
}

async function tryFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return null;
    let text = await res.text();
    if (text.length > MAX_CONTENT_BYTES) {
      text = text.slice(0, MAX_CONTENT_BYTES);
    }
    if (!text.trim().startsWith('#') && !text.includes('- ')) {
      return null;
    }
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
