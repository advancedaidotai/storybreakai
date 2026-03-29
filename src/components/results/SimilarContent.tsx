import { Film, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SIMILAR_TITLES = [
  { title: "Breaking Bad S05E14", match: 94, type: "Episode" },
  { title: "No Country for Old Men", match: 89, type: "Film" },
  { title: "Ozark S04E07", match: 87, type: "Episode" },
  { title: "Sicario", match: 83, type: "Film" },
  { title: "Better Call Saul S06E13", match: 81, type: "Episode" },
];

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
      <div className="p-4 space-y-2">
        {SIMILAR_TITLES.map((item) => (
          <div key={item.title} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-1/50 transition-colors">
            <div className="h-8 w-8 rounded-lg bg-surface-0/80 border border-border/20 flex items-center justify-center shrink-0">
              <Film className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground truncate">{item.title}</p>
              <Badge variant="secondary" className="text-[8px] bg-surface-2/60 border-0 text-muted-foreground/60 px-1.5 py-0 h-4">{item.type}</Badge>
            </div>
            <span className="text-xs font-bold text-highlight">{item.match}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
