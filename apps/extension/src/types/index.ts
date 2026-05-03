export type ToolKind =
  | 'getBalance'
  | 'getTokenAccounts'
  | 'getRecentTransactions'
  | 'sendSol'
  | 'swapJupiter'
  | 'getPageContext'
  | 'getDefiYields'
  | 'httpGet'
  | 'httpPost'
  | 'signAndSendTx'
  | 'pageAction'
  | 'scrollPage'
  | 'extractTweets'
  | 'navigateTab'
  | 'xPostTweet'
  | 'xLikeTweet'
  | 'xReplyTweet'
  | 'xRetweetTweet'
  | 'xExtractCurrentTweet'
  | 'jupiterSwapBySymbol';

export type ActionStatus =
  | 'pending-confirm'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'done'
  | 'error';

export type ToolKindMeta = {
  kind: ToolKind;
  label: string;
  isWrite: boolean;
};

export type Message =
  | { id: string; role: 'user'; content: string; ts: number }
  | {
      id: string;
      role: 'assistant';
      content: string;
      ts: number;
      streaming?: boolean;
    }
  | {
      id: string;
      role: 'action';
      ts: number;
      intent: string;
      tool: string;
      isWrite: boolean;
      args: Record<string, unknown>;
      status: ActionStatus;
      result?: unknown;
      error?: string;
    };

export type TabInfo = {
  url: string | undefined;
  favIconUrl: string | undefined;
  title: string | undefined;
};

export type AppState =
  | { kind: 'no-wallet' }
  | {
      kind: 'ready';
      pubkey: string;
      currentUrl: string | undefined;
      currentFavIcon: string | undefined;
      currentTitle: string | undefined;
      discoveredLlmsTxt: string | null;
      messages: Message[];
    }
  | { kind: 'error'; reason: string };
