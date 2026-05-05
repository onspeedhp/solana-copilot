import { useEffect } from 'react';
import { getIntegrationForUrl } from '../../lib/skills';
import { fetchLlmsTxt } from '../../lib/llms-txt';
import {
  getCachedLlmsTxt,
  setCachedLlmsTxt,
  setCachedLlmsTxtMissing,
} from '../../lib/storage';
import { useApp } from '../store/app';

function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function useLlmsDiscovery(): void {
  const currentUrl = useApp((s) =>
    s.state.kind === 'ready' ? s.state.currentUrl : undefined,
  );
  const setDiscoveredLlmsTxt = useApp((s) => s.setDiscoveredLlmsTxt);

  useEffect(() => {
    const domain = domainOf(currentUrl);
    if (!domain) {
      setDiscoveredLlmsTxt(null);
      return;
    }

    // Skip if we have a static integration — its tools are better
    const integration = getIntegrationForUrl(currentUrl);
    if (integration && integration.tools.length > 0) {
      setDiscoveredLlmsTxt(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const cached = await getCachedLlmsTxt(domain);
      if (cancelled) return;
      if (cached !== null) {
        setDiscoveredLlmsTxt(cached.length > 0 ? cached : null);
        return;
      }

      console.log(`[llms-discovery] fetching for ${domain}`);
      const fetched = await fetchLlmsTxt(domain);
      if (cancelled) return;
      if (fetched) {
        await setCachedLlmsTxt(domain, fetched);
        setDiscoveredLlmsTxt(fetched);
      } else {
        await setCachedLlmsTxtMissing(domain);
        setDiscoveredLlmsTxt(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUrl, setDiscoveredLlmsTxt]);
}
