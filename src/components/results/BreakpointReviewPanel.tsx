import { useState, useMemo, useCallback } from "react";
import {
  Check, X, ChevronLeft, ChevronRight, Filter, ArrowUpDown,
  CheckCircle2, XCircle, Clock, Sparkles, Shield, Zap,
  MessageCircle, ArrowRightLeft, Heart, Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  approval_status?: string;
  boundary_reasons?: string[];
}

type ApprovalStatus = "pending" | "approved" | "rejected";
type FilterMode = "all" | "pending" | "approved" | "rejected" | "high_confidence";
type SortMode = "timeline" | "confidence_high" | "confidence_low";

interface Props {
  breakpoints: Breakpoint[];
  projectId: string;
  contentType: string | null;
  deliveryTarget: string | null;
  segments: { start_sec: number; end_sec: number; type: string; summary: string | null }[];
  onBreakpointUpdated: (id: string, updates: Partial<Breakpoint>) => void;
  onSelectBreakpoint: (bp: Breakpoint) => void;
  selectedBreakpointId: string | null;
}

// ─── Domain-aware boundary scoring ──────────────────────────────────────────

function computeBoundaryReasons(
  bp: Breakpoint,
  contentType: string | null,
  deliveryTarget: string | null,
  segments: Props["segments"],
): string[] {
  const reasons: string[] = [];

  // Valley type mapping
  const valleyReasons: Record<string, string> = {
    dialogue_pause: "speaker change",
    topic_shift: "topic transition",
    emotional_resolution: "emotional arc completion",
    scene_transition: "scene transition",
  };
  if (bp.valley_type && valleyReasons[bp.valley_type]) {
    reasons.push(valleyReasons[bp.valley_type]);
  }

  // Check if breakpoint is near a segment boundary (within 3s)
  const nearBoundary = segments.some(
    (s) => Math.abs(s.end_sec - bp.timestamp_sec) < 3 || Math.abs(s.start_sec - bp.timestamp_sec) < 3
  );
  if (nearBoundary) reasons.push("segment boundary alignment");

  // Content-type-specific reasons
  if (contentType === "tv_episode") {
    if (bp.valley_type === "topic_shift") reasons.push("story transition");
    if (bp.valley_type === "dialogue_pause") reasons.push("anchor handoff opportunity");
  } else if (contentType === "feature_film") {
    if (bp.valley_type === "emotional_resolution") reasons.push("narrative valley");
    if (bp.valley_type === "scene_transition") reasons.push("visual pacing drop");
  }

  // Delivery-target-specific
  if (deliveryTarget === "broadcast" || deliveryTarget === "cable") {
    reasons.push("act break compatible");
  }
  if (deliveryTarget === "youtube" && bp.ad_slot_duration_rec && bp.ad_slot_duration_rec <= 15) {
    reasons.push("mid-roll friendly");
  }

  // Confidence-based
  if (bp.confidence !== null && bp.confidence >= 0.85) {
    reasons.push("high AI confidence");
  }

  // Lead-in quality
  if (bp.lead_in_sec !== null && bp.lead_in_sec >= 2) {
    reasons.push("clean lead-in window");
  }

  // Deduplicate
  return [...new Set(reasons)];
}

function computeDomainScore(
  bp: Breakpoint,
  contentType: string | null,
  segments: Props["segments"],
): { dialogue_shift: number; visual_shift: number; context_flow: number } {
  const baseConf = bp.confidence ?? 0.5;

  // Dialogue shift: higher for dialogue pauses and topic shifts
  const dialogueShift = bp.valley_type === "dialogue_pause" ? 0.9
    : bp.valley_type === "topic_shift" ? 0.8
    : bp.valley_type === "emotional_resolution" ? 0.6
    : 0.4;

  // Visual shift: higher for scene transitions and near segment boundaries
  const nearBoundary = segments.some(
    (s) => Math.abs(s.end_sec - bp.timestamp_sec) < 3
  );
  const visualShift = bp.valley_type === "scene_transition" ? 0.9
    : nearBoundary ? 0.75
    : 0.4;

  // Context flow: how well the break fits the narrative
  const contextFlow = baseConf * (nearBoundary ? 1.1 : 0.9);

  return {
    dialogue_shift: Math.min(1, dialogueShift),
    visual_shift: Math.min(1, visualShift),
    context_flow: Math.min(1, contextFlow),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const VALLEY_ICONS: Record<string, typeof MessageCircle> = {
  dialogue_pause: MessageCircle,
  topic_shift: ArrowRightLeft,
  emotional_resolution: Heart,
  scene_transition: Film,
};

const STATUS_CONFIG: Record<ApprovalStatus, { icon: typeof Check; label: string; color: string; bg: string }> = {
  pending: { icon: Clock, label: "Pending", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  approved: { icon: CheckCircle2, label: "Approved", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  rejected: { icon: XCircle, label: "Rejected", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function BreakpointReviewPanel({
  breakpoints, projectId, contentType, deliveryTarget, segments,
  onBreakpointUpdated, onSelectBreakpoint, selectedBreakpointId,
}: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("timeline");
  const [showFilters, setShowFilters] = useState(false);

  // Enrich breakpoints with computed boundary reasons and scores
  const enrichedBreakpoints = useMemo(() => {
    return breakpoints.map((bp) => {
      const reasons = (bp.boundary_reasons && bp.boundary_reasons.length > 0)
        ? bp.boundary_reasons
        : computeBoundaryReasons(bp, contentType, deliveryTarget, segments);
      const scores = computeDomainScore(bp, contentType, segments);
      return { ...bp, boundary_reasons: reasons, _scores: scores };
    });
  }, [breakpoints, contentType, deliveryTarget, segments]);

  // Filter
  const filtered = useMemo(() => {
    let bps = enrichedBreakpoints;
    switch (filter) {
      case "pending": bps = bps.filter((b) => (b.approval_status || "pending") === "pending"); break;
      case "approved": bps = bps.filter((b) => b.approval_status === "approved"); break;
      case "rejected": bps = bps.filter((b) => b.approval_status === "rejected"); break;
      case "high_confidence": bps = bps.filter((b) => (b.confidence ?? 0) >= 0.85); break;
    }
    return bps;
  }, [enrichedBreakpoints, filter]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "confidence_high": arr.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)); break;
      case "confidence_low": arr.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)); break;
      default: arr.sort((a, b) => a.timestamp_sec - b.timestamp_sec);
    }
    return arr;
  }, [filtered, sort]);

  const updateApproval = useCallback(async (id: string, status: ApprovalStatus) => {
    const { error } = await supabase
      .from("breakpoints")
      .update({ approval_status: status } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    onBreakpointUpdated(id, { approval_status: status });
    toast({ title: `Breakpoint ${status}`, description: `Marked as ${status}.` });
  }, [onBreakpointUpdated]);

  const nudgeBreakpoint = useCallback(async (id: string, currentSec: number, deltaSec: number) => {
    const newSec = Math.max(0, currentSec + deltaSec);
    const { error } = await supabase
      .from("breakpoints")
      .update({ timestamp_sec: newSec } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Nudge failed", description: error.message, variant: "destructive" });
      return;
    }
    onBreakpointUpdated(id, { timestamp_sec: newSec });
    toast({ title: "Breakpoint nudged", description: `Moved to ${formatTime(newSec)}` });
  }, [onBreakpointUpdated]);

  const batchApproveHighConf = useCallback(async () => {
    const highConf = enrichedBreakpoints.filter((b) => (b.confidence ?? 0) >= 0.85 && (b.approval_status || "pending") === "pending");
    if (highConf.length === 0) {
      toast({ title: "No pending high-confidence breakpoints" });
      return;
    }
    const ids = highConf.map((b) => b.id);
    const { error } = await supabase
      .from("breakpoints")
      .update({ approval_status: "approved" } as any)
      .in("id", ids);
    if (error) {
      toast({ title: "Batch approve failed", description: error.message, variant: "destructive" });
      return;
    }
    ids.forEach((id) => onBreakpointUpdated(id, { approval_status: "approved" }));
    toast({ title: `${ids.length} breakpoints approved`, description: "All high-confidence breakpoints marked as approved." });
  }, [enrichedBreakpoints, onBreakpointUpdated]);

  const resetApprovals = useCallback(async () => {
    const ids = breakpoints.map((b) => b.id);
    const { error } = await supabase
      .from("breakpoints")
      .update({ approval_status: "pending" } as any)
      .in("id", ids);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
    ids.forEach((id) => onBreakpointUpdated(id, { approval_status: "pending" }));
    toast({ title: "All approvals reset" });
  }, [breakpoints, onBreakpointUpdated]);

  const counts = useMemo(() => ({
    all: enrichedBreakpoints.length,
    pending: enrichedBreakpoints.filter((b) => (b.approval_status || "pending") === "pending").length,
    approved: enrichedBreakpoints.filter((b) => b.approval_status === "approved").length,
    rejected: enrichedBreakpoints.filter((b) => b.approval_status === "rejected").length,
    high_confidence: enrichedBreakpoints.filter((b) => (b.confidence ?? 0) >= 0.85).length,
  }), [enrichedBreakpoints]);

  if (breakpoints.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Breakpoint Review</h3>
          <Badge variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/5 ml-1">
            {sorted.length}/{enrichedBreakpoints.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3 w-3 mr-1" /> Filter
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setSort(sort === "timeline" ? "confidence_high" : sort === "confidence_high" ? "confidence_low" : "timeline")}>
            <ArrowUpDown className="h-3 w-3 mr-1" /> {sort === "timeline" ? "Time" : sort === "confidence_high" ? "High→Low" : "Low→High"}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="px-4 py-2.5 border-b border-border/10 flex flex-wrap items-center gap-1.5 bg-surface-0/30">
          {(["all", "pending", "approved", "rejected", "high_confidence"] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                filter === f ? "bg-primary/15 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-surface-1/60"
              }`}
            >
              {f === "all" ? "All" : f === "high_confidence" ? "High Conf" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-60">({counts[f]})</span>
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-emerald-400 hover:bg-emerald-500/10" onClick={batchApproveHighConf}>
            <Check className="h-3 w-3 mr-1" /> Approve All High
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={resetApprovals}>
            Reset All
          </Button>
        </div>
      )}

      {/* Breakpoint list */}
      <div className="max-h-[480px] overflow-y-auto divide-y divide-border/10">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground/60">No breakpoints match this filter.</p>
          </div>
        )}
        {sorted.map((bp) => {
          const status = (bp.approval_status || "pending") as ApprovalStatus;
          const cfg = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;
          const confPct = bp.confidence !== null ? Math.round((bp.confidence > 1 ? bp.confidence : bp.confidence * 100)) : null;
          const isSelected = bp.id === selectedBreakpointId;
          const ValleyIcon = VALLEY_ICONS[bp.valley_type || ""] || Zap;

          // Context: find adjacent segments
          const prevSeg = segments.filter((s) => s.end_sec <= bp.timestamp_sec).pop();
          const nextSeg = segments.find((s) => s.start_sec >= bp.timestamp_sec);

          return (
            <div
              key={bp.id}
              className={`px-4 py-3 transition-colors cursor-pointer ${
                isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-surface-1/40 border-l-2 border-l-transparent"
              }`}
              onClick={() => onSelectBreakpoint(bp)}
            >
              {/* Top row: time + status + confidence */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold text-foreground">{formatTime(bp.timestamp_sec)}</span>
                <Badge variant="outline" className={`text-[9px] ${cfg.bg} ${cfg.color} border`}>
                  <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {cfg.label}
                </Badge>
                <Badge variant="outline" className={`text-[9px] ${
                  confPct === null ? "bg-muted/30 border-muted/30 text-muted-foreground"
                  : confPct >= 85 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : confPct >= 65 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : confPct === 0 ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
                }`}>
                  {confPct !== null ? `${confPct}%` : "—"}
                </Badge>
                <div className="flex-1" />
                <ValleyIcon className={`h-3 w-3 ${
                  bp.valley_type === "dialogue_pause" ? "text-blue-400"
                  : bp.valley_type === "topic_shift" ? "text-amber-400"
                  : bp.valley_type === "emotional_resolution" ? "text-rose-400"
                  : "text-purple-400"
                }`} />
              </div>

              {/* Reason */}
              <p className="text-[10px] text-muted-foreground leading-relaxed mb-2 line-clamp-2">{bp.reason || "AI analysis pending"}</p>

              {/* Boundary reason chips */}
              {bp.boundary_reasons && bp.boundary_reasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {bp.boundary_reasons.slice(0, 5).map((r, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-0/80 border border-border/20 text-muted-foreground/70">
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Context: prev → break → next */}
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-2">
                {prevSeg && (
                  <span className="truncate max-w-[100px]" title={prevSeg.summary || prevSeg.type}>
                    ← {prevSeg.type.replace("_", " ")}
                  </span>
                )}
                <span className="text-primary/60 font-bold">|</span>
                {nextSeg && (
                  <span className="truncate max-w-[100px]" title={nextSeg.summary || nextSeg.type}>
                    {nextSeg.type.replace("_", " ")} →
                  </span>
                )}
              </div>

              {/* Sub-scores */}
              {"_scores" in bp && (
                <div className="flex gap-3 mb-2">
                  {([
                    { key: "dialogue_shift", label: "Dialog" },
                    { key: "visual_shift", label: "Visual" },
                    { key: "context_flow", label: "Flow" },
                  ] as const).map(({ key, label }) => {
                    const val = Math.round(((bp as any)._scores[key] ?? 0) * 100);
                    return (
                      <div key={key} className="flex items-center gap-1">
                        <span className="text-[8px] text-muted-foreground/40 uppercase">{label}</span>
                        <div className="h-1 w-10 rounded-full bg-surface-0/80 overflow-hidden">
                          <div className={`h-full rounded-full ${val >= 75 ? "bg-emerald-500/70" : val >= 50 ? "bg-amber-500/60" : "bg-muted-foreground/30"}`} style={{ width: `${val}%` }} />
                        </div>
                        <span className="text-[8px] font-mono text-muted-foreground/40">{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="sm"
                  className={`h-6 px-2 text-[10px] rounded-lg ${status === "approved" ? "text-emerald-400 bg-emerald-500/10" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`}
                  onClick={() => updateApproval(bp.id, status === "approved" ? "pending" : "approved")}
                >
                  <Check className="h-3 w-3 mr-0.5" /> {status === "approved" ? "Approved" : "Approve"}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className={`h-6 px-2 text-[10px] rounded-lg ${status === "rejected" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                  onClick={() => updateApproval(bp.id, status === "rejected" ? "pending" : "rejected")}
                >
                  <X className="h-3 w-3 mr-0.5" /> {status === "rejected" ? "Rejected" : "Reject"}
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => nudgeBreakpoint(bp.id, bp.timestamp_sec, -2)} title="Nudge 2s earlier">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => nudgeBreakpoint(bp.id, bp.timestamp_sec, 2)} title="Nudge 2s later">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
