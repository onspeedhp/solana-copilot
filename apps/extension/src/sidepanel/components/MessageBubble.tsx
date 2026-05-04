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

export function MessageBubble({ role, content, streaming }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[#7c3aed] text-white text-[13px] px-3 py-2 rounded-[10px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {content}
        </div>
      </div>
    );
  }

  const empty = content.length === 0;
  const showThinking = streaming && empty;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-[#161616] border border-white/[0.08] text-[13px] text-white/90 px-3 py-2 rounded-[10px] leading-relaxed min-h-[34px] flex items-center">
        {showThinking ? (
          <ThinkingDots />
        ) : (
          <div className="markdown-body break-words [overflow-wrap:anywhere] w-full">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="m-0 mb-2 last:mb-0 whitespace-pre-wrap">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="m-0 mb-2 last:mb-0 pl-4 list-disc">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="m-0 mb-2 last:mb-0 pl-4 list-decimal">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                strong: ({ children }) => (
                  <strong className="font-medium text-white">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-white/85">{children}</em>
                ),
                code: ({ children }) => (
                  <code className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-[11px] text-[#86efac]">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="m-0 mb-2 last:mb-0 p-2 rounded bg-[#0a0a0a] border border-white/[0.05] overflow-x-auto text-[11px] font-mono">
                    {children}
                  </pre>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#7c3aed] hover:text-[#9061f0] underline"
                  >
                    {children}
                  </a>
                ),
                h1: ({ children }) => (
                  <h1 className="text-[14px] font-medium m-0 mb-1.5 last:mb-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-[13px] font-medium m-0 mb-1.5 last:mb-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-[13px] font-medium m-0 mb-1 last:mb-0">
                    {children}
                  </h3>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
            {streaming && (
              <span
                className="inline-block w-1 h-3 ml-0.5 align-middle bg-white/60 animate-pulse"
                aria-hidden
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
