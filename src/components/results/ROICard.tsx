import { Clock, DollarSign, Target, TrendingUp, Zap, Shield } from "lucide-react";

const COMPLIANCE_RULES: Record<string, string> = {
  youtube: "YouTube · 3-5 min ad intervals",
  cable_vod: "Cable/VOD · 8-12 min pods",
  cable: "Cable · 8-12 min commercial pods",
  broadcast: "Broadcast · Act breaks at 22/44 min",
  ott: "OTT · Flexible mid-roll placements",
  social: "Social · Hook-optimized clips",
  streaming: "Streaming · Chapter markers",
};

interface ROICardProps {
  durationSec?: number | null;
  contentType?: string | null;
  deliveryTarget?: string | null;
}

export function ROICard({ durationSec, contentType, deliveryTarget }: ROICardProps) {
  const HOURLY_RATE = 75;
  const isFilm = contentType === "feature_film";
  const manualHours = isFilm ? 4.2 : 2.5;
  const estimatedMinutes = isFilm ? 14 : 8;
  const aiHours = estimatedMinutes / 60;
  const timeSaved = manualHours - aiHours;
  const costSaved = Math.round(timeSaved * HOURLY_RATE);
  const activeRule = COMPLIANCE_RULES[deliveryTarget || "ott"] || COMPLIANCE_RULES.ott;

  const METRICS = [
    { icon: Clock, label: "Time Saved", value: `~${timeSaved.toFixed(1)} hrs`, sub: "vs manual scene logging", color: "text-primary" },
    { icon: DollarSign, label: "Cost Reduction", value: `~$${costSaved}`, sub: `at $${HOURLY_RATE}/hr rate`, color: "text-segment" },
    { icon: Target, label: "Accuracy", value: "~95%", sub: "estimated benchmark", color: "text-highlight" },
  ];

  return (
    <div className="rounded-2xl border border-primary/20 overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(217 33% 9%), hsl(217 40% 12%))" }}>
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Business Impact</h3>
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
      <div className="px-5 pb-1">
        <p className="text-[9px] text-muted-foreground/40 text-center italic">Illustrative estimates · not calculated from your data</p>
      </div>
      {/* Active Compliance Engine */}
      <div className="px-5 pb-4 pt-1">
        <div className="flex items-center gap-2 pt-3 border-t border-border/15">
          <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-primary/80">Active Compliance Engine</p>
            <p className="text-[10px] text-muted-foreground">{activeRule}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
