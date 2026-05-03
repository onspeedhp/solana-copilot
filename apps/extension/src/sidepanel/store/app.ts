import { create } from 'zustand';
import {
  getMessages,
  setMessages as persistMessages,
} from '../../lib/storage';
import { loadWallet } from '../../lib/wallet';
import type { ActionStatus, AppState, Message } from '../../types';

const MESSAGES_KEY_DOMAIN = 'wallet';

type State = {
  state: AppState;
  hydrated: boolean;
};

type Actions = {
  hydrate(): Promise<void>;
  reloadWallet(): Promise<void>;
  setCurrentTab(
    url: string | undefined,
    favIconUrl: string | undefined,
    title: string | undefined,
  ): void;
  setDiscoveredLlmsTxt(content: string | null): void;
  setError(reason: string): void;
  appendMessage(m: Message): void;
  patchAction(
    id: string,
    patch: { status?: ActionStatus; result?: unknown; error?: string },
  ): void;
  patchAssistant(
    id: string,
    patch: { content?: string; streaming?: boolean },
  ): void;
  clearMessages(): Promise<void>;
};

export type AppStore = State & Actions;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessages: Message[] | null = null;
const PERSIST_DEBOUNCE_MS = 300;

function persistCurrentMessages(messages: Message[]): void {
  pendingMessages = messages;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    const toPersist = pendingMessages;
    persistTimer = null;
    pendingMessages = null;
    if (toPersist) {
      void persistMessages(MESSAGES_KEY_DOMAIN, toPersist);
    }
  }, PERSIST_DEBOUNCE_MS);
}

async function persistMessagesImmediate(messages: Message[]): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    pendingMessages = null;
  }
  await persistMessages(MESSAGES_KEY_DOMAIN, messages);
}

function recoverStaleStates(messages: Message[]): Message[] {
  let dirty = false;
  const next = messages.map((m): Message => {
    if (m.role === 'assistant' && m.streaming) {
      dirty = true;
      return {
        ...m,
        streaming: false,
        content: m.content.length > 0 ? m.content : '[interrupted — popup was closed]',
      };
    }
    if (m.role === 'action' && m.status === 'executing') {
      dirty = true;
      return { ...m, status: 'error', error: 'Interrupted (popup was closed)' };
    }
    return m;
  });
  if (dirty) {
    void persistMessages(MESSAGES_KEY_DOMAIN, next);
  }
  return next;
}

export const useApp = create<AppStore>()((set, get) => ({
  state: { kind: 'no-wallet' },
  hydrated: false,

  async hydrate() {
    const wallet = await loadWallet();
    if (!wallet) {
      set({ state: { kind: 'no-wallet' }, hydrated: true });
      return;
    }
    const raw = await getMessages(MESSAGES_KEY_DOMAIN);
    const messages = recoverStaleStates(raw);
    set({
      state: {
        kind: 'ready',
        pubkey: wallet.pubkey,
        currentUrl: undefined,
        currentFavIcon: undefined,
        currentTitle: undefined,
        discoveredLlmsTxt: null,
        messages,
      },
      hydrated: true,
    });
  },

  async reloadWallet() {
    const wallet = await loadWallet();
    if (!wallet) {
      set({ state: { kind: 'no-wallet' } });
      return;
    }
    const s = get().state;
    const rawMessages =
      s.kind === 'ready' ? s.messages : await getMessages(MESSAGES_KEY_DOMAIN);
    const existingMessages = recoverStaleStates(rawMessages);
    const currentUrl = s.kind === 'ready' ? s.currentUrl : undefined;
    const currentFavIcon = s.kind === 'ready' ? s.currentFavIcon : undefined;
    const currentTitle = s.kind === 'ready' ? s.currentTitle : undefined;
    const discoveredLlmsTxt =
      s.kind === 'ready' ? s.discoveredLlmsTxt : null;
    set({
      state: {
        kind: 'ready',
        pubkey: wallet.pubkey,
        currentUrl,
        currentFavIcon,
        currentTitle,
        discoveredLlmsTxt,
        messages: existingMessages,
      },
    });
  },

  setCurrentTab(url, favIconUrl, title) {
    const s = get().state;
    if (s.kind !== 'ready') return;
    if (
      s.currentUrl === url &&
      s.currentFavIcon === favIconUrl &&
      s.currentTitle === title
    ) {
      return;
    }
    const urlChanged = s.currentUrl !== url;
    set({
      state: {
        ...s,
        currentUrl: url,
        currentFavIcon: favIconUrl,
        currentTitle: title,
        ...(urlChanged ? { discoveredLlmsTxt: null } : {}),
      },
    });
  },

  setDiscoveredLlmsTxt(content) {
    const s = get().state;
    if (s.kind !== 'ready') return;
    set({
      state: { ...s, discoveredLlmsTxt: content },
    });
  },

  setError(reason) {
    set({ state: { kind: 'error', reason } });
  },

  appendMessage(m) {
    const s = get().state;
    if (s.kind !== 'ready') return;
    const next = [...s.messages, m];
    set({ state: { ...s, messages: next } });
    persistCurrentMessages(next);
  },

  patchAction(id, patch) {
    const s = get().state;
    if (s.kind !== 'ready') return;
    const next = s.messages.map((m): Message => {
      if (m.id !== id || m.role !== 'action') return m;
      return {
        ...m,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.result !== undefined ? { result: patch.result } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      };
    });
    set({ state: { ...s, messages: next } });
    persistCurrentMessages(next);
  },

  patchAssistant(id, patch) {
    const s = get().state;
    if (s.kind !== 'ready') return;
    const next = s.messages.map((m): Message => {
      if (m.id !== id || m.role !== 'assistant') return m;
      return {
        ...m,
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.streaming !== undefined
          ? { streaming: patch.streaming }
          : {}),
      };
    });
    set({ state: { ...s, messages: next } });
    persistCurrentMessages(next);
  },

  async clearMessages() {
    const s = get().state;
    if (s.kind !== 'ready') return;
    set({ state: { ...s, messages: [] } });
    await persistMessagesImmediate([]);
  },
}));
