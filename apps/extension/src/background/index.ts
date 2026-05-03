console.log('[bg] service worker booted', new Date().toISOString());

// Strip Origin/Sec-Fetch-* headers from requests going to Anthropic API.
// Consumer Pro/Max accounts reject any cross-origin browser request — even
// from extension service workers — because the Origin header is non-empty.
// declarativeNetRequest with host access lets us mutate outgoing headers
// without prompting the user (host already in host_permissions).
const ANTHROPIC_HEADER_STRIP_RULE_ID = 1001;
async function ensureAnthropicHeaderRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ANTHROPIC_HEADER_STRIP_RULE_ID],
      addRules: [
        {
          id: ANTHROPIC_HEADER_STRIP_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [
              {
                header: 'origin',
                operation:
                  'remove' as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: 'sec-fetch-site',
                operation:
                  'remove' as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: 'sec-fetch-mode',
                operation:
                  'remove' as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: 'sec-fetch-dest',
                operation:
                  'remove' as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: 'referer',
                operation:
                  'remove' as chrome.declarativeNetRequest.HeaderOperation,
              },
            ],
          },
          condition: {
            urlFilter: '||api.anthropic.com',
            resourceTypes: [
              'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
            ],
          },
        },
      ],
    });
    console.log('[bg] anthropic header strip rule registered');
  } catch (e) {
    console.error('[bg] failed to register header strip rule', e);
  }
}
void ensureAnthropicHeaderRule();
chrome.runtime.onInstalled.addListener(() => {
  void ensureAnthropicHeaderRule();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureAnthropicHeaderRule();
});

// OAuth token exchange runs in the background service worker rather than the
// side panel so the request goes through the extension's "background" context.
// Some Anthropic endpoints rate-limit by Origin header; service workers in
// extensions have a less-restricted origin handling for hosts in host_permissions.
const OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';

type OAuthRequestPayload = {
  type: 'OAUTH_TOKEN_REQUEST';
  body: Record<string, unknown>;
};

type OAuthResponsePayload = {
  ok: boolean;
  status: number;
  body?: unknown;
  error?: string;
};

chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender, sendResponse: (response: OAuthResponsePayload) => void) => {
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as { type?: unknown }).type === 'OAUTH_TOKEN_REQUEST'
    ) {
      const payload = msg as OAuthRequestPayload;
      console.log('[bg] OAuth token request', {
        grant: payload.body.grant_type,
        hasCode: 'code' in payload.body,
        hasVerifier: 'code_verifier' in payload.body,
      });
      void (async () => {
        try {
          const res = await fetch(OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify(payload.body),
          });
          const text = await res.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          console.log('[bg] OAuth token response', res.status, parsed);
          sendResponse({ ok: res.ok, status: res.status, body: parsed });
        } catch (err) {
          console.error('[bg] OAuth token fetch failed', err);
          sendResponse({ ok: false, status: 0, error: String(err) });
        }
      })();
      return true; // keep channel open for async sendResponse
    }
    return false;
  },
);

// Streaming bridge: side panel connects on port `anthropic-stream`, posts
// { url, headers, body } once, then receives a series of { type: 'chunk', text }
// messages followed by { type: 'done' } or { type: 'error', status, body }.
//
// We do this in the background because consumer Pro/Max accounts block
// browser-origin CORS for `api.anthropic.com/v1/messages`. Service-worker
// fetches don't trigger the same cross-origin policy when host is in
// host_permissions.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'anthropic-stream') return;

  let aborter: AbortController | null = null;
  port.onDisconnect.addListener(() => {
    aborter?.abort();
  });

  port.onMessage.addListener((msg: unknown) => {
    if (
      typeof msg !== 'object' ||
      msg === null ||
      (msg as { type?: unknown }).type !== 'start'
    ) {
      return;
    }
    const req = msg as {
      url: string;
      headers: Record<string, string>;
      body: unknown;
    };
    aborter = new AbortController();
    void (async () => {
      try {
        const res = await fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(req.body),
          signal: aborter!.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          console.warn('[bg] anthropic stream non-OK', res.status, text);
          try {
            port.postMessage({ type: 'error', status: res.status, body: text });
          } catch {
            // port may already be disconnected
          }
          try {
            port.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        if (!res.body) {
          port.postMessage({ type: 'error', status: 0, body: 'no body' });
          port.disconnect();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            try {
              port.postMessage({ type: 'chunk', text });
            } catch {
              // port disconnected by side panel; abort fetch
              aborter?.abort();
              return;
            }
          }
          try {
            port.postMessage({ type: 'done' });
          } catch {
            // ignore
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if (aborter?.signal.aborted) return;
        console.error('[bg] anthropic stream fetch failed', err);
        try {
          port.postMessage({ type: 'error', status: 0, body: String(err) });
        } catch {
          // ignore
        }
      } finally {
        try {
          port.disconnect();
        } catch {
          // ignore
        }
      }
    })();
  });
});

function broadcastTab(
  url: string | undefined,
  favIconUrl: string | undefined,
  title: string | undefined,
): void {
  chrome.runtime
    .sendMessage({ type: 'TAB_CHANGED', url, favIconUrl, title })
    .catch(() => {});
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    broadcastTab(tab.url, tab.favIconUrl, tab.title);
  } catch {
    // tab gone, ignore
  }
});

chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) {
    broadcastTab(tab.url, tab.favIconUrl, tab.title);
  }
});
