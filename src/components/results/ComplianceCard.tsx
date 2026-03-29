import { CheckCircle2, Shield, Minus } from "lucide-react";

interface Breakpoint {
  id: string;
  timestamp_sec: number;
  type: string | null;
  reason: string | null;
  confidence: number | null;
  lead_in_sec: number | null;
  valley_type: string | null;
  ad_slot_duration_rec: number | null;
  compliance_notes: string | null;
}

interface ComplianceCheck {
  label: string;
  passed: boolean;
}

function evaluateChecks(
  deliveryTarget: string,
  breakpoints: Breakpoint[],
  totalDuration: number
): ComplianceCheck[] {
  const target = deliveryTarget.toLowerCase();
  const hasBreakpoints = breakpoints.length > 0;
  const allHighConfidence = hasBreakpoints && breakpoints.every(bp => bp.confidence !== null && bp.confidence > 0.7);
  const allHaveValleyType = hasBreakpoints && breakpoints.every(bp => bp.valley_type !== null);

  if (target === "broadcast") {
    // Check if any breakpoints fall near 22-min or 44-min marks (within 2-min tolerance)
    const near22 = hasBreakpoints && breakpoints.some(bp => Math.abs(bp.timestamp_sec - 22 * 60) <= 120);
    const near44 = hasBreakpoints && breakpoints.some(bp => Math.abs(bp.timestamp_sec - 44 * 60) <= 120);
    const actBreaksDetected = near22 || near44;

    return [
      { label: actBreaksDetected ? "Act breaks near 22/44 min marks" : "Act breaks at 22/44 min marks — Not detected", passed: actBreaksDetected },
      { label: "Commercial pod placement detected", passed: hasBreakpoints },
      { label: "FCC-compliant segment boundaries", passed: allHighConfidence },
      { label: "Standards & Practices safe transitions", passed: allHaveValleyType },
    ];
  }

  if (target === "ott" || target === "streaming") {
    return [
      { label: "Mid-roll ad placements identified", passed: hasBreakpoints },
      { label: "Viewer retention-optimized break points", passed: allHighConfidence },
      { label: "Content advisory break points", passed: allHaveValleyType },
      { label: "Safe narrative transitions", passed: allHaveValleyType },
    ];
  }

  if (target === "cable" || target === "cable_vod") {
    return [
      { label: "Commercial pod placement detected", passed: hasBreakpoints },
      { label: "Scene transition-aligned breaks", passed: allHaveValleyType },
      { label: "Segment boundary confidence", passed: allHighConfidence },
      { label: "Safe narrative transitions", passed: allHaveValleyType },
    ];
  }

  if (target === "youtube") {
    return [
      { label: "Mid-roll ad placements identified", passed: hasBreakpoints },
      { label: "Engagement-optimized break points", passed: allHighConfidence },
      { label: "Chapter point candidates", passed: hasBreakpoints },
      { label: "Safe narrative transitions", passed: allHaveValleyType },
    ];
  }

  // Fallback to broadcast-style checks
  return [
    { label: "Ad break placements detected", passed: hasBreakpoints },
    { label: "Segment boundary confidence", passed: allHighConfidence },
    { label: "Safe narrative transitions", passed: allHaveValleyType },
    { label: "Commercial pod placement", passed: hasBreakpoints },
  ];
}

const PLATFORM_LABELS: Record<string, string> = {
  broadcast: "Broadcast TV",
  ott: "OTT / Streaming",
  cable: "Cable",
  cable_vod: "Cable / VOD",
  youtube: "YouTube / Digital",
  streaming: "Streaming / OTT",
};

interface ComplianceCardProps {
  deliveryTarget: string | null;
  breakpoints: Breakpoint[];
  totalDuration: number;
}

export function ComplianceCard({ deliveryTarget, breakpoints, totalDuration }: ComplianceCardProps) {
  const target = deliveryTarget?.toLowerCase() || "broadcast";
  const platformLabel = PLATFORM_LABELS[target] || PLATFORM_LABELS.broadcast;
  const checks = evaluateChecks(target, breakpoints, totalDuration);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <Shield className="h-4 w-4 text-segment" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Platform Compliance</h3>
        <span className="ml-auto text-[10px] font-medium text-segment/80 bg-segment/10 px-2 py-0.5 rounded-full">{platformLabel}</span>
      </div>
      <div className="p-5 space-y-2.5">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2.5">
            {check.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-segment shrink-0" />
            ) : (
              <Minus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            )}
            <span className={`text-[11px] ${check.passed ? "text-foreground/80" : "text-muted-foreground/50"}`}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
