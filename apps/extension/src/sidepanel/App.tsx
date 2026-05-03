import { useEffect, useState } from 'react';
import { getIntegrationForUrl } from '../lib/skills';
import { ErrorCard } from './components/ErrorCard';
import { Header } from './components/Header';
import { InputBar } from './components/InputBar';
import { LoadingState } from './components/LoadingState';
import { SettingsPanel } from './components/SettingsPanel';
import { useActiveTab } from './hooks/useActiveTab';
import { useChat } from './hooks/useChat';
import { useLlmsDiscovery } from './hooks/useLlmsDiscovery';
import { useApp } from './store/app';
import { HomeView } from './views/HomeView';
import { NoWalletView } from './views/NoWalletView';

export function App() {
  const state = useApp((s) => s.state);
  const hydrated = useApp((s) => s.hydrated);
  const hydrate = useApp((s) => s.hydrate);
  const reloadWallet = useApp((s) => s.reloadWallet);
  const clearMessages = useApp((s) => s.clearMessages);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useActiveTab();
  useLlmsDiscovery();
  const { send, approveAction, rejectAction } = useChat();

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Find the most recent action that's awaiting user approval
  const pendingActionId =
    state.kind === 'ready'
      ? (() => {
          for (let i = state.messages.length - 1; i >= 0; i--) {
            const m = state.messages[i];
            if (m && m.role === 'action' && m.status === 'pending-confirm') {
              return m.id;
            }
          }
          return null;
        })()
      : null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // Cmd+Enter (or Ctrl+Enter) → approve pending action
      if (isMod && e.key === 'Enter' && pendingActionId) {
        e.preventDefault();
        void approveAction(pendingActionId);
        return;
      }

      // Cmd+K / Ctrl+K → clear chat
      if (isMod && e.key.toLowerCase() === 'k' && !inEditable) {
        e.preventDefault();
        void clearMessages();
        return;
      }

      // Esc → reject pending action first, else close settings panel
      if (e.key === 'Escape') {
        if (pendingActionId) {
          rejectAction(pendingActionId);
        } else {
          setSettingsOpen(false);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearMessages, pendingActionId, approveAction, rejectAction]);

  if (!hydrated) {
    return (
      <div className="h-screen flex flex-col bg-bg text-white">
        <Header dot="amber" label="Loading…" />
        <LoadingState />
      </div>
    );
  }

  const isStreaming =
    state.kind === 'ready' &&
    state.messages.some(
      (m) =>
        (m.role === 'assistant' && m.streaming === true) ||
        (m.role === 'action' && m.status === 'executing'),
    );

  let body: React.ReactNode;
  let dot: 'green' | 'amber' | 'red' | 'none' = 'none';
  let label = 'Solana Copilot';
  let showInput = false;

  switch (state.kind) {
    case 'no-wallet':
      dot = 'amber';
      label = 'No wallet';
      body = <NoWalletView onOpenSettings={() => setSettingsOpen(true)} />;
      break;
    case 'ready': {
      const integration = getIntegrationForUrl(state.currentUrl);
      dot = 'green';
      label = integration ? `Solana · ${integration.name}` : 'Solana Copilot';
      showInput = true;
      body = (
        <HomeView
          pubkey={state.pubkey}
          currentUrl={state.currentUrl}
          currentFavIcon={state.currentFavIcon}
          currentTitle={state.currentTitle}
          messages={state.messages}
          isStreaming={isStreaming}
          onSuggestionClick={(t) => void send(t)}
          onApproveAction={(id) => void approveAction(id)}
          onRejectAction={rejectAction}
          onClearChat={() => void clearMessages()}
        />
      );
      break;
    }
    case 'error':
      dot = 'red';
      label = 'Error';
      body = (
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorCard
            title="Something went wrong"
            detail={state.reason}
            onRetry={() => {
              void reloadWallet();
            }}
          />
        </div>
      );
      break;
  }

  return (
    <div className="relative h-screen flex flex-col bg-bg text-white">
      <Header
        dot={dot}
        label={label}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      {body}
      {showInput && (
        <InputBar
          onSend={(t) => void send(t)}
          disabled={isStreaming}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            setSettingsOpen(false);
            void reloadWallet();
          }}
        />
      )}
    </div>
  );
}
