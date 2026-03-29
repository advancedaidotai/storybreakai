import { Sparkles, Lock } from "lucide-react";

export function SimilarContent() {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-highlight" />
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Structural DNA Match</h3>
          <p className="text-[9px] text-muted-foreground/60">powered by Twelve Labs</p>
        </div>
      </div>
      <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-surface-0/60 border border-border/20 flex items-center justify-center">
          <Lock className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground/70">Coming Soon</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1 max-w-[200px]">Cross-reference analysis against our library of structural patterns from film and TV.</p>
        </div>
      </div>
    </div>
  );
}
