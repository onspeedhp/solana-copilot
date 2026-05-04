import { Wallet } from 'lucide-react';

type Props = {
  onOpenSettings: () => void;
};

export function NoWalletView({ onOpenSettings }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-[#161616] border border-white/[0.08] flex items-center justify-center mb-4">
        <Wallet size={20} strokeWidth={1.5} className="text-white/40" />
      </div>
      <h2 className="text-[14px] font-medium text-white/90 mb-1.5 tracking-tight">
        No wallet connected
      </h2>
      <p className="text-[12px] text-white/60 mb-5 max-w-[280px] leading-relaxed">
        Paste your Solana private key in Settings. It's stored locally only —
        the public key is auto-derived.
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="h-9 px-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[13px] font-medium rounded-[12px] transition-colors duration-150"
      >
        Open Settings
      </button>
    </div>
  );
}
