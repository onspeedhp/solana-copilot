import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Terminal,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { formatToolResult } from '../../lib/tools/format';
import type { ActionStatus } from '../../types';
import { useTokenInfo } from '../hooks/useTokenInfo';

const TX_TOOLS = new Set(['sendSol', 'swapJupiter', 'signAndSendTx']);

function shortSig(sig: string, n = 8): string {
  if (sig.length <= n * 2 + 1) return sig;
  return `${sig.slice(0, n)}…${sig.slice(-n)}`;
}

function TokenChip({
  mint,
  amount,
}: {
  mint: string | undefined;
  amount: number | string | undefined;
}) {
  const info = useTokenInfo(mint);
  const [iconFailed, setIconFailed] = useState(false);
  const symbol = info?.symbol ?? (mint ? shortSig(mint, 4) : '?');
  const showIcon = info?.icon && !iconFailed;
  return (
    <div className="inline-flex items-center gap-1.5 bg-[#0a0a0a] border border-white/[0.06] rounded-[8px] px-2 py-1">
      {showIcon ? (
        <img
          src={info.icon ?? ''}
          alt=""
          className="w-4 h-4 rounded-full"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <div className="w-4 h-4 rounded-full bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center">
          <span className="text-[8px] text-[#7c3aed] uppercase font-medium">
            {symbol.charAt(0)}
          </span>
        </div>
      )}
      <span className="text-[12px] text-white/90 font-medium">{symbol}</span>
      {amount !== undefined && (
        <span className="text-[12px] text-white/60 font-mono">{amount}</span>
      )}
    </div>
  );
}

function SwapDoneBlock({
  result,
  args,
}: {
  result: unknown;
  args: Record<string, unknown>;
}) {
  const r = result as {
    signature?: string;
    explorer?: string;
    simulated?: boolean;
    inputMint?: string;
    outputMint?: string;
    amountIn?: number;
    amountOut?: number;
    priceImpactPct?: number;
    route?: string;
  };
  const inputMint = r.inputMint ?? (args.inputMint as string | undefined);
  const outputMint = r.outputMint ?? (args.outputMint as string | undefined);
  const amountIn = r.amountIn ?? (args.amountIn as number | undefined);
  const amountOut = r.amountOut;

  return (
    <div className="px-3 py-2.5 border-t border-white/[0.05] bg-[#141414] space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={14}
          className={r.simulated ? 'text-status-amber' : 'text-status-green'}
          strokeWidth={2}
        />
        <span className="text-[12px] text-white/90 font-medium">
          {r.simulated ? 'Simulated swap' : 'Swap confirmed'}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TokenChip mint={inputMint} amount={amountIn} />
        <ArrowRight size={12} strokeWidth={1.5} className="text-white/40" />
        <TokenChip
          mint={outputMint}
          amount={
            typeof amountOut === 'number'
              ? amountOut.toLocaleString(undefined, { maximumFractionDigits: 4 })
              : '?'
          }
        />
      </div>
      {r.route && (
        <div className="text-[10px] text-white/40">
          Route: {r.route}
          {typeof r.priceImpactPct === 'number' && r.priceImpactPct > 0 && (
            <> · Impact: {r.priceImpactPct.toFixed(3)}%</>
          )}
        </div>
      )}
      {r.signature && (
        <div
          className="text-[10px] font-mono text-white/35 truncate"
          title={r.signature}
        >
          {shortSig(r.signature)}
        </div>
      )}
      {r.explorer && !r.simulated && (
        <a
          href={r.explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#7c3aed] hover:text-[#9061f0] transition-colors duration-150"
        >
          View on Solscan
          <ExternalLink size={10} strokeWidth={1.75} />
        </a>
      )}
    </div>
  );
}

function TxDoneBlock({
  result,
}: {
  result: unknown;
}) {
  const r = result as {
    signature?: string;
    explorer?: string;
    simulated?: boolean;
  };
  return (
    <div className="px-3 py-2.5 border-t border-white/[0.05] bg-[#141414]">
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={14}
          className={r.simulated ? 'text-status-amber' : 'text-status-green'}
          strokeWidth={2}
        />
        <span className="text-[12px] text-white/90 font-medium">
          {r.simulated
            ? 'Simulated (no real transaction)'
            : 'Transaction confirmed'}
        </span>
      </div>
      {r.signature && (
        <div
          className="text-[10px] font-mono text-white/35 mt-1.5 truncate"
          title={r.signature}
        >
          {shortSig(r.signature)}
        </div>
      )}
      {r.explorer && !r.simulated && (
        <a
          href={r.explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#7c3aed] hover:text-[#9061f0] transition-colors duration-150"
        >
          View on Solscan
          <ExternalLink size={10} strokeWidth={1.75} />
        </a>
      )}
    </div>
  );
}

type Props = {
  id: string;
  tool: string;
  isWrite: boolean;
  args: Record<string, unknown>;
  intent: string;
  status: ActionStatus;
  result?: unknown;
  error?: string;
  onApprove?: () => void;
  onReject?: () => void;
};

function StatusBadge({ status }: { status: ActionStatus }) {
  switch (status) {
    case 'pending-confirm':
      return (
        <span className="text-[10px] uppercase tracking-wide text-status-amber">
          needs approval
        </span>
      );
    case 'executing':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#7c3aed]">
          <Loader2 size={10} className="animate-spin" /> running
        </span>
      );
    case 'done':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-status-green">
          <Check size={10} strokeWidth={2.5} /> done
        </span>
      );
    case 'rejected':
      return (
        <span className="text-[10px] uppercase tracking-wide text-white/40">
          rejected
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-status-red">
          <AlertCircle size={10} /> error
        </span>
      );
    case 'approved':
      return null;
  }
}

export function ConfirmActionCard({
  tool,
  isWrite,
  args,
  intent,
  status,
  result,
  error,
  onApprove,
  onReject,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const showActions = status === 'pending-confirm';
  const accent = isWrite ? '#f59e0b' : '#7c3aed';

  const formatted =
    status === 'done' ? formatToolResult(tool, result, args) : null;

  return (
    <div
      className="bg-[#1c1c1c] rounded-[6px] overflow-hidden"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal
            size={12}
            strokeWidth={1.5}
            className="text-white/40 flex-shrink-0"
          />
          <ArrowRight
            size={10}
            strokeWidth={1.5}
            className="text-white/30 flex-shrink-0"
          />
          <span className="text-[12px] text-white/90 truncate">{intent}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      {status === 'done' &&
        (tool === 'swapJupiter' ? (
          <SwapDoneBlock result={result} args={args} />
        ) : TX_TOOLS.has(tool) ? (
          <TxDoneBlock result={result} />
        ) : (
          <div className="px-3 py-2.5 border-t border-white/[0.05] bg-[#141414]">
            {formatted ? (
              <pre className="text-[12px] text-white/85 leading-relaxed whitespace-pre-wrap font-sans">
                {formatted}
              </pre>
            ) : (
              <pre className="text-[11px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2).slice(0, 600)}
              </pre>
            )}
            {formatted && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="mt-2 text-[10px] text-white/30 hover:text-white/60 transition-colors duration-150 flex items-center gap-1"
              >
                {showRaw ? (
                  <ChevronUp size={10} strokeWidth={1.5} />
                ) : (
                  <ChevronDown size={10} strokeWidth={1.5} />
                )}
                {showRaw ? 'hide raw' : 'raw response'}
              </button>
            )}
            {showRaw && formatted && (
              <pre className="mt-2 text-[10px] font-mono text-white/40 leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                {JSON.stringify(result, null, 2).slice(0, 1500)}
              </pre>
            )}
          </div>
        ))}

      {status === 'error' && (
        <div className="px-3 py-2 border-t border-white/[0.05] bg-[#141414]">
          <pre className="text-[11px] font-mono text-status-red leading-relaxed whitespace-pre-wrap break-all">
            {error}
          </pre>
        </div>
      )}

      {showActions && (
        <div className="px-3 py-2.5 border-t border-white/[0.05]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReject}
              className="flex-1 h-8 bg-transparent border border-white/[0.08] hover:border-white/[0.14] text-[12px] font-medium text-white/70 hover:text-white/90 rounded-[6px] transition-colors duration-150 flex items-center justify-center gap-1"
            >
              <X size={12} strokeWidth={2} /> Reject
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="flex-1 h-8 bg-[#7c3aed] hover:bg-[#6d28d9] text-[12px] font-medium text-white rounded-[6px] transition-colors duration-150 flex items-center justify-center gap-1"
            >
              <Check size={12} strokeWidth={2} /> Approve
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/30">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-px bg-white/[0.06] border border-white/[0.08] rounded text-[9px] font-mono">
                Esc
              </kbd>{' '}
              reject
            </span>
            <span className="inline-flex items-center gap-1">
              approve{' '}
              <kbd className="px-1 py-px bg-white/[0.06] border border-white/[0.08] rounded text-[9px] font-mono">
                ⌘
              </kbd>
              <kbd className="px-1 py-px bg-white/[0.06] border border-white/[0.08] rounded text-[9px] font-mono">
                ⏎
              </kbd>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
