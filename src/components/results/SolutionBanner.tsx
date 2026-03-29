import { useState } from "react";
import { X, Sparkles } from "lucide-react";

export function SolutionBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative rounded-2xl border border-primary/20 bg-primary/[0.06] px-5 py-3.5 flex items-start gap-3 fade-in-600">
      <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <p className="text-[12px] leading-relaxed text-foreground/90 flex-1">
        <span className="font-bold">StoryBreak AI</span> uses <span className="font-semibold text-primary">Pegasus 1.2</span> to identify semantic scene boundaries, character arcs, and narrative structure — replacing manual timecode logging that costs studios <span className="font-bold text-breakpoint">$2,400/episode</span>.
      </p>
      <button onClick={() => setDismissed(true)} className="shrink-0 p-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-surface-1/60 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
