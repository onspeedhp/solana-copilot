import { useState } from 'react';
import {
  Settings, Send, Check, X, ChevronDown, ChevronUp,
  AlertCircle, Terminal, Copy, RefreshCw,
  Search, TrendingUp, DollarSign, Loader2
} from 'lucide-react';

const STATES = [
  { id: 'empty', label: 'Empty' },
  { id: 'loading', label: 'Loading' },
  { id: 'permission', label: 'Permission' },
  { id: 'chat-idle', label: 'Chat idle' },
  { id: 'chat-active', label: 'Chat active' },
  { id: 'tool-executing', label: 'Tool executing' },
  { id: 'error', label: 'Error' },
];

// ─── Header ─────────────────────────────────────────────────────────────

function StatusDot({ color }) {
  if (color === 'none') return null;
  const colorMap = {
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
  };
  const animated = color === 'amber' || color === 'red';
  return (
    <div
      className={`w-1.5 h-1.5 rounded-full ${animated ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: colorMap[color] }}
    />
  );
}

function Header({ state }) {
  const config = {
    'empty': { dot: 'none', text: '' },
    'loading': { dot: 'amber', text: 'jupiter.ag' },
    'permission': { dot: 'amber', text: 'jupiter.ag' },
    'chat-idle': { dot: 'green', text: 'jupiter.ag · Connected' },
    'chat-active': { dot: 'green', text: 'jupiter.ag · Connected' },
    'tool-executing': { dot: 'green', text: 'jupiter.ag · Connected' },
    'error': { dot: 'red', text: 'Ollama not running' },
  }[state];

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-white/[0.08] flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot color={config.dot} />
        <span className="text-[13px] text-white/90 truncate">{config.text}</span>
      </div>
      <button
        className="text-white/60 hover:text-white/90 transition-colors duration-150 p-1 -mr-1"
        aria-label="Settings"
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </header>
  );
}

// ─── Empty ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-20 h-20 rounded-full border border-white/[0.08] mb-6" />
      <h2 className="text-[14px] font-medium text-white/90 mb-1.5 tracking-tight">
        No skills available on this site
      </h2>
      <p className="text-[12px] text-white/60 text-center mb-4 max-w-[260px]">
        Visit a supported site like jupiter.ag to start
      </p>
      <a
        href="#"
        className="text-[12px] text-[#7c3aed] hover:text-[#9061f0] transition-colors duration-150"
      >
        See compatible sites
      </a>
    </div>
  );
}

// ─── Loading ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-[340px] bg-[#161616] border border-white/[0.08] rounded-[10px] p-4">
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-white/[0.06] animate-pulse" />
          <div className="w-20 h-3 bg-white/[0.06] rounded animate-pulse" />
        </div>
        <div className="w-3/4 h-4 bg-white/[0.06] rounded mx-auto mb-4 animate-pulse" />
        <div className="space-y-2 mb-4">
          <div className="w-full h-3 bg-white/[0.06] rounded animate-pulse" />
          <div className="w-5/6 h-3 bg-white/[0.06] rounded animate-pulse" />
          <div className="w-4/5 h-3 bg-white/[0.06] rounded animate-pulse" />
          <div className="w-3/4 h-3 bg-white/[0.06] rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="w-full h-9 bg-white/[0.06] rounded-[12px] animate-pulse" />
          <div className="w-full h-9 bg-white/[0.04] rounded-[10px] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Permission ─────────────────────────────────────────────────────────

function PermissionState() {
  const [trusted, setTrusted] = useState(false);
  const skills = [
    'Search tokens and prices',
    'View prediction markets',
    'Get swap quotes',
    'Read portfolio positions',
  ];

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-[340px] bg-[#161616] border border-white/[0.08] rounded-[10px] p-4">
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#7c3aed] flex items-center justify-center">
            <span className="text-white text-[13px] font-medium">J</span>
          </div>
          <span className="text-[14px] font-medium text-white/90">jupiter.ag</span>
        </div>

        <h2 className="text-[15px] font-medium text-white text-center mb-4 tracking-tight">
          This site offers AI skills
        </h2>

        <ul className="space-y-2 mb-4">
          {skills.map((skill) => (
            <li key={skill} className="flex items-start gap-2 text-[13px] text-white/80">
              <span className="text-white/30 mt-0.5 flex-shrink-0">·</span>
              <span>{skill}</span>
            </li>
          ))}
        </ul>

        <p className="text-[12px] text-white/60 text-center mb-4 leading-relaxed">
          Skills load into your local LLM. Nothing leaves your machine.
        </p>

        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <div
            className="w-3.5 h-3.5 rounded-[3px] flex items-center justify-center transition-colors duration-150 flex-shrink-0"
            style={{
              backgroundColor: trusted ? '#7c3aed' : 'transparent',
              border: `1px solid ${trusted ? '#7c3aed' : 'rgba(255,255,255,0.2)'}`,
            }}
          >
            {trusted && <Check size={10} strokeWidth={2.5} className="text-white" />}
          </div>
          <input
            type="checkbox"
            checked={trusted}
            onChange={(e) => setTrusted(e.target.checked)}
            className="sr-only"
          />
          <span className="text-[12px] text-white/70">Always trust this site</span>
        </label>

        <div className="space-y-2">
          <button className="w-full h-9 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[13px] font-medium rounded-[12px] transition-colors duration-150">
            Connect
          </button>
          <button className="w-full h-9 text-white/60 hover:text-white/90 text-[13px] font-medium rounded-[10px] transition-colors duration-150">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat idle ──────────────────────────────────────────────────────────

function ChatIdleState() {
  const suggestions = [
    { icon: Search, text: 'Find token JUP' },
    { icon: TrendingUp, text: 'Top movers today' },
    { icon: DollarSign, text: "What's SOL price" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <p className="text-[13px] text-white/40 mb-4">
        Ask anything about jupiter.ag
      </p>
      <div className="w-full max-w-[280px] space-y-1.5">
        {suggestions.map(({ icon: Icon, text }) => (
          <button
            key={text}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-[#161616] border border-white/[0.08] hover:border-white/[0.14] rounded-[6px] text-[12px] text-white/80 transition-colors duration-150 text-left"
          >
            <Icon size={14} strokeWidth={1.5} className="text-white/40 flex-shrink-0" />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tool call card ─────────────────────────────────────────────────────

function ToolCallCard({ status = 'success', defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isPending = status === 'pending';

  return (
    <div
      className="bg-[#1c1c1c] rounded-[6px] overflow-hidden"
      style={{ borderLeft: '2px solid #7c3aed' }}
    >
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal size={12} strokeWidth={1.5} className="text-white/40 flex-shrink-0" />
          <span className="text-[12px] font-mono text-white/90 flex-shrink-0">http_get</span>
          {isPending ? (
            <span className="text-[11px] font-mono text-white/60 truncate">
              Fetching from api.jup.ag...
            </span>
          ) : (
            <span className="text-[11px] font-mono text-white/60 truncate">
              api.jup.ag/tokens/v2/...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPending && (
            <Loader2 size={12} strokeWidth={1.5} className="text-[#7c3aed] animate-spin" />
          )}
          {status === 'success' && (
            <Check size={12} strokeWidth={2} style={{ color: '#10b981' }} />
          )}
          {status === 'error' && (
            <X size={12} strokeWidth={2} style={{ color: '#ef4444' }} />
          )}
          {!isPending && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-white/40 hover:text-white/80 transition-colors duration-150"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded
                ? <ChevronUp size={12} strokeWidth={1.5} />
                : <ChevronDown size={12} strokeWidth={1.5} />}
            </button>
          )}
          {isPending && (
            <ChevronDown size={12} strokeWidth={1.5} className="text-white/20" />
          )}
        </div>
      </div>

      {expanded && !isPending && (
        <div className="px-3 py-2 border-t border-white/[0.05] bg-[#141414] overflow-x-auto">
          <pre className="text-[11px] font-mono leading-relaxed">
            <span style={{ color: '#7c3aed' }}>{'{'}</span>{'\n'}
            {'  '}<span style={{ color: '#7c3aed' }}>"status"</span>: <span style={{ color: '#86efac' }}>"success"</span>,{'\n'}
            {'  '}<span style={{ color: '#7c3aed' }}>"data"</span>: [{'\n'}
            {'    '}{'{'}{'\n'}
            {'      '}<span style={{ color: '#7c3aed' }}>"symbol"</span>: <span style={{ color: '#86efac' }}>"JUP"</span>,{'\n'}
            {'      '}<span style={{ color: '#7c3aed' }}>"change"</span>: <span style={{ color: '#fbbf24' }}>12.3</span>{'\n'}
            {'    '}{'}'},{'\n'}
            {'    '}{'{'}{'\n'}
            {'      '}<span style={{ color: '#7c3aed' }}>"symbol"</span>: <span style={{ color: '#86efac' }}>"BONK"</span>,{'\n'}
            {'      '}<span style={{ color: '#7c3aed' }}>"change"</span>: <span style={{ color: '#fbbf24' }}>8.7</span>{'\n'}
            {'    '}{'}'}{'\n'}
            {'  '}]{'\n'}
            <span style={{ color: '#7c3aed' }}>{'}'}</span>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Chat active ────────────────────────────────────────────────────────

function ChatActiveState() {
  return (
    <div className="flex-1 px-4 py-4 overflow-y-auto space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[#7c3aed] text-white text-[13px] px-3 py-2 rounded-[10px]">
          find top movers today
        </div>
      </div>

      <ToolCallCard status="success" defaultExpanded={true} />

      <div className="flex justify-start">
        <div className="max-w-[90%] bg-[#161616] border border-white/[0.08] text-[13px] text-white/90 px-3 py-2 rounded-[10px] leading-relaxed">
          Here are the top movers in the last 24h: JUP +12.3%, BONK +8.7%. The market shows strong momentum in the Solana ecosystem.
        </div>
      </div>
    </div>
  );
}

// ─── Tool executing ─────────────────────────────────────────────────────

function ToolExecutingState() {
  return (
    <div className="flex-1 px-4 py-4 overflow-y-auto space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[#7c3aed] text-white text-[13px] px-3 py-2 rounded-[10px]">
          find top movers today
        </div>
      </div>
      <ToolCallCard status="pending" defaultExpanded={false} />
    </div>
  );
}

// ─── Error ──────────────────────────────────────────────────────────────

function ErrorState() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-[340px] bg-[#161616] border border-white/[0.08] rounded-[10px] p-4 flex flex-col items-center text-center">
        <AlertCircle size={24} strokeWidth={1.5} style={{ color: '#ef4444' }} className="mb-3" />
        <h2 className="text-[14px] font-medium text-white/90 mb-1 tracking-tight">
          Local LLM unreachable
        </h2>
        <p className="text-[12px] text-white/60 mb-4 max-w-[240px]">
          Make sure Ollama is running on port 11434
        </p>
        <div className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[6px] px-3 py-2 mb-4 flex items-center justify-between">
          <code className="text-[12px] font-mono" style={{ color: '#7c3aed' }}>
            ollama serve
          </code>
          <button
            className="text-white/40 hover:text-white/80 transition-colors duration-150 flex-shrink-0 ml-2"
            aria-label="Copy"
          >
            <Copy size={12} strokeWidth={1.5} />
          </button>
        </div>
        <button className="w-full h-8 bg-transparent border border-white/[0.08] hover:border-white/[0.14] text-[13px] font-medium text-white/90 rounded-[6px] transition-colors duration-150 flex items-center justify-center gap-1.5">
          <RefreshCw size={12} strokeWidth={1.5} />
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── Input bar ──────────────────────────────────────────────────────────

function InputBar() {
  return (
    <div className="px-4 pt-3 pb-3 border-t border-white/[0.08] flex-shrink-0">
      <div className="flex gap-2 items-end mb-2">
        <textarea
          placeholder="Type a message..."
          rows={1}
          className="flex-1 bg-[#161616] border border-white/[0.08] focus:border-[#7c3aed] focus:outline-none resize-none rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-white/40 transition-colors duration-150 min-h-[36px] max-h-[120px]"
          style={{ fontFamily: 'inherit' }}
        />
        <button
          className="w-9 h-9 bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[10px] flex items-center justify-center transition-colors duration-150 flex-shrink-0"
          aria-label="Send"
        >
          <Send size={14} strokeWidth={2} className="text-white" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/40">
        <Check size={10} strokeWidth={2} />
        <span>12 skills loaded</span>
        <span className="text-white/20">·</span>
        <span className="font-mono">qwen2.5:7b</span>
        <span className="text-white/20">·</span>
        <span>local</span>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState('chat-active');

  const showInputBar = ['chat-idle', 'chat-active', 'tool-executing'].includes(state);

  const renderBody = () => {
    switch (state) {
      case 'empty': return <EmptyState />;
      case 'loading': return <LoadingState />;
      case 'permission': return <PermissionState />;
      case 'chat-idle': return <ChatIdleState />;
      case 'chat-active': return <ChatActiveState />;
      case 'tool-executing': return <ToolExecutingState />;
      case 'error': return <ErrorState />;
      default: return null;
    }
  };

  return (
    <div
      className="min-h-screen bg-zinc-950 p-6 flex flex-col items-center"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
    >
      {/* Dev state switcher */}
      <div className="mb-6 flex flex-wrap gap-1 bg-zinc-900 p-1 rounded-[6px] border border-white/[0.06]">
        {STATES.map((s) => (
          <button
            key={s.id}
            onClick={() => setState(s.id)}
            className={`px-2.5 py-1.5 text-[11px] rounded-[4px] transition-colors duration-150 ${
              state === s.id
                ? 'bg-[#7c3aed] text-white'
                : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Sidepanel mockup */}
      <div
        className="w-[400px] h-[800px] bg-[#0a0a0a] flex flex-col text-white border border-white/[0.06] rounded-[6px] overflow-hidden"
        style={{ fontFamily: 'inherit' }}
      >
        <Header state={state} />
        {renderBody()}
        {showInputBar && <InputBar />}
      </div>

      <p className="mt-4 text-[11px] text-white/30 text-center max-w-md">
        400×800 sidepanel mockup · click states above to switch
      </p>
    </div>
  );
}
