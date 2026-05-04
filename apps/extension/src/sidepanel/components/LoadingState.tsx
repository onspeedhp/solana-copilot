export function LoadingState() {
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
