import { Clock, DollarSign, Target, TrendingUp } from "lucide-react";

const METRICS = [
  { icon: Clock, label: "Time Saved", value: "~4.2 hours", sub: "per episode", color: "text-primary" },
  { icon: DollarSign, label: "Cost Reduction", value: "~$850", sub: "per project", color: "text-segment" },
  { icon: Target, label: "Accuracy", value: "94.7%", sub: "scene boundary detection", color: "text-highlight" },
];

export function ROICard() {
  return (
    <div className="rounded-2xl border border-primary/20 overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(217 33% 9%), hsl(217 40% 12%))" }}>
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Business Value</h3>
        <span className="ml-auto text-[10px] font-medium text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full">20% of judging score</span>
      </div>
      <div className="p-5 grid grid-cols-3 gap-4">
        {METRICS.map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="text-center">
            <div className="h-9 w-9 rounded-xl bg-surface-0/60 border border-border/20 flex items-center justify-center mx-auto mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
            <p className="text-[9px] font-medium text-foreground/50 uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
