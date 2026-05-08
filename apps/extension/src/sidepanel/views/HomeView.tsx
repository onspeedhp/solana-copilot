import {
  BarChart3,
  Copy,
  Download,
  DollarSign,
  RotateCcw,
  Search,
  Send,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { readActiveTabHtml } from '../../lib/dom-bridge';
import { getIntegrationForUrl } from '../../lib/skills';
import { useWalletStats } from '../hooks/useWalletStats';
import type {
  SiteIntegration,
  SiteSuggestion,
} from '../../lib/skills/types';
import { shortPubkey } from '../../lib/wallet';
import type { Message } from '../../types';
import { ConfirmActionCard } from '../components/ConfirmActionCard';
import { MessageBubble } from '../components/MessageBubble';

const SUGGESTION_ICONS: Record<SiteSuggestion['icon'], LucideIcon> = {
  search: Search,
  trending: TrendingUp,
  send: Send,
  dollar: DollarSign,
  'bar-chart': BarChart3,
};

const FALLBACK_SUGGESTIONS: SiteSuggestion[] = [
  { icon: 'dollar', text: "What's my SOL balance?" },
  { icon: 'search', text: 'List my token holdings' },
  { icon: 'send', text: 'Send 0.01 SOL to GsTtrUR…' },
];

type Props = {
  pubkey: string;
  currentUrl: string | undefined;
  currentFavIcon: string | undefined;
  currentTitle: string | undefined;
  messages: Message[];
  isStreaming: boolean;
  onSuggestionClick: (text: string) => void;
  onApproveAction: (actionId: string) => void;
  onRejectAction: (actionId: string) => void;
  onClearChat: () => void;
};

export function HomeView({
  pubkey,
  currentUrl,
  currentFavIcon,
  currentTitle,
  messages,
  isStreaming,
  onSuggestionClick,
  onApproveAction,
  onRejectAction,
  onClearChat,
}: Props) {
  const integration = getIntegrationForUrl(currentUrl);
  const hasMessages = messages.length > 0;
  const stats = useWalletStats(pubkey);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SiteCard
        url={currentUrl}
        favIcon={currentFavIcon}
        title={currentTitle}
        integration={integration}
      />
      <WalletStripPresentation
        pubkey={pubkey}
        showClear={hasMessages}
        onClearChat={onClearChat}
        stats={stats}
      />
      {hasMessages && (
        <QuickActionsBar
          integration={integration}
          currentUrl={currentUrl}
          stats={stats}
          disabled={isStreaming}
          onSuggestionClick={onSuggestionClick}
        />
      )}
      {hasMessages ? (
        <MessageList
          messages={messages}
          onApprove={onApproveAction}
          onReject={onRejectAction}
        />
      ) : (
        <EmptyChat
          integration={integration}
          currentUrl={currentUrl}
          disabled={isStreaming}
          stats={stats}
          onSuggestionClick={onSuggestionClick}
        />
      )}
    </div>
  );
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function getDomainFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function downloadPageHtml(domain: string) {
  const snap = await readActiveTabHtml();
  if (!snap) {
    alert('Cannot read page HTML (chrome:// page or permission denied).');
    return;
  }
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/T/, '_')
    .slice(0, 19);
  const sourceComment = `<!-- Captured from ${snap.url} on ${new Date().toISOString()} -->\n`;
  const fullHtml = `${snap.doctype}\n${sourceComment}${snap.html}`;
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `page-${domain}-${ts}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SiteCard({
  url,
  favIcon,
  title,
  integration,
}: {
  url: string | undefined;
  favIcon: string | undefined;
  title: string | undefined;
  integration: SiteIntegration | null;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const domain = getDomainFromUrl(url);
  if (!domain) return null;

  // Primary: tab's own favIconUrl (Chrome cached). Fallback: DuckDuckGo
  // icon service which serves a higher-res square icon for any domain.
  const fallbackIcon = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  const iconSrc = !iconFailed ? favIcon || fallbackIcon : null;
  const displayName = integration?.name ?? domain;
  const cleanTitle = title && title !== domain ? title : null;

  return (
    <div className="px-4 py-2 border-b border-white/[0.05] flex-shrink-0 flex items-center gap-2.5">
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className="w-7 h-7 rounded-md flex-shrink-0 bg-white/[0.04]"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <div className="w-7 h-7 rounded-md bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center flex-shrink-0">
          <span className="text-[12px] text-[#7c3aed] uppercase font-medium">
            {displayName.charAt(0)}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[13px] text-white/90 truncate"
            title={domain}
          >
            {displayName}
          </span>
          {integration && (
            <span className="text-[9px] text-[#7c3aed] bg-[#7c3aed]/[0.12] px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
              connected
            </span>
          )}
        </div>
        {cleanTitle && (
          <div
            className="text-[11px] text-white/40 truncate"
            title={cleanTitle}
          >
            {cleanTitle}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={dlBusy}
        onClick={async () => {
          setDlBusy(true);
          try {
            await downloadPageHtml(domain);
          } finally {
            setDlBusy(false);
          }
        }}
        className="text-white/40 hover:text-white/80 disabled:opacity-40 transition-colors duration-150 p-1 flex-shrink-0"
        aria-label="Download page HTML"
        title="Download fully-rendered page HTML"
      >
        <Download size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function WalletStripPresentation({
  pubkey,
  showClear,
  onClearChat,
  stats,
}: {
  pubkey: string;
  showClear: boolean;
  onClearChat: () => void;
  stats: ReturnType<typeof useWalletStats>;
}) {
  return (
    <div className="px-4 py-2 border-b border-white/[0.05] flex-shrink-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-1.5 h-1.5 rounded-full bg-status-green flex-shrink-0" />
          <span
            className="text-[12px] font-mono text-white/80 truncate"
            title={pubkey}
          >
            {shortPubkey(pubkey, 6)}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {showClear && (
            <button
              type="button"
              onClick={onClearChat}
              className="text-white/40 hover:text-white/80 transition-colors duration-150 p-1"
              aria-label="New chat"
              title="New chat (clear history)"
            >
              <RotateCcw size={11} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(pubkey);
            }}
            className="text-white/40 hover:text-white/80 transition-colors duration-150 p-1 -mr-1"
            aria-label="Copy address"
            title="Copy full address"
          >
            <Copy size={11} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {stats?.stats ? (
        <div className="flex items-baseline gap-2 mt-0.5 text-[11px]">
          <span className="text-white/85 font-mono">
            {fmtCompact(stats.stats.solBalance)} SOL
          </span>
          <span className="text-white/30">·</span>
          <span className="text-white/60 font-mono">
            ${fmtCompact(stats.stats.usdValue)}
          </span>
          {stats.error && (
            <span
              className="text-status-amber text-[10px] truncate ml-auto"
              title={stats.error}
            >
              ⚠ {stats.error}
            </span>
          )}
          {!stats.error && stats.stats.solPriceUsd > 0 && (
            <span className="text-white/20 ml-auto">
              1 SOL = ${fmtCompact(stats.stats.solPriceUsd)}
            </span>
          )}
        </div>
      ) : stats?.error ? (
        <div className="flex items-baseline gap-2 mt-0.5 text-[11px]">
          <span className="text-white/40 font-mono">— SOL · $—</span>
          <span
            className="text-status-amber text-[10px] truncate ml-auto"
            title={stats.error}
          >
            ⚠ {stats.error}
          </span>
        </div>
      ) : stats?.loading ? (
        <div className="flex items-baseline gap-2 mt-0.5 text-[11px]">
          <span className="text-white/30 font-mono">loading…</span>
        </div>
      ) : null}
    </div>
  );
}

function buildDynamicSuggestions(
  integration: SiteIntegration | null,
  currentUrl: string | undefined,
  stats: ReturnType<typeof useWalletStats>,
): SiteSuggestion[] {
  if (integration) {
    // Try URL-aware suggestions first (per-page contextual chips)
    if (currentUrl && integration.getSuggestionsForUrl) {
      try {
        const u = new URL(currentUrl);
        const dynamic = integration.getSuggestionsForUrl(u);
        if (dynamic && dynamic.length > 0) return dynamic;
      } catch {
        // bad URL, fall through
      }
    }
    return integration.suggestions;
  }

  const dynamic: SiteSuggestion[] = [];
  const s = stats?.stats;
  if (s) {
    if (s.solBalance >= 1) {
      dynamic.push({
        icon: 'send',
        text: `Swap 0.5 SOL to USDC`,
      });
    }
    if (s.usdValue >= 50) {
      dynamic.push({
        icon: 'trending',
        text: 'Best USDC yield right now',
      });
    }
    dynamic.push({
      icon: 'search',
      text: 'List my token holdings',
    });
    if (s.solBalance < 0.05) {
      dynamic.push({
        icon: 'dollar',
        text: 'My SOL balance',
      });
    }
  }
  if (dynamic.length === 0) return FALLBACK_SUGGESTIONS;
  return dynamic.slice(0, 3);
}

function EmptyChat({
  integration,
  currentUrl,
  disabled,
  stats,
  onSuggestionClick,
}: {
  integration: SiteIntegration | null;
  currentUrl: string | undefined;
  disabled: boolean;
  stats: ReturnType<typeof useWalletStats>;
  onSuggestionClick: (text: string) => void;
}) {
  const suggestions = buildDynamicSuggestions(integration, currentUrl, stats);
  const hint = integration
    ? `Ask me about ${integration.name} or your wallet`
    : 'Ask me about your wallet';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto py-6">
      <p className="text-[13px] text-white/40 mb-4 text-center">{hint}</p>
      <div className="w-full max-w-[300px] space-y-1.5">
        {suggestions.map((s) => {
          const Icon = SUGGESTION_ICONS[s.icon];
          return (
            <button
              type="button"
              key={s.text}
              disabled={disabled}
              onClick={() => onSuggestionClick(s.text)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-[#161616] border border-white/[0.08] hover:border-white/[0.14] disabled:opacity-50 disabled:cursor-not-allowed rounded-[6px] text-[12px] text-white/80 transition-colors duration-150 text-left"
            >
              <Icon
                size={14}
                strokeWidth={1.5}
                className="text-white/40 flex-shrink-0"
              />
              <span>{s.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Always-on horizontal chip strip showing actions relevant to the current
// page. Sits between the wallet strip and the message list when chat has
// content. Hidden if there's nothing site-specific to suggest.
function QuickActionsBar({
  integration,
  currentUrl,
  stats,
  disabled,
  onSuggestionClick,
}: {
  integration: SiteIntegration | null;
  currentUrl: string | undefined;
  stats: ReturnType<typeof useWalletStats>;
  disabled: boolean;
  onSuggestionClick: (text: string) => void;
}) {
  const suggestions = buildDynamicSuggestions(integration, currentUrl, stats);
  // On non-integration sites with no wallet stats, suggestions fall back to
  // the static FALLBACK list which is too generic to be useful here. Hide.
  if (!integration && (!stats?.stats || suggestions.length === 0)) return null;
  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-white/[0.05] flex-shrink-0">
      <div
        className="flex gap-1.5 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {suggestions.map((s) => {
          const Icon = SUGGESTION_ICONS[s.icon];
          return (
            <button
              type="button"
              key={s.text}
              disabled={disabled}
              onClick={() => onSuggestionClick(s.text)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed border border-white/[0.06] rounded-md text-[11px] text-white/75 hover:text-white/95 transition-colors duration-150 whitespace-nowrap flex-shrink-0"
              title={s.text}
            >
              <Icon
                size={11}
                strokeWidth={1.7}
                className="text-white/40 flex-shrink-0"
              />
              <span className="truncate max-w-[180px]">{s.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageList({
  messages,
  onApprove,
  onReject,
}: {
  messages: Message[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);

  const lastMsg = messages[messages.length - 1];
  const lastMsgId = lastMsg?.id ?? null;
  const lastSig = (() => {
    if (!lastMsg) return '';
    if (lastMsg.role === 'assistant')
      return `${lastMsg.id}:${lastMsg.content.length}`;
    if (lastMsg.role === 'action') return `${lastMsg.id}:${lastMsg.status}`;
    return lastMsg.id;
  })();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNewMsg = lastMsgId !== lastMsgIdRef.current;
    lastMsgIdRef.current = lastMsgId;

    if (isNewMsg) {
      // new message: always scroll, reset user-scroll tracking
      el.scrollTop = el.scrollHeight;
      userScrolledUpRef.current = false;
    } else if (!userScrolledUpRef.current) {
      // streaming token update: scroll only if user is following
      el.scrollTop = el.scrollHeight;
    }
  }, [lastSig, lastMsgId]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    userScrolledUpRef.current = !atBottom;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 px-4 py-4 overflow-y-auto space-y-3"
    >
      {messages.map((m) => {
        if (m.role === 'action') {
          return (
            <ConfirmActionCard
              key={m.id}
              id={m.id}
              tool={m.tool}
              isWrite={m.isWrite}
              args={m.args}
              intent={m.intent}
              status={m.status}
              result={m.result}
              error={m.error}
              onApprove={() => onApprove(m.id)}
              onReject={() => onReject(m.id)}
            />
          );
        }
        // Hide empty completed assistant bubbles (model returned only tool_call, no text)
        if (
          m.role === 'assistant' &&
          !m.streaming &&
          m.content.trim().length === 0
        ) {
          return null;
        }
        return (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            streaming={m.role === 'assistant' ? m.streaming : false}
          />
        );
      })}
    </div>
  );
}
