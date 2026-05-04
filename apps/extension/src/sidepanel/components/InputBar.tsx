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

  return (
    <div className="px-4 pt-3 pb-3 border-t border-white/[0.08] flex-shrink-0">
      <div className="flex gap-2 items-end mb-2">
        <textarea
          ref={textareaRef}
          placeholder={
            disabled ? 'Waiting for response…' : 'Ask about your wallet...'
          }
          rows={1}
          disabled={disabled}
          className="flex-1 bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed] focus:outline-none resize-none rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-white/40 transition-colors duration-150 min-h-[36px] max-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'inherit' }}
          onKeyDown={(e) => {
            // IME composition guard: when using Vietnamese/Chinese/Japanese
            // input methods, pressing Enter during composition fires Enter
            // events that we must ignore — otherwise submit fires twice.
            // Check both `isComposing` (modern) and keyCode 229 (legacy IME).
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="w-9 h-9 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-[#7c3aed]/40 disabled:cursor-not-allowed rounded-[10px] flex items-center justify-center transition-colors duration-150 flex-shrink-0"
          aria-label="Send"
        >
          <Send size={14} strokeWidth={2} className="text-white" />
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
      </div>
    </div>
  );
}
