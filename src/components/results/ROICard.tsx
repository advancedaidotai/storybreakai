import { Clock, DollarSign, TrendingUp, Shield } from "lucide-react";

const COMPLIANCE_RULES: Record<string, string> = {
  youtube: "YouTube · 3-5 min ad intervals",
  cable_vod: "Cable/VOD · 8-12 min pods",
  cable: "Cable · 8-12 min commercial pods",
  broadcast: "Broadcast · Act breaks at 22/44 min",
  ott: "OTT · Flexible mid-roll placements",
};

interface ROICardProps {
  durationSec?: number | null;
  contentType?: string | null;
  deliveryTarget?: string | null;
}

export const ROI_CONSTANTS = {
  HOURLY_RATE: 75,
  FILM_MANUAL_HOURS: 4.2,
  OTHER_MANUAL_HOURS: 2.5,
  FILM_AI_MINUTES: 14,
  OTHER_AI_MINUTES: 8,
};

export function computeROI(contentType?: string | null) {
  const isFilm = contentType === "feature_film";
  const manualHours = isFilm ? ROI_CONSTANTS.FILM_MANUAL_HOURS : ROI_CONSTANTS.OTHER_MANUAL_HOURS;
  const estimatedMinutes = isFilm ? ROI_CONSTANTS.FILM_AI_MINUTES : ROI_CONSTANTS.OTHER_AI_MINUTES;
  const aiHours = estimatedMinutes / 60;
  const timeSaved = manualHours - aiHours;
  const costSaved = Math.round(timeSaved * ROI_CONSTANTS.HOURLY_RATE);
  return { timeSaved, costSaved };
}

export function ROICard({ durationSec, contentType, deliveryTarget }: ROICardProps) {
  const { timeSaved, costSaved } = computeROI(contentType);
  const activeRule = COMPLIANCE_RULES[deliveryTarget || "broadcast"] || COMPLIANCE_RULES.broadcast;

  const METRICS = [
    { icon: Clock, label: "TIME SAVED", value: `~${timeSaved.toFixed(1)} hrs`, sub: "vs manual scene logging", color: "text-primary" },
    { icon: DollarSign, label: "COST REDUCTION", value: `~$${costSaved}`, sub: `at $${ROI_CONSTANTS.HOURLY_RATE}/hr rate`, color: "text-segment" },
  ];

  return (
    <div className="rounded-2xl border border-primary/20 overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(217 33% 9%), hsl(217 40% 12%))" }}>
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Business Impact</h3>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
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
      <div className="px-5 pb-2">
        <p className="text-xs text-muted-foreground/70 text-center italic leading-relaxed">
          Illustrative industry estimates — not calculated from your specific project data.
        </p>
      </div>
      {/* Delivery Target */}
      <div className="px-5 pb-4 pt-1">
        <div className="flex items-center gap-2 pt-3 border-t border-border/15">
          <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] text-muted-foreground">{activeRule}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
