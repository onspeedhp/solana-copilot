import type { Keypair } from '@solana/web3.js';
import { explorerUrlFor, getRpcConfig, isMainnetWrite } from '../wallet-config';

const JUP_SWAP_API = 'https://lite-api.jup.ag/swap/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const KNOWN_DECIMALS: Record<string, number> = {
  [SOL_MINT]: 9,
  [USDC_MINT]: 6,
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6, // USDT
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6, // JUP
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5, // BONK
};

function decimalsForMint(mint: string): number {
  return KNOWN_DECIMALS[mint] ?? 6;
}

export type SendSolArgs = {
  to: string;
  amount: number;
};

export type SwapArgs = {
  inputMint?: string;
  outputMint: string;
  amountIn: number;
  slippageBps?: number;
};

export type TxResult = {
  signature: string;
  explorer: string;
};

export type SwapTxResult = TxResult & {
  inputMint: string;
  outputMint: string;
  amountIn: number;
  amountOut: number;
  priceImpactPct: number;
  route: string;
};

export async function sendSolTxn(
  args: SendSolArgs,
  keypair: Keypair,
): Promise<TxResult> {
  const rpc = await getRpcConfig();
  const {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
  } = await import('@solana/web3.js');
  const connection = new Connection(rpc.write, 'confirmed');
  const toPubkey = new PublicKey(args.to);
  const lamports = Math.floor(args.amount * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error('Invalid amount');
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('finalized');
  const tx = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: keypair.publicKey,
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey,
      lamports,
    }),
  );
  tx.sign(keypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  return {
    signature: sig,
    explorer: explorerUrlFor(sig, rpc),
  };
}

export async function signAndSendVersionedTx(
  base64Tx: string,
  keypair: Keypair,
): Promise<TxResult> {
  const rpc = await getRpcConfig();
  const { Connection, VersionedTransaction } = await import('@solana/web3.js');
  const txBuf = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  const connection = new Connection(rpc.write, 'confirmed');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  return {
    signature: sig,
    explorer: explorerUrlFor(sig, rpc),
  };
}

export async function jupiterSwapTxn(
  args: SwapArgs,
  keypair: Keypair,
): Promise<SwapTxResult> {
  const rpc = await getRpcConfig();
  if (!isMainnetWrite(rpc)) {
    throw new Error(
      'Jupiter swap requires mainnet (current write RPC is devnet/testnet). Switch cluster to Mainnet in Settings to swap.',
    );
  }
  const inputMint = args.inputMint ?? SOL_MINT;
  const outputMint = args.outputMint;
  const slippage = args.slippageBps ?? 50;
  const inDecimals = decimalsForMint(inputMint);
  const outDecimals = decimalsForMint(outputMint);
  const rawAmount = Math.floor(args.amountIn * 10 ** inDecimals);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw new Error('Invalid amount');
  }

  const quoteUrl =
    `${JUP_SWAP_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
    `&amount=${rawAmount}&slippageBps=${slippage}`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
  }
  const quote = (await quoteRes.json()) as {
    outAmount?: string;
    priceImpactPct?: string | number;
    routePlan?: Array<{ swapInfo?: { label?: string } }>;
  };
  const amountOut = Number(quote.outAmount ?? 0) / 10 ** outDecimals;
  const priceImpactPct = Number(quote.priceImpactPct ?? 0) * 100;
  const route =
    (quote.routePlan ?? [])
      .map((p) => p.swapInfo?.label)
      .filter((s): s is string => Boolean(s))
      .join(' → ') || 'direct';

  const swapRes = await fetch(`${JUP_SWAP_API}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!swapRes.ok) {
    throw new Error(
      `Jupiter swap build failed: ${swapRes.status} ${await swapRes.text()}`,
    );
  }
  const { swapTransaction } = (await swapRes.json()) as {
    swapTransaction: string;
  };
  if (!swapTransaction) throw new Error('No swap transaction returned');

  const { Connection, VersionedTransaction } = await import('@solana/web3.js');
  const txBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);

  const connection = new Connection(rpc.write, 'confirmed');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  return {
    signature: sig,
    explorer: explorerUrlFor(sig, rpc),
    inputMint,
    outputMint,
    amountIn: args.amountIn,
    amountOut,
    priceImpactPct,
    route,
  };
}
