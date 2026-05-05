import { Check, Eye, EyeOff, ExternalLink, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invalidateKeypairCache } from '../../lib/solana/keypair';
import {
  getAnthropicApiKey,
  getOAuthTokens,
  getPendingPkce,
  isApiKeyFromEnv,
  setAnthropicApiKey,
  setOAuthTokens,
  setPendingPkce,
} from '../../lib/storage';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  startPkce,
} from '../../lib/llm/anthropic-oauth';
import {
  getRpcConfig,
  isMainnetCustomized,
  setRpcConfig,
  type ClusterKind,
} from '../../lib/wallet-config';
import {
  clearWallet,
  pubkeyFromSecret,
  saveWalletSecret,
  shortPubkey,
} from '../../lib/wallet';
import { getSolanaSecret } from '../../lib/storage';

type Props = {
  onClose: () => void;
};

function presetNote(cluster: Exclude<ClusterKind, 'custom'>): string {
  if (cluster === 'devnet') {
    return 'api.devnet.solana.com (public, free, fake SOL for testing)';
  }
  return isMainnetCustomized()
    ? 'Mainnet RPC from VITE_DEFAULT_MAINNET_RPC (private, ready to use)'
    : 'api.mainnet-beta.solana.com (public, rate-limited — use Custom for stable RPC)';
}

export function SettingsPanel({ onClose }: Props) {
  const [secretInput, setSecretInput] = useState('');
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [derivedPubkey, setDerivedPubkey] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);

  const [cluster, setCluster] = useState<ClusterKind>('devnet');
  const [customRead, setCustomRead] = useState('');
  const [customWrite, setCustomWrite] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const apiKeyFromEnv = isApiKeyFromEnv();

  // Auth method: 'oauth' = Pro/Max subscription | 'apiKey' = Console API key
  const [authMethod, setAuthMethod] = useState<'oauth' | 'apiKey'>('oauth');
  const [oauthLoggedIn, setOauthLoggedIn] = useState(false);
  const [oauthExpiresAt, setOauthExpiresAt] = useState<number | null>(null);
  const [pendingLogin, setPendingLogin] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStored, setApiKeyStored] = useState(false);
  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');

  useEffect(() => {
    void Promise.all([
      getSolanaSecret(),
      getRpcConfig(),
      getOAuthTokens(),
      getPendingPkce(),
      getAnthropicApiKey(),
    ]).then(([secret, rpc, tokens, pending, apiKey]) => {
      if (secret) {
        setHasStoredSecret(true);
        setDerivedPubkey(pubkeyFromSecret(secret));
      }
      setCluster(rpc.cluster);
      if (rpc.cluster === 'custom') {
        setCustomRead(rpc.read);
        setCustomWrite(rpc.write);
      }
      if (tokens) {
        setOauthLoggedIn(true);
        setOauthExpiresAt(tokens.expiresAt);
        setAuthMethod('oauth');
      } else if (apiKey) {
        setApiKeyStored(true);
        setAuthMethod('apiKey');
      }
      if (pending) setPendingLogin(true);
    });
  }, []);

  async function handleStartLogin() {
    setOauthError(null);
    try {
      const pkce = await startPkce();
      await setPendingPkce({ verifier: pkce.verifier, state: pkce.state });
      const url = buildAuthorizeUrl(pkce);
      console.log('[oauth] opening authorize url', url);
      // Open authorize URL in a new tab — user logs in there, gets a code,
      // pastes it back into the input below.
      try {
        await chrome.tabs.create({ url, active: true });
      } catch (tabErr) {
        console.warn('[oauth] chrome.tabs.create failed, falling back', tabErr);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setPendingLogin(true);
    } catch (e) {
      console.error('[oauth] start login failed', e);
      setOauthError(String(e));
    }
  }

  async function handleExchangeCode() {
    if (!pastedCode.trim()) return;
    setExchanging(true);
    setOauthError(null);
    try {
      const pending = await getPendingPkce();
      console.log('[oauth] pending pkce loaded:', !!pending);
      if (!pending) {
        throw new Error(
          'No pending login — click "Open / Re-open login tab" first to get a fresh code',
        );
      }
      const codeLen = pastedCode.trim().length;
      console.log(
        '[oauth] exchanging code (len=' + codeLen + ', has#=' +
          pastedCode.includes('#') + ')',
      );
      const tokens = await exchangeCodeForTokens(
        pastedCode.trim(),
        pending.verifier,
        pending.state,
      );
      console.log('[oauth] exchange OK, expires in',
        Math.round((tokens.expiresAt - Date.now()) / 1000), 's');
      await setOAuthTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      await setPendingPkce(null);
      setOauthLoggedIn(true);
      setOauthExpiresAt(tokens.expiresAt);
      setPendingLogin(false);
      setPastedCode('');
    } catch (e) {
      console.error('[oauth] exchange failed', e);
      setOauthError(String(e));
    } finally {
      setExchanging(false);
    }
  }

  async function handleLogout() {
    await setOAuthTokens(null);
    await setPendingPkce(null);
    setOauthLoggedIn(false);
    setOauthExpiresAt(null);
    setPendingLogin(false);
    setPastedCode('');
  }

  async function handleImportTokens() {
    setOauthError(null);
    try {
      const trimmed = importJson.trim();
      if (!trimmed) throw new Error('Paste JSON first');
      const parsed = JSON.parse(trimmed);
      // Accept either the wrapped {claudeAiOauth: {...}} shape from Claude
      // Code's credentials.json or the inner object directly.
      const obj =
        (parsed.claudeAiOauth as Record<string, unknown>) ?? parsed;
      const accessToken = obj.accessToken ?? obj.access_token;
      const refreshToken = obj.refreshToken ?? obj.refresh_token;
      const expiresAt =
        obj.expiresAt ?? obj.expires_at ?? Date.now() + 60 * 60 * 1000;
      if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
        throw new Error(
          'Missing accessToken/refreshToken — check JSON shape',
        );
      }
      await setOAuthTokens({
        accessToken,
        refreshToken,
        expiresAt:
          typeof expiresAt === 'number'
            ? expiresAt
            : Date.now() + 60 * 60 * 1000,
      });
      setOauthLoggedIn(true);
      setOauthExpiresAt(
        typeof expiresAt === 'number'
          ? expiresAt
          : Date.now() + 60 * 60 * 1000,
      );
      setShowImport(false);
      setImportJson('');
    } catch (e) {
      setOauthError(String(e));
    }
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    await setAnthropicApiKey(apiKeyInput.trim());
    setApiKeyStored(true);
    setApiKeyInput('');
  }

  async function handleClearApiKey() {
    await setAnthropicApiKey(null);
    setApiKeyStored(false);
  }

  // Live-derive pubkey as user types
  useEffect(() => {
    if (!secretInput.trim()) {
      return;
    }
    const derived = pubkeyFromSecret(secretInput.trim());
    if (derived) {
      setDerivedPubkey(derived);
      setSecretError(null);
    } else {
      setDerivedPubkey(null);
      setSecretError('Invalid secret format (expected base58 64 bytes or JSON array)');
    }
  }, [secretInput]);

  async function handleSave() {
    setSaving(true);
    setSecretError(null);
    try {
      // Save secret if user provided new one
      if (secretInput.trim()) {
        await saveWalletSecret(secretInput.trim());
        invalidateKeypairCache();
        setHasStoredSecret(true);
        setSecretInput('');
      }
      // Save cluster + custom RPC
      await setRpcConfig(
        cluster,
        cluster === 'custom' ? customRead.trim() || null : null,
        cluster === 'custom' ? customWrite.trim() || customRead.trim() || null : null,
      );
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 1500);
    } catch (err) {
      setSecretError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveWallet() {
    if (!confirm('Remove wallet? You\'ll need to re-enter the private key to sign txs.')) {
      return;
    }
    await clearWallet();
    invalidateKeypairCache();
    setHasStoredSecret(false);
    setDerivedPubkey(null);
    setSecretInput('');
  }

  return (
    <div className="absolute inset-0 bg-bg z-10 flex flex-col">
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.08] flex-shrink-0">
        <span className="text-[13px] text-white/90">Settings</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="text-white/60 hover:text-white/90 transition-colors duration-150 p-1 -mr-1"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
        {/* Wallet section */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] text-white/60">Wallet Private Key</span>
            <span
              className={`text-[10px] uppercase tracking-wider ${
                hasStoredSecret ? 'text-status-green' : 'text-status-amber'
              }`}
            >
              {hasStoredSecret ? 'connected' : 'not set'}
            </span>
          </div>

          {hasStoredSecret && derivedPubkey && !secretInput && (
            <div className="bg-[#161616] border border-white/[0.08] rounded-[10px] px-3 py-2.5 mb-2">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
                Pubkey (derived)
              </div>
              <div
                className="text-[12px] font-mono text-white/85 truncate"
                title={derivedPubkey}
              >
                {shortPubkey(derivedPubkey, 8)}
              </div>
              <button
                type="button"
                onClick={handleRemoveWallet}
                className="mt-2 text-[11px] text-status-red hover:text-status-red/80 inline-flex items-center gap-1"
              >
                <Trash2 size={11} strokeWidth={1.5} /> Remove wallet
              </button>
            </div>
          )}

          <div className="relative">
            <input
              type={secretRevealed ? 'text' : 'password'}
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder={
                hasStoredSecret
                  ? 'Replace with a new secret...'
                  : 'Paste base58 secret or JSON array'
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed] focus:outline-none rounded-[10px] pl-3 pr-9 py-2 text-[12px] font-mono text-white placeholder:text-white/30 transition-colors duration-150"
            />
            <button
              type="button"
              onClick={() => setSecretRevealed((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 p-1"
              aria-label={secretRevealed ? 'Hide' : 'Show'}
            >
              {secretRevealed ? (
                <EyeOff size={13} strokeWidth={1.5} />
              ) : (
                <Eye size={13} strokeWidth={1.5} />
              )}
            </button>
          </div>
          {secretInput && derivedPubkey && (
            <p className="text-[11px] text-status-green mt-1.5">
              ✓ Pubkey: {shortPubkey(derivedPubkey, 8)}
            </p>
          )}
          {secretError && (
            <p className="text-[11px] text-status-red mt-1.5">{secretError}</p>
          )}
          <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
            Stored locally in chrome.storage. Never leaves your machine. Pubkey is auto-derived — no need to enter it separately.
          </p>
        </section>

        {/* Cluster section */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] text-white/60">Cluster</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {(['mainnet', 'devnet', 'custom'] as ClusterKind[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCluster(c)}
                className={`h-9 text-[11px] font-medium uppercase tracking-wider rounded-[8px] transition-colors duration-150 ${
                  cluster === c
                    ? 'bg-[#7c3aed] text-white'
                    : 'bg-[#161616] border border-white/[0.08] text-white/60 hover:text-white/90 hover:border-white/[0.14]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {cluster === 'custom' ? (
            <div className="space-y-2">
              <input
                type="text"
                value={customRead}
                onChange={(e) => setCustomRead(e.target.value)}
                placeholder="Read RPC URL (https://...)"
                className="w-full bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed] focus:outline-none rounded-[10px] px-3 py-2 text-[12px] font-mono text-white placeholder:text-white/30"
              />
              <input
                type="text"
                value={customWrite}
                onChange={(e) => setCustomWrite(e.target.value)}
                placeholder="Write RPC URL (defaults to read if blank)"
                className="w-full bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed] focus:outline-none rounded-[10px] px-3 py-2 text-[12px] font-mono text-white placeholder:text-white/30"
              />
            </div>
          ) : (
            <p className="text-[11px] text-white/40 leading-relaxed">
              {presetNote(cluster)}
            </p>
          )}
          {cluster === 'devnet' && (
            <p className="text-[11px] text-status-amber mt-1.5">
              ⚠ Jupiter swap won't work on devnet (mainnet-only).
            </p>
          )}
          {cluster === 'mainnet' && (
            <p className="text-[11px] text-status-amber mt-1.5">
              ⚠ Real money — txns use real SOL.
            </p>
          )}
        </section>

        {/* Claude auth */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] text-white/60">Claude auth</span>
            <span
              className={`text-[10px] uppercase tracking-wider ${
                oauthLoggedIn || apiKeyFromEnv || apiKeyStored
                  ? 'text-status-green'
                  : 'text-status-amber'
              }`}
            >
              {oauthLoggedIn
                ? 'pro/max sub'
                : apiKeyFromEnv
                  ? 'env api key'
                  : apiKeyStored
                    ? 'api key'
                    : 'not set'}
            </span>
          </div>
          {/* Method picker */}
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => setAuthMethod('oauth')}
              className={`flex-1 h-7 text-[11px] rounded-md transition-colors ${
                authMethod === 'oauth'
                  ? 'bg-[#7c3aed]/20 text-[#a78bfa] border border-[#7c3aed]/40'
                  : 'bg-white/[0.04] text-white/50 hover:text-white/80'
              }`}
            >
              Subscription (Pro/Max)
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('apiKey')}
              className={`flex-1 h-7 text-[11px] rounded-md transition-colors ${
                authMethod === 'apiKey'
                  ? 'bg-[#7c3aed]/20 text-[#a78bfa] border border-[#7c3aed]/40'
                  : 'bg-white/[0.04] text-white/50 hover:text-white/80'
              }`}
            >
              API key
            </button>
          </div>

          {authMethod === 'oauth' && !oauthLoggedIn && !pendingLogin && !showImport && (
            <>
              <p className="text-[11px] text-white/40 leading-relaxed mb-2">
                Login with your claude.ai account — usage bills against your
                Pro/Max plan instead of API credits.
              </p>
              <button
                type="button"
                onClick={handleStartLogin}
                className="w-full h-8 bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-white/85 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={11} strokeWidth={1.7} /> Login with Claude
              </button>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="w-full h-7 mt-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
              >
                Import tokens from Claude Code CLI →
              </button>
            </>
          )}

          {authMethod === 'oauth' && showImport && !oauthLoggedIn && (
            <>
              <p className="text-[11px] text-white/50 leading-relaxed mb-1.5">
                If browser OAuth is rate-limited, paste tokens from Claude Code
                CLI's credentials file:
              </p>
              <p className="text-[10px] text-white/30 leading-relaxed mb-2 font-mono">
                ~/.claude/.credentials.json (macOS/Linux)
                <br />
                or %USERPROFILE%\.claude\.credentials.json (Win)
              </p>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"claudeAiOauth": {"accessToken": "...", "refreshToken": "...", "expiresAt": 1735689600000}}'
                className="w-full h-24 px-2 py-1.5 bg-white/[0.04] border border-white/10 rounded-md text-[11px] text-white/85 font-mono placeholder:text-white/25 focus:outline-none focus:border-[#7c3aed]/60 resize-none"
              />
              <div className="flex gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={handleImportTokens}
                  disabled={!importJson.trim()}
                  className="flex-1 h-8 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-[11px] rounded-md transition-colors"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportJson('');
                    setOauthError(null);
                  }}
                  className="h-8 px-3 text-[11px] text-white/60 hover:text-white/90"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {authMethod === 'oauth' && pendingLogin && !oauthLoggedIn && (
            <>
              <p className="text-[11px] text-white/40 leading-relaxed mb-2">
                Step 1: open the Claude login tab. Step 2: after approving,
                copy the code shown and paste it here.
              </p>
              <button
                type="button"
                onClick={handleStartLogin}
                className="w-full h-8 mb-2 bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-white/85 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={11} strokeWidth={1.7} /> Open / Re-open
                login tab
              </button>
              <input
                type="text"
                value={pastedCode}
                onChange={(e) => setPastedCode(e.target.value)}
                placeholder="paste auth code here…"
                className="w-full h-8 px-2 bg-white/[0.04] border border-white/10 rounded-md text-[12px] text-white/90 font-mono placeholder:text-white/30 focus:outline-none focus:border-[#7c3aed]/60"
              />
              <div className="flex gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={handleExchangeCode}
                  disabled={!pastedCode.trim() || exchanging}
                  className="flex-1 h-8 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-[11px] rounded-md transition-colors"
                >
                  {exchanging ? 'Exchanging…' : 'Submit code'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await setPendingPkce(null);
                    setPendingLogin(false);
                    setPastedCode('');
                    setOauthError(null);
                  }}
                  className="h-8 px-3 text-[11px] text-white/60 hover:text-white/90"
                >
                  Reset
                </button>
              </div>
            </>
          )}

          {authMethod === 'oauth' && oauthLoggedIn && (
            <>
              <p className="text-[11px] text-white/60 leading-relaxed mb-1.5">
                Logged in. Token auto-refreshes.
                {oauthExpiresAt && (
                  <span className="text-white/40 ml-1">
                    expires{' '}
                    {new Date(oauthExpiresAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full h-8 bg-white/[0.04] hover:bg-status-red/20 hover:text-status-red text-[11px] text-white/60 rounded-md transition-colors"
              >
                Logout
              </button>
            </>
          )}

          {authMethod === 'apiKey' && (
            <>
              {apiKeyFromEnv ? (
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Loaded from VITE_ANTHROPIC_API_KEY in .env.local.
                </p>
              ) : (
                <>
                  <div className="flex gap-1 mb-1.5">
                    <input
                      type={apiKeyRevealed ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        apiKeyStored ? '••••• stored' : 'sk-ant-…'
                      }
                      className="flex-1 h-8 px-2 bg-white/[0.04] border border-white/10 rounded-md text-[12px] text-white/90 font-mono placeholder:text-white/30 focus:outline-none focus:border-[#7c3aed]/60"
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyRevealed((v) => !v)}
                      className="h-8 w-8 flex items-center justify-center text-white/50 hover:text-white/80 bg-white/[0.04] rounded-md"
                      aria-label={apiKeyRevealed ? 'Hide' : 'Reveal'}
                    >
                      {apiKeyRevealed ? (
                        <EyeOff size={11} strokeWidth={1.7} />
                      ) : (
                        <Eye size={11} strokeWidth={1.7} />
                      )}
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      disabled={!apiKeyInput.trim()}
                      className="flex-1 h-8 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-[11px] rounded-md transition-colors"
                    >
                      Save key
                    </button>
                    {apiKeyStored && (
                      <button
                        type="button"
                        onClick={handleClearApiKey}
                        className="h-8 w-8 flex items-center justify-center text-white/50 hover:text-status-red bg-white/[0.04] rounded-md"
                        aria-label="Clear key"
                      >
                        <Trash2 size={11} strokeWidth={1.7} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {oauthError && (
            <p className="text-[11px] text-status-red mt-1.5 leading-relaxed">
              {oauthError}
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full h-9 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-[13px] font-medium rounded-[12px] transition-colors duration-150 flex items-center justify-center gap-1.5"
        >
          {savedAt ? (
            <>
              <Check size={12} strokeWidth={2} /> Saved
            </>
          ) : saving ? (
            'Saving...'
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}
