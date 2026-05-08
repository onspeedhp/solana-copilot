import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

type Props = {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
};

function ThinkingDots() {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label="Assistant is thinking"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" />
    </span>
  );
}

// Heavy markdown renderer extracted + memoized so it only re-runs when the
// content prop is referentially-different. During streaming we bypass this
// component entirely and render plain text instead — markdown parses an AST
// from scratch on every change which is far too slow for 60+ tokens/sec.
const MarkdownContent = memo(function MarkdownContent({
  content,
}: {
  content: string;
}) {
  // Memoize the components map so it isn't recreated each render.
  const components = useMemo(
    () => ({
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="m-0 mb-2 last:mb-0 whitespace-pre-wrap leading-[1.55]">
          {children}
        </p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="m-0 mb-2 last:mb-0 pl-4 list-disc space-y-0.5">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="m-0 mb-2 last:mb-0 pl-4 list-decimal space-y-0.5">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="leading-[1.5]">{children}</li>
      ),
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-white">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="italic text-white/85">{children}</em>
      ),
      code: ({ children }: { children?: React.ReactNode }) => (
        <code className="px-1.5 py-0.5 rounded-md bg-white/[0.07] font-mono text-[11px] text-[#a5d6a7] border border-white/[0.04]">
          {children}
        </code>
      ),
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="m-0 mb-2 last:mb-0 p-2.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] overflow-x-auto text-[11px] font-mono leading-[1.5]">
          {children}
        </pre>
      ),
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#a78bfa] hover:text-[#c4b5fd] underline decoration-[#a78bfa]/30 hover:decoration-[#a78bfa] underline-offset-2 transition-colors"
        >
          {children}
        </a>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-[15px] font-semibold m-0 mb-2 last:mb-0 text-white">
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-[14px] font-semibold m-0 mb-1.5 last:mb-0 text-white">
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-[13px] font-semibold m-0 mb-1 last:mb-0 text-white/95">
          {children}
        </h3>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="m-0 mb-2 last:mb-0 pl-3 border-l-2 border-white/15 text-white/70 italic">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-2 border-white/[0.08]" />,
    }),
    [],
  );

  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
});

function MessageBubbleImpl({ role, content, streaming }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-[fade-in_0.18s_ease-out]">
        <div className="max-w-[85%] bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-white text-[13px] px-3.5 py-2 rounded-2xl rounded-br-md whitespace-pre-wrap break-words [overflow-wrap:anywhere] shadow-sm shadow-[#7c3aed]/20 leading-[1.5]">
          {content}
        </div>
      </div>
    );
  }

  const empty = content.length === 0;
  const showThinking = streaming && empty;

  return (
    <div className="flex justify-start animate-[fade-in_0.18s_ease-out]">
      <div className="max-w-[92%] bg-[#1a1a1a] border border-white/[0.06] text-[13px] text-white/90 px-3.5 py-2.5 rounded-2xl rounded-bl-md leading-[1.55] min-h-[34px] shadow-sm">
        {showThinking ? (
          <div className="flex items-center h-[18px]">
            <ThinkingDots />
          </div>
        ) : streaming ? (
          // Plain text during streaming — far cheaper than re-parsing markdown
          // on every animation frame. Final text gets the full markdown pass
          // when streaming flips false.
          <div className="break-words [overflow-wrap:anywhere] w-full whitespace-pre-wrap">
            {content}
            <span
              className="inline-block w-[7px] h-[14px] ml-[2px] -mb-[1px] align-middle bg-white/70 rounded-[1px] animate-[blink_1s_steps(2,end)_infinite]"
              aria-hidden
            />
          </div>
        ) : (
          <div className="markdown-body break-words [overflow-wrap:anywhere] w-full">
            <MarkdownContent content={content} />
          </div>
        )}
      </div>
    </div>
  );
}

// Skip re-render of unchanged messages — only the streaming bubble (whose
// content keeps growing) re-renders on each frame.
export const MessageBubble = memo(
  MessageBubbleImpl,
  (prev, next) =>
    prev.role === next.role &&
    prev.content === next.content &&
    prev.streaming === next.streaming,
);
