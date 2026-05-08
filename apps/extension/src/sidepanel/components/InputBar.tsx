import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getAnthropicApiKey, getOAuthTokens } from '../../lib/storage';

const ENV_PROVIDER = (
  import.meta.env.VITE_LLM_PROVIDER ?? ''
).trim().toLowerCase();

const OLLAMA_MODEL = (
  import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:7b'
).trim();

const ANTHROPIC_MODEL = 'claude-sonnet-4-5';

type Props = {
  onSend?: (text: string) => void;
  disabled?: boolean;
};

type ProviderInfo = {
  label: string;
  source: 'cloud' | 'local' | 'preview';
  ok: boolean;
};

async function detectProvider(): Promise<ProviderInfo> {
  if (ENV_PROVIDER === 'ollama') {
    return { label: OLLAMA_MODEL, source: 'local', ok: true };
  }
  if (ENV_PROVIDER === 'mock') {
    return { label: 'mock', source: 'preview', ok: true };
  }
  const oauth = await getOAuthTokens();
  if (oauth) return { label: `${ANTHROPIC_MODEL} · max sub`, source: 'cloud', ok: true };
  const key = await getAnthropicApiKey();
  if (key) return { label: ANTHROPIC_MODEL, source: 'cloud', ok: true };
  return { label: 'mock', source: 'preview', ok: false };
}

export function InputBar({ onSend, disabled }: Props) {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void detectProvider().then(setProvider);
  }, []);

  const submit = () => {
    if (disabled) return;
    const target = textareaRef.current;
    if (!target) return;
    const value = target.value.trim();
    if (value) {
      onSend?.(value);
      target.value = '';
    }
  };

  // Detect side-panel vs popup mode via the same media query the global CSS
  // uses. Popup is fixed 400×600; side panel can be 700px+ tall and we want
  // to let the input box breathe more.
  const [isPanel, setIsPanel] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-height: 700px)');
    const onChange = () => setIsPanel(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const minH = isPanel ? 84 : 60;
  const maxH = isPanel ? 240 : 160;

  // Auto-grow textarea up to maxH as user types
  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
  };

  // Reset height when emptied (after submit)
  useEffect(() => {
    autosize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanel]);

  return (
    <div className="px-4 pt-2 pb-3 border-t border-white/[0.08] flex-shrink-0">
      <div className="relative mb-2">
        <textarea
          ref={textareaRef}
          placeholder={
            disabled
              ? 'Waiting for response…'
              : isPanel
                ? 'Ask anything — swap, post a tweet, check yields…'
                : 'Ask about your wallet…'
          }
          rows={isPanel ? 3 : 2}
          disabled={disabled}
          className="w-full bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed]/60 focus-within:bg-[#1a1a1a] focus:outline-none resize-none rounded-2xl pl-3.5 pr-12 py-2.5 text-[13px] text-white placeholder:text-white/35 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed leading-[1.55] shadow-inner shadow-black/20"
          style={{
            fontFamily: 'inherit',
            minHeight: minH,
            maxHeight: maxH,
          }}
          onInput={autosize}
          onKeyDown={(e) => {
            // IME composition guard for Vietnamese/Chinese/Japanese keyboards:
            // Enter during composition fires extra events; skip them so we
            // don't double-submit.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
              // Reset height after clear
              requestAnimationFrame(autosize);
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            submit();
            requestAnimationFrame(autosize);
          }}
          disabled={disabled}
          className="absolute right-2 bottom-2 w-8 h-8 bg-[#7c3aed] hover:bg-[#6d28d9] active:scale-95 disabled:bg-[#7c3aed]/30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all duration-150 flex-shrink-0 shadow-md shadow-[#7c3aed]/20"
          aria-label="Send"
        >
          <Send size={13} strokeWidth={2.2} className="text-white" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/40">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            !provider
              ? 'bg-white/20'
              : provider.ok
                ? 'bg-status-green'
                : 'bg-status-amber'
          }`}
        />
        <span className="font-mono truncate max-w-[200px]">
          {provider?.label ?? '…'}
        </span>
        <span className="text-white/20">·</span>
        <span>{provider?.source ?? '…'}</span>
        <span className="ml-auto text-white/25 hidden sm:inline">
          <kbd className="px-1 py-px bg-white/[0.04] border border-white/[0.06] rounded text-[10px] font-mono">
            ⏎
          </kbd>{' '}
          send ·{' '}
          <kbd className="px-1 py-px bg-white/[0.04] border border-white/[0.06] rounded text-[10px] font-mono">
            ⇧⏎
          </kbd>{' '}
          new line
        </span>
      </div>
    </div>
  );
}
