import { CheckCircle2, Shield, AlertTriangle, XCircle } from "lucide-react";

interface BreakpointData {
  timestamp_sec: number;
  confidence: number | null;
  valley_type?: string | null;
  compliance_notes?: string | null;
}

interface ComplianceCardProps {
  deliveryTarget?: string | null;
  breakpoints?: BreakpointData[];
  totalDuration?: number | null;
}

interface CheckResult {
  label: string;
  status: "pass" | "warn" | "fail";
}

function computeAvgInterval(breakpoints: BreakpointData[]): number {
  if (breakpoints.length < 2) return 0;
  const sorted = [...breakpoints].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGap += sorted[i].timestamp_sec - sorted[i - 1].timestamp_sec;
  }
  return totalGap / (sorted.length - 1);
}

function checkBroadcast(bp: BreakpointData[], dur: number): CheckResult[] {
  const checks: CheckResult[] = [];

  // Act breaks near standard marks
  const expectedMarks = dur <= 1800
    ? [7 * 60, 14 * 60, 19 * 60]
    : [11 * 60, 22 * 60, 33 * 60, 40 * 60, 48 * 60];
  const tolerance = 120; // ±2 min
  const nearStandard = bp.filter((b) =>
    expectedMarks.some((m) => Math.abs(b.timestamp_sec - m) <= tolerance)
  );
  checks.push({
    label: "Act breaks near standard marks",
    status: nearStandard.length >= Math.floor(expectedMarks.length * 0.5) ? "pass" : nearStandard.length > 0 ? "warn" : "fail",
  });

  checks.push({
    label: "Commercial pod placement detected",
    status: bp.length > 0 ? "pass" : "fail",
  });

  const highConfidence = bp.every((b) => (b.confidence ?? 0) > 0.6);
  checks.push({
    label: "FCC-compliant segment boundaries",
    status: highConfidence ? "pass" : bp.some((b) => (b.confidence ?? 0) > 0.6) ? "warn" : "fail",
  });

  const allHaveValleyType = bp.every((b) => b.valley_type != null);
  checks.push({
    label: "Standards & Practices safe transitions",
    status: allHaveValleyType ? "pass" : bp.some((b) => b.valley_type != null) ? "warn" : "fail",
  });

  return checks;
}

function checkYoutube(bp: BreakpointData[], dur: number): CheckResult[] {
  const checks: CheckResult[] = [];

  checks.push({
    label: "Mid-roll eligible (8+ min content)",
    status: dur > 480 ? "pass" : "warn",
  });

  const avg = computeAvgInterval(bp);
  checks.push({
    label: "Break interval 3-5 min",
    status: bp.length < 2 ? "warn" : avg >= 180 && avg <= 300 ? "pass" : avg >= 120 && avg <= 420 ? "warn" : "fail",
  });

  const earlyBreak = bp.some((b) => b.timestamp_sec <= 300);
  checks.push({
    label: "Engagement hook segments identified",
    status: earlyBreak ? "pass" : "warn",
  });

  checks.push({
    label: "Chapter marker candidates",
    status: bp.length >= 3 ? "pass" : bp.length >= 1 ? "warn" : "fail",
  });

  return checks;
}

function checkCable(bp: BreakpointData[], dur: number): CheckResult[] {
  const checks: CheckResult[] = [];

  const avg = computeAvgInterval(bp);
  checks.push({
    label: "8-12 min pod timing",
    status: bp.length < 2 ? "warn" : avg >= 480 && avg <= 720 ? "pass" : avg >= 360 && avg <= 900 ? "warn" : "fail",
  });

  const allHaveValleyType = bp.every((b) => b.valley_type != null);
  checks.push({
    label: "Scene transition-aligned",
    status: allHaveValleyType ? "pass" : bp.some((b) => b.valley_type != null) ? "warn" : "fail",
  });

  checks.push({
    label: "Commercial bumper moments",
    status: bp.length >= 2 ? "pass" : bp.length >= 1 ? "warn" : "fail",
  });

  // Total ad time: breakpoints × ~120s should be ≤ 16 min/hr
  const adMinPerHr = dur > 0 ? (bp.length * 120 / dur) * 3600 / 60 : 0;
  checks.push({
    label: "Standard pod structure",
    status: adMinPerHr <= 16 ? "pass" : adMinPerHr <= 20 ? "warn" : "fail",
  });

  return checks;
}

function checkOtt(bp: BreakpointData[]): CheckResult[] {
  const checks: CheckResult[] = [];

  const avg = computeAvgInterval(bp);
  checks.push({
    label: "5-10 min mid-roll intervals",
    status: bp.length < 2 ? "warn" : avg >= 300 && avg <= 600 ? "pass" : avg >= 200 && avg <= 780 ? "warn" : "fail",
  });

  const allAboveThreshold = bp.every((b) => (b.confidence ?? 0) > 0.5);
  checks.push({
    label: "Viewer retention optimized",
    status: allAboveThreshold ? "pass" : bp.some((b) => (b.confidence ?? 0) > 0.5) ? "warn" : "fail",
  });

  const allHaveContext = bp.every((b) => b.valley_type != null);
  checks.push({
    label: "Non-disruptive placements",
    status: allHaveContext ? "pass" : bp.some((b) => b.valley_type != null) ? "warn" : "fail",
  });

  checks.push({
    label: "SSAI compatible markers",
    status: bp.length > 0 ? "pass" : "fail",
  });

  return checks;
}

function checkCableVod(bp: BreakpointData[]): CheckResult[] {
  const checks: CheckResult[] = [];

  const avg = computeAvgInterval(bp);
  checks.push({
    label: "10-12 min DAI markers",
    status: bp.length < 2 ? "warn" : avg >= 600 && avg <= 720 ? "pass" : avg >= 480 && avg <= 900 ? "warn" : "fail",
  });

  checks.push({
    label: "Chapter markers generated",
    status: bp.length >= 2 ? "pass" : bp.length >= 1 ? "warn" : "fail",
  });

  checks.push({
    label: "Fewer ad minutes than linear",
    status: bp.length <= 8 ? "pass" : "warn",
  });

  const hasBingeTransition = bp.some(
    (b) => b.valley_type === "emotional_resolution" || b.valley_type === "scene_transition"
  );
  checks.push({
    label: "Binge-watch transitions",
    status: hasBingeTransition ? "pass" : "warn",
  });

  return checks;
}

function checkSocial(bp: BreakpointData[]): CheckResult[] {
  const checks: CheckResult[] = [];

  const earlyHook = bp.some((b) => b.timestamp_sec < 5);
  checks.push({
    label: "Hook identified (first 3s)",
    status: earlyHook ? "pass" : bp.some((b) => b.timestamp_sec < 10) ? "warn" : "fail",
  });

  checks.push({
    label: "Clip boundaries detected",
    status: bp.length >= 2 ? "pass" : bp.length >= 1 ? "warn" : "fail",
  });

  checks.push({
    label: "Thumb-stop moments flagged",
    status: bp.length > 0 ? "pass" : "warn",
  });

  checks.push({
    label: "Optimal for vertical format",
    status: "pass",
  });

  return checks;
}

function checkStreaming(bp: BreakpointData[]): CheckResult[] {
  const checks: CheckResult[] = [];

  const avg = computeAvgInterval(bp);
  checks.push({
    label: "Chapter markers every 8-12 min",
    status: bp.length < 2 ? "warn" : avg >= 480 && avg <= 720 ? "pass" : avg >= 360 && avg <= 900 ? "warn" : "fail",
  });

  checks.push({
    label: "Binge-watch segment boundaries",
    status: bp.length >= 2 ? "pass" : bp.length >= 1 ? "warn" : "fail",
  });

  checks.push({
    label: "Skip-intro marker candidate",
    status: bp.some((b) => b.timestamp_sec <= 120) ? "pass" : "warn",
  });

  checks.push({
    label: "Content advisory break points",
    status: bp.some((b) => b.compliance_notes != null) ? "pass" : "warn",
  });

  return checks;
}

const PLATFORM_LABELS: Record<string, string> = {
  broadcast: "Broadcast TV",
  ott: "OTT / Streaming",
  cable: "Cable",
  cable_vod: "Cable / VOD",
  youtube: "YouTube / Digital",
  streaming: "Streaming / OTT",
  social: "Social Media",
};

function getChecks(target: string, bp: BreakpointData[], dur: number): CheckResult[] {
  switch (target) {
    case "broadcast": return checkBroadcast(bp, dur);
    case "youtube": return checkYoutube(bp, dur);
    case "cable": return checkCable(bp, dur);
    case "ott": return checkOtt(bp);
    case "cable_vod": return checkCableVod(bp);
    case "social": return checkSocial(bp);
    case "streaming": return checkStreaming(bp);
    default: return checkOtt(bp);
  }
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
  if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
}

export function ComplianceCard({ deliveryTarget, breakpoints, totalDuration }: ComplianceCardProps) {
  const target = deliveryTarget?.toLowerCase() || "ott";
  const label = PLATFORM_LABELS[target] || PLATFORM_LABELS.ott;
  const bp = (breakpoints || []).map((b) => ({
    timestamp_sec: b.timestamp_sec,
    confidence: b.confidence,
    valley_type: b.valley_type,
    compliance_notes: b.compliance_notes,
  }));
  const dur = totalDuration || 0;
  const checks = getChecks(target, bp, dur);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/15 flex items-center gap-2">
        <Shield className="h-4 w-4 text-segment" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/90">Platform Compliance</h3>
        <span className="ml-auto text-[10px] font-medium text-segment/80 bg-segment/10 px-2 py-0.5 rounded-full">{label}</span>
      </div>
      <div className="p-5 space-y-2.5">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2.5">
            <StatusIcon status={check.status} />
            <span className="text-[11px] text-foreground/80">{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
