// Claude.ai OAuth flow — uses Claude Code's public OAuth client to authenticate
// against the user's Pro/Max subscription. The access token is then used as a
// Bearer for `api.anthropic.com/v1/messages`, billed against their plan instead
// of API credits.
//
// Caveats:
// - We reuse Claude Code's client_id (publicly observable). Anthropic does not
//   officially endorse third-party use of this client; gray-area TOS-wise.
// - Anthropic enforces "OAuth tokens only work with Claude Code" by inspecting
//   the system prompt. We must prepend the Claude Code identifier sentence to
//   our real system prompt so the API accepts the request.
// - Manual paste flow: we open the authorize URL in a new tab; Anthropic
//   redirects to console.anthropic.com/oauth/code/callback which displays the
//   code; user copies it back into our extension.

const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
// Mirrors the scope set Claude Code CLI requests today.
const SCOPES = 'org:create_api_key user:profile user:inference';

// Token request runs in the background service worker — see background/index.ts.
async function postTokenRequest(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body?: unknown; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'OAUTH_TOKEN_REQUEST', body },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            status: 0,
            error: chrome.runtime.lastError.message,
          });
        } else {
          resolve(response);
        }
      },
    );
  });
}

export const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  // Unix epoch ms when accessToken expires
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function deriveChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

export type PKCEChallenge = {
  verifier: string;
  challenge: string;
  state: string;
};

export async function startPkce(): Promise<PKCEChallenge> {
  const verifier = generateVerifier();
  const challenge = await deriveChallenge(verifier);
  const state = generateVerifier();
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl(pkce: PKCEChallenge): string {
  const params = new URLSearchParams({
    code: 'true', // Claude Code uses this query — keeps the manual-paste page format
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// User-pasted code may include "#state" suffix (Claude Code's manual-paste page
// shows code in form `<code>#<state>`). Split if present.
function splitPastedCode(raw: string): { code: string; state?: string } {
  let trimmed = raw.trim();
  // Some users paste the full callback URL — extract only the `code` query param
  if (trimmed.startsWith('http')) {
    try {
      const u = new URL(trimmed);
      const c = u.searchParams.get('code');
      const s = u.searchParams.get('state');
      if (c) trimmed = s ? `${c}#${s}` : c;
    } catch {
      // ignore, fall through to raw split
    }
  }
  // URL-decode in case the page rendered the code URL-encoded
  try {
    trimmed = decodeURIComponent(trimmed);
  } catch {
    // not URL-encoded; ignore
  }
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    return {
      code: trimmed.slice(0, hashIdx),
      state: trimmed.slice(hashIdx + 1),
    };
  }
  return { code: trimmed };
}

export async function exchangeCodeForTokens(
  pastedCode: string,
  verifier: string,
  expectedState?: string,
): Promise<OAuthTokens> {
  const { code, state } = splitPastedCode(pastedCode);
  if (expectedState && state && state !== expectedState) {
    throw new Error('OAuth state mismatch — authorization may have been tampered with');
  }
  const res = await postTokenRequest({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    state: state ?? expectedState ?? '',
  });
  if (!res.ok) {
    const detail =
      typeof res.body === 'string'
        ? res.body
        : JSON.stringify(res.body ?? res.error ?? '');
    if (res.status === 429) {
      throw new Error(
        `Rate limited (429). Anthropic blocked the request — wait 5-10 min, then click "Open / Re-open login tab" to get a NEW code (codes are one-time). Body: ${detail}`,
      );
    }
    if (res.status === 400) {
      throw new Error(
        `Invalid code (400). Likely already used or has wrong format. Get a fresh code via Re-open. Body: ${detail}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth refused (${res.status}). Anthropic may have blocked third-party use of the OAuth client. Body: ${detail}`,
      );
    }
    throw new Error(
      `Token exchange failed (${res.status}): ${detail || res.error}`,
    );
  }
  const json = res.body as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json?.access_token || !json?.refresh_token || !json?.expires_in) {
    throw new Error(
      `Token response missing fields: ${JSON.stringify(json)}`,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function refreshTokens(
  refreshToken: string,
): Promise<OAuthTokens> {
  const res = await postTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  if (!res.ok) {
    const detail =
      typeof res.body === 'string'
        ? res.body
        : JSON.stringify(res.body ?? res.error ?? '');
    throw new Error(`Token refresh failed (${res.status}): ${detail}`);
  }
  const json = res.body as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json?.access_token || !json?.refresh_token || !json?.expires_in) {
    throw new Error(`Refresh response missing fields: ${JSON.stringify(json)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}
