import { AlertCircle, Copy, RefreshCw } from 'lucide-react';

type Props = {
  title?: string;
  detail?: string;
  command?: string;
  onRetry?: () => void;
  onCopy?: () => void;
};

export function ErrorCard({
  title = 'Local LLM unreachable',
  detail = 'Make sure Ollama is running on port 11434',
  command = 'ollama serve',
  onRetry,
  onCopy,
}: Props) {
  return (
    <div className="w-full max-w-[340px] bg-[#161616] border border-white/[0.08] rounded-[10px] p-4 flex flex-col items-center text-center">
      <AlertCircle
        size={24}
        strokeWidth={1.5}
        style={{ color: '#ef4444' }}
        className="mb-3"
      />
      <h2 className="text-[14px] font-medium text-white/90 mb-1 tracking-tight">
        {title}
      </h2>
      <p className="text-[12px] text-white/60 mb-4 max-w-[240px]">{detail}</p>
      <div className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[6px] px-3 py-2 mb-4 flex items-center justify-between">
        <code className="text-[12px] font-mono" style={{ color: '#7c3aed' }}>
          {command}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="text-white/40 hover:text-white/80 transition-colors duration-150 flex-shrink-0 ml-2"
          aria-label="Copy"
        >
          <Copy size={12} strokeWidth={1.5} />
        </button>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="w-full h-8 bg-transparent border border-white/[0.08] hover:border-white/[0.14] text-[13px] font-medium text-white/90 rounded-[6px] transition-colors duration-150 flex items-center justify-center gap-1.5"
      >
        <RefreshCw size={12} strokeWidth={1.5} />
        Retry
      </button>
    </div>
  );
}
