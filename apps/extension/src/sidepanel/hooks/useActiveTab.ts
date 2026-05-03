import { useEffect } from 'react';
import { useApp } from '../store/app';

type TabChangedMessage = {
  type: 'TAB_CHANGED';
  url?: string;
  favIconUrl?: string;
  title?: string;
};

function isTabChanged(msg: unknown): msg is TabChangedMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as { type?: unknown }).type === 'TAB_CHANGED'
  );
}

export function useActiveTab(): void {
  const setCurrentTab = useApp((s) => s.setCurrentTab);
  const hydrated = useApp((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    let mounted = true;

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (!mounted) return;
        const tab = tabs[0];
        setCurrentTab(tab?.url, tab?.favIconUrl, tab?.title);
      })
      .catch((err) => {
        console.error('[useActiveTab] initial query failed', err);
      });

    const handler = (msg: unknown) => {
      if (isTabChanged(msg)) {
        setCurrentTab(msg.url, msg.favIconUrl, msg.title);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      mounted = false;
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [setCurrentTab, hydrated]);
}
