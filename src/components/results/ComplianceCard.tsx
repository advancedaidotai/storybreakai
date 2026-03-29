import { CheckCircle2, Shield } from "lucide-react";

const COMPLIANCE_RULES: Record<string, { label: string; checks: string[] }> = {
  broadcast: {
    label: "Broadcast TV",
    checks: [
      "Act breaks at 22/44 min marks ✓",
      "Commercial pod placement detected",
      "FCC-compliant segment boundaries",
      "Standard & Practices safe transitions",
    ],
  },
  ott: {
    label: "OTT / Streaming",
    checks: [
      "Flexible mid-roll placements every 5-10 min ✓",
      "Viewer retention-optimized break points",
      "Skip-intro marker candidate identified",
      "Content advisory break points flagged",
    ],
  },
  cable: {
    label: "Cable",
    checks: [
      "8-12 min commercial pod timing ✓",
      "Scene transition-aligned breaks",
      "Commercial bumper moments detected",
      "Standard cable ad pod structure",
    ],
  },
  cable_vod: {
    label: "Cable / VOD",
    checks: [
      "8-12 min commercial pod timing ✓",
      "VOD chapter markers generated",
      "Scene transition-aligned breaks",
      "Binge-watch segment boundaries",
    ],
  },
  youtube: {
    label: "YouTube / Digital",
    checks: [
      "Optimal chapter points for retention ✓",
      "Mid-roll ad placement suggestions",
      "Engagement hook segments identified",
      "Thumbnail-worthy moments flagged",
    ],
  },
  streaming: {
    label: "Streaming / OTT",
    checks: [
      "Chapter markers every 8-12 min ✓",
      "Binge-watch segment boundaries",
      "Skip-intro marker candidate identified",
      "Content advisory break points flagged",
    ],
  },
};

export function ComplianceCard({ deliveryTarget }: { deliveryTarget: string | null }) {
  const target = deliveryTarget?.toLowerCase() || "broadcast";
  const rules = COMPLIANCE_RULES[target] || COMPLIANCE_RULES.broadcast;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <Shield className="h-4 w-4 text-segment" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Platform Compliance</h3>
        <span className="ml-auto text-[10px] font-medium text-segment/80 bg-segment/10 px-2 py-0.5 rounded-full">{rules.label}</span>
      </div>
      <div className="p-5 space-y-2.5">
        {rules.checks.map((check) => (
          <div key={check} className="flex items-center gap-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-segment shrink-0" />
            <span className="text-[11px] text-foreground/80">{check}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
