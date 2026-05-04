export type StatusDotColor = 'green' | 'amber' | 'red' | 'none';

const COLOR_MAP: Record<Exclude<StatusDotColor, 'none'>, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

export function StatusDot({ color }: { color: StatusDotColor }) {
  if (color === 'none') return null;
  const animated = color === 'amber' || color === 'red';
  return (
    <div
      className={`w-1.5 h-1.5 rounded-full ${animated ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: COLOR_MAP[color] }}
    />
  );
}
