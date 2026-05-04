import { Settings } from 'lucide-react';
import { StatusDot, type StatusDotColor } from './StatusDot';

type Props = {
  dot: StatusDotColor;
  label: string;
  onSettingsClick?: () => void;
};

export function Header({ dot, label, onSettingsClick }: Props) {
  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-white/[0.08] flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot color={dot} />
        <span className="text-[13px] text-white/90 truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onSettingsClick}
        className="text-white/60 hover:text-white/90 transition-colors duration-150 p-1 -mr-1"
        aria-label="Settings"
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </header>
  );
}
