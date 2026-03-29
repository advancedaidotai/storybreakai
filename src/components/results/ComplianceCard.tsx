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
  streaming: {
    label: "Streaming / OTT",
    checks: [
      "Chapter markers every 8–12 min ✓",
      "Binge-watch segment boundaries",
      "Skip-intro marker candidate identified",
      "Content advisory break points flagged",
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
