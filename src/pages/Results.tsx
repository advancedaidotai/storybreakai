import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import {
  Play, Sparkles, Star, Download, FileJson, Zap, Loader2,
  MessageCircle, ArrowRightLeft, Heart, Film, Package,
  Clock, Shield, Timer, Minus, Plus, ChevronLeft, ChevronRight,
  List, Diamond, MonitorPlay, Clapperboard, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Segment { id: string; start_sec: number; end_sec: number; type: string; summary: string | null; confidence: number | null; }
interface Breakpoint { id: string; timestamp_sec: number; type: string | null; reason: string | null; confidence: number | null; lead_in_sec: number | null; valley_type: string | null; ad_slot_duration_rec: number | null; compliance_notes: string | null; }
interface Highlight { id: string; start_sec: number; end_sec: number; score: number | null; reason: string | null; rank_order: number | null; }
interface AnalysisChunk { id: string; chunk_index: number; start_sec: number; end_sec: number; overlap_start_sec: number | null; overlap_end_sec: number | null; }
interface ProjectInfo { title: string; content_type: string | null; content_metadata: any; delivery_target: string | null; duration_sec: number | null; }

type SelectedItem =
  | { kind: "segment"; data: Segment }
  | { kind: "breakpoint"; data: Breakpoint }
  | { kind: "highlight"; data: Highlight }
  | { kind: "act"; data: { label: string; start_sec: number; end_sec: number; summary: string } };

// ─── Constants ───────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = { opening: "#3B82F6", story_unit: "#10B981", transition: "#6B7280", climax: "#EF4444", resolution: "#8B5CF6" };
const SEGMENT_LABELS: Record<string, string> = { opening: "Opening", story_unit: "Story Unit", transition: "Transition", climax: "Climax", resolution: "Resolution" };
const VALLEY_CONFIG: Record<string, { icon: typeof MessageCircle; label: string; color: string }> = {
  dialogue_pause: { icon: MessageCircle, label: "Dialogue Pause", color: "text-blue-400" },
  topic_shift: { icon: ArrowRightLeft, label: "Topic Shift", color: "text-amber-400" },
  emotional_resolution: { icon: Heart, label: "Emotional Resolution", color: "text-rose-400" },
  scene_transition: { icon: Film, label: "Scene Transition", color: "text-purple-400" },
};

const TV_ACTS = [
  { label: "Teaser", fraction: [0, 0.08] },
  { label: "Act 1", fraction: [0.08, 0.32] },
  { label: "Act 2", fraction: [0.32, 0.58] },
  { label: "Act 3", fraction: [0.58, 0.88] },
  { label: "Tag", fraction: [0.88, 1] },
];

const FILM_ACTS = [
  { label: "Act I · Setup", fraction: [0, 0.25], plotPoints: [{ name: "Inciting Incident", pos: 0.12 }] },
  { label: "Act II · Confrontation", fraction: [0.25, 0.75], plotPoints: [{ name: "Midpoint", pos: 0.5 }] },
  { label: "Act III · Resolution", fraction: [0.75, 1], plotPoints: [{ name: "Climax", pos: 0.88 }] },
];

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatTimecode(sec: number, fps = 24): string {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60); const f = Math.floor((sec % 1) * fps);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

function formatTimeOffset(sec: number): string {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60); const ms = Math.round((sec % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function confidenceColor(c: number | null): string {
  if (c === null) return "text-muted-foreground";
  if (c >= 0.85) return "text-segment";
  if (c >= 0.65) return "text-breakpoint";
  return "text-destructive";
}

function confidenceBadgeClasses(c: number | null): string {
  if (c === null) return "bg-muted/30 text-muted-foreground";
  if (c >= 0.85) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (c >= 0.65) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-destructive/20 text-destructive border-destructive/30";
}

function s3UriToUrl(uri: string, region: string): string {
  if (!uri.startsWith("s3://")) return uri;
  const rest = uri.slice(5); const idx = rest.indexOf("/");
  return `https://${rest.slice(0, idx)}.s3.${region}.amazonaws.com/${rest.slice(idx + 1)}`;
}

function formatDurationLong(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

// ─── EDL + OTT export helpers ────────────────────────────────────────────────

function generateEDL(breakpoints: Breakpoint[], title: string): string {
  const lines = ["TITLE: " + title, "FCM: NON-DROP FRAME", ""];
  breakpoints.forEach((bp, i) => {
    const eventNum = String(i + 1).padStart(3, "0");
    const tcIn = formatTimecode(Math.max(0, bp.timestamp_sec - (bp.lead_in_sec ?? 2)));
    const tcOut = formatTimecode(bp.timestamp_sec);
    lines.push(
      `${eventNum}  AX       V     C        ${tcIn} ${tcOut} ${tcIn} ${tcOut}`,
      `* VALLEY_TYPE: ${bp.valley_type || "scene_transition"}`,
      `* REASON: ${bp.reason || "Natural narrative pause detected"}`,
      `* CONFIDENCE: ${bp.confidence !== null ? (bp.confidence > 1 ? bp.confidence : (bp.confidence * 100).toFixed(0)) : "N/A"}%`,
      `* AD_SLOT_DURATION: ${bp.ad_slot_duration_rec ?? 30}s`,
      `* COMPLIANCE: ${bp.compliance_notes || "No specific compliance flags"}`,
      "",
    );
  });
  return lines.join("\n");
}

function generateOTTManifest(breakpoints: Breakpoint[], projectId: string, projectInfo: ProjectInfo) {
  return {
    version: "1.0",
    format: "VMAP",
    generated_at: new Date().toISOString(),
    content_id: projectId,
    content_title: projectInfo.title || "Untitled",
    delivery_target: projectInfo.delivery_target || "broadcast",
    total_duration_sec: projectInfo.duration_sec || 0,
    ad_breaks: breakpoints.map((bp, i) => ({
      ad_slot_id: `${projectId}_slot_${i + 1}`,
      position_sec: bp.timestamp_sec,
      time_offset: formatTimeOffset(bp.timestamp_sec),
      break_type: "linear" as const,
      valley_type: bp.valley_type || "scene_transition",
      confidence: bp.confidence,
      reason: bp.reason || "Natural narrative pause detected",
      compliance_notes: bp.compliance_notes || "No specific compliance flags",
      ad_slot_duration_rec: bp.ad_slot_duration_rec ?? 30,
    })),
  };
}

// ─── Skeleton Components ─────────────────────────────────────────────────────

function VideoSkeleton({ label }: { label: string }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow">
      <div className="relative aspect-video skeleton-shimmer">
        <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-surface-1/90 border-0 text-muted-foreground pointer-events-none z-10">{label}</Badge>
      </div>
    </div>
  );
}

// ─── Content Header ──────────────────────────────────────────────────────────

function ContentHeader({ project, segments, breakpoints, highlights }: { project: ProjectInfo; segments: Segment[]; breakpoints: Breakpoint[]; highlights: Highlight[] }) {
  const ct = project.content_type;
  const meta = project.content_metadata || {};
  const dur = project.duration_sec || 0;

  if (ct === "tv_episode") {
    const seasonEp = meta.season && meta.episode ? `S${String(meta.season).padStart(2, "0")}E${String(meta.episode).padStart(2, "0")}` : null;
    return (
      <div className="glass-panel rounded-2xl px-5 py-3.5 flex items-center gap-4 fade-in-600">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <MonitorPlay className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight text-foreground truncate">{meta.title || project.title}</h1>
            {seasonEp && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">{seasonEp}</Badge>}
            {meta.network && <Badge variant="secondary" className="text-[10px] bg-surface-2/80 text-muted-foreground border-0">{meta.network}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{formatDurationLong(dur)} · {segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights</p>
        </div>
      </div>
    );
  }

  if (ct === "feature_film") {
    return (
      <div className="glass-panel rounded-2xl px-5 py-3.5 flex items-center gap-4 fade-in-600">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <Clapperboard className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight text-foreground truncate">{meta.title || project.title}</h1>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">3-Act Structure</Badge>
            {meta.network && <Badge variant="secondary" className="text-[10px] bg-surface-2/80 text-muted-foreground border-0">{meta.network}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{formatDurationLong(dur)} · {segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights</p>
        </div>
      </div>
    );
  }

  // Short-form — minimal
  return (
    <div className="flex items-center justify-between fade-in-600">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground truncate max-w-md">{project.title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights</p>
      </div>
    </div>
  );
}

// ─── Act Structure Overlay ───────────────────────────────────────────────────

function ActOverlay({ contentType, duration, onSelectAct }: { contentType: string | null; duration: number; onSelectAct: (act: SelectedItem) => void }) {
  if (contentType !== "tv_episode" && contentType !== "feature_film") return null;

  const acts = contentType === "tv_episode" ? TV_ACTS : FILM_ACTS;

  return (
    <div className="relative h-8 mb-1 rounded-lg overflow-visible flex">
      {acts.map((act, i) => {
        const left = act.fraction[0] * 100;
        const width = (act.fraction[1] - act.fraction[0]) * 100;
        return (
          <div key={i} className="relative" style={{ left: `${left}%`, width: `${width}%`, position: "absolute", height: "100%" }}>
            <div
              className="h-full flex items-center justify-center cursor-pointer transition-all hover:bg-[#D4AF37]/10 border-r border-[#D4AF37]/30 last:border-r-0"
              style={{ backgroundColor: i % 2 === 0 ? "rgba(212,175,55,0.05)" : "transparent" }}
              onClick={() => onSelectAct({
                kind: "act",
                data: { label: act.label, start_sec: act.fraction[0] * duration, end_sec: act.fraction[1] * duration, summary: `${act.label} (${formatTime(act.fraction[0] * duration)} – ${formatTime(act.fraction[1] * duration)})` },
              })}
            >
              <span className="text-[9px] font-medium text-[#D4AF37]/80 truncate px-1">{act.label}</span>
            </div>
            {/* Plot point markers for films */}
            {"plotPoints" in act && (act as any).plotPoints?.map((pp: { name: string; pos: number }, j: number) => {
              const ppLeft = ((pp.pos - act.fraction[0]) / (act.fraction[1] - act.fraction[0])) * 100;
              return (
                <TimelineTooltip key={j} content={<span className="text-[10px] font-medium text-[#D4AF37]">{pp.name}</span>}>
                  <div className="absolute top-0 h-full flex items-center" style={{ left: `${ppLeft}%`, transform: "translateX(-50%)" }}>
                    <Diamond className="h-3 w-3 text-[#D4AF37] fill-[#D4AF37]/50" />
                  </div>
                </TimelineTooltip>
              );
            })}
          </div>
        );
      })}
      {/* Vertical dividers */}
      {acts.slice(1).map((act, i) => (
        <div key={`div-${i}`} className="absolute top-0 h-full w-px" style={{ left: `${act.fraction[0] * 100}%`, backgroundColor: "#D4AF37", opacity: 0.4 }} />
      ))}
    </div>
  );
}

// ─── Scene Index Panel ───────────────────────────────────────────────────────

function SceneIndex({ segments, contentType, duration, onSelect }: { segments: Segment[]; contentType: string | null; duration: number; onSelect: (seg: Segment) => void }) {
  const [open, setOpen] = useState(false);

  const groupedSegments = useMemo(() => {
    if (contentType !== "tv_episode" && contentType !== "feature_film") return null;
    const acts = contentType === "tv_episode" ? TV_ACTS : FILM_ACTS;
    return acts.map((act) => ({
      label: act.label,
      segments: segments.filter((s) => {
        const mid = (s.start_sec + s.end_sec) / 2;
        return mid >= act.fraction[0] * duration && mid < act.fraction[1] * duration;
      }),
    }));
  }, [segments, contentType, duration]);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground/80 hover:bg-surface-1/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2"><List className="h-3.5 w-3.5" /> Scene Index</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 max-h-64 overflow-y-auto space-y-1">
          {groupedSegments ? (
            groupedSegments.map((group) => (
              <div key={group.label}>
                <p className="text-[9px] font-bold text-[#D4AF37]/70 uppercase tracking-wider mt-2 mb-1">{group.label}</p>
                {group.segments.map((seg) => (
                  <SceneRow key={seg.id} seg={seg} onClick={() => onSelect(seg)} />
                ))}
                {group.segments.length === 0 && <p className="text-[10px] text-muted-foreground/40 italic">No segments</p>}
              </div>
            ))
          ) : (
            segments.map((seg) => <SceneRow key={seg.id} seg={seg} onClick={() => onSelect(seg)} />)
          )}
        </div>
      )}
    </div>
  );
}

function SceneRow({ seg, onClick }: { seg: Segment; onClick: () => void }) {
  const dur = seg.end_sec - seg.start_sec;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-1/60 transition-colors text-left group">
      <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: SEGMENT_COLORS[seg.type] || "#6B7280" }} />
      <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0">{formatTime(seg.start_sec)}</span>
      <span className="text-[10px] text-foreground capitalize flex-1 truncate group-hover:text-primary transition-colors">{seg.type.replace("_", " ")}</span>
      <span className="text-[10px] text-muted-foreground/50 font-mono">{Math.round(dur)}s</span>
    </button>
  );
}

// ─── Timeline Tooltip ────────────────────────────────────────────────────────

function TimelineTooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  };

  return (
    <div onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} className="relative">
      {children}
      {show && (
        <div className="fixed z-50 glass-tooltip rounded-xl px-3 py-2 pointer-events-none animate-fade-in max-w-[220px]" style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}>
          {content}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Component ──────────────────────────────────────────────────────

function Timeline({
  segments, breakpoints, highlights, duration, selected, contentType, chunks,
  onSelectSegment, onSelectBreakpoint, onSelectHighlight, onSelectAct,
}: {
  segments: Segment[]; breakpoints: Breakpoint[]; highlights: Highlight[];
  duration: number; selected: SelectedItem | null; contentType: string | null; chunks: AnalysisChunk[];
  onSelectSegment: (s: Segment) => void; onSelectBreakpoint: (b: Breakpoint) => void;
  onSelectHighlight: (h: Highlight) => void; onSelectAct: (a: SelectedItem) => void;
}) {
  const maxScore = useMemo(() => Math.max(...highlights.map((h) => h.score || 1), 1), [highlights]);
  const isLong = duration > 1800; // 30 min
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0); // 0..1 representing viewport start
  const timelineRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef(0);

  const viewportFraction = 1 / zoom;
  const viewStart = panOffset;
  const viewEnd = Math.min(panOffset + viewportFraction, 1);
  const visibleStartSec = viewStart * duration;
  const visibleEndSec = viewEnd * duration;
  const visibleDuration = visibleEndSec - visibleStartSec;

  const clampPan = useCallback((p: number) => Math.max(0, Math.min(p, 1 - 1 / zoom)), [zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isLong) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom((z) => Math.min(z + 0.5, 8)); }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom((z) => Math.max(z - 0.5, 1)); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setPanOffset((p) => clampPan(p - 0.05)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setPanOffset((p) => clampPan(p + 0.05)); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isLong, clampPan]);

  useEffect(() => { setPanOffset((p) => clampPan(p)); }, [zoom, clampPan]);

  // Mouse drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    isDragging.current = true;
    dragStart.current = e.clientX;
  }, [zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !timelineRef.current) return;
    const dx = e.clientX - dragStart.current;
    dragStart.current = e.clientX;
    const timelineWidth = timelineRef.current.clientWidth;
    const panDelta = -(dx / timelineWidth) * viewportFraction;
    setPanOffset((p) => clampPan(p + panDelta));
  }, [viewportFraction, clampPan]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const toPercent = useCallback((sec: number) => ((sec - visibleStartSec) / visibleDuration) * 100, [visibleStartSec, visibleDuration]);
  const isVisible = useCallback((sec: number) => sec >= visibleStartSec && sec <= visibleEndSec, [visibleStartSec, visibleEndSec]);

  const timeLabels = useMemo(() => {
    const count = 7;
    const step = visibleDuration / (count - 1);
    return Array.from({ length: count }, (_, i) => formatTime(Math.round(visibleStartSec + i * step)));
  }, [visibleStartSec, visibleDuration]);

  return (
    <div className="glass-panel-elevated rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-xs tracking-wide uppercase text-foreground/80">Sequence Intelligence Timeline</h2>
        <div className="flex items-center gap-2">
          {isLong && zoom > 1 && (
            <span className="text-[10px] font-mono text-primary/60">{zoom.toFixed(1)}×</span>
          )}
          <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">Interactive Mode</Badge>
        </div>
      </div>

      {/* Act Structure Overlay */}
      <ActOverlay contentType={contentType} duration={duration} onSelectAct={onSelectAct} />

      <div
        ref={timelineRef}
        className={`${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Layer 1: Segments */}
        <div className="relative h-10 bg-surface-0/60 rounded-xl overflow-visible border border-border/20 mb-2">
          {segments.filter((s) => s.end_sec > visibleStartSec && s.start_sec < visibleEndSec).map((seg) => {
            const left = Math.max(0, toPercent(seg.start_sec));
            const right = Math.min(100, toPercent(seg.end_sec));
            const width = right - left;
            const color = SEGMENT_COLORS[seg.type] || "#6B7280";
            const isSelected = selected?.kind === "segment" && selected.data.id === seg.id;

            return (
              <TimelineTooltip key={seg.id} content={
                <div className="text-[10px]">
                  <p className="font-semibold text-foreground capitalize">{seg.type.replace("_", " ")}</p>
                  <p className="text-muted-foreground font-mono">{formatTime(seg.start_sec)} → {formatTime(seg.end_sec)}</p>
                  {seg.summary && <p className="text-muted-foreground mt-1 line-clamp-2">{seg.summary}</p>}
                </div>
              }>
                <div
                  className={`absolute top-1 bottom-1 rounded-lg cursor-pointer transition-all duration-200 timeline-segment-glow ${isSelected ? "opacity-100 ring-1 ring-white/40" : "opacity-60 hover:opacity-90"}`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: color, color }}
                  onClick={() => onSelectSegment(seg)}
                />
              </TimelineTooltip>
            );
          })}

          {/* Chunk boundary indicators */}
          {chunks.length > 1 && chunks.slice(1).map((chunk) => {
            if (!isVisible(chunk.start_sec)) return null;
            return (
              <TimelineTooltip key={`chunk-${chunk.id}`} content={
                <div className="text-[10px]">
                  <p className="font-medium text-muted-foreground">Analysis chunk boundary</p>
                  <p className="text-muted-foreground/60">Overlap zone: {formatTime(chunk.overlap_start_sec || chunk.start_sec)} – {formatTime(chunk.overlap_end_sec || chunk.start_sec)}</p>
                </div>
              }>
                <div
                  className="absolute top-0 h-full border-l border-dashed border-muted-foreground/25"
                  style={{ left: `${toPercent(chunk.start_sec)}%` }}
                />
              </TimelineTooltip>
            );
          })}
        </div>

        {/* Layer 2: Breakpoints */}
        <div className="relative h-7 mb-1">
          {breakpoints.filter((bp) => isVisible(bp.timestamp_sec)).map((bp) => {
            const left = toPercent(bp.timestamp_sec);
            const isSelected = selected?.kind === "breakpoint" && selected.data.id === bp.id;
            return (
              <TimelineTooltip key={bp.id} content={
                <div className="text-[10px]">
                  <p className="font-semibold" style={{ color: "#F59E0B" }}>Breakpoint</p>
                  <p className="text-muted-foreground font-mono">{formatTime(bp.timestamp_sec)}</p>
                  {bp.valley_type && <p className="text-muted-foreground capitalize">{bp.valley_type.replace("_", " ")}</p>}
                  {bp.reason && <p className="text-muted-foreground mt-1 line-clamp-2">{bp.reason}</p>}
                </div>
              }>
                <div className={`absolute top-0 cursor-pointer transition-all duration-200 hover:scale-150 ${isSelected ? "scale-150 drop-shadow-[0_0_6px_#F59E0B]" : ""}`} style={{ left: `${left}%`, transform: "translateX(-50%)" }} onClick={() => onSelectBreakpoint(bp)}>
                  <Zap className="h-5 w-5" style={{ color: "#F59E0B" }} fill={isSelected ? "#F59E0B" : "none"} />
                </div>
              </TimelineTooltip>
            );
          })}
        </div>

        {/* Layer 3: Highlights */}
        <div className="relative h-7 mb-1">
          {highlights.filter((hl) => isVisible(hl.start_sec)).map((hl) => {
            const left = toPercent(hl.start_sec);
            const scoreFrac = (hl.score || 0) / maxScore;
            const size = 14 + scoreFrac * 8;
            const isSelected = selected?.kind === "highlight" && selected.data.id === hl.id;
            return (
              <TimelineTooltip key={hl.id} content={
                <div className="text-[10px]">
                  <p className="font-semibold" style={{ color: "#8B5CF6" }}>Highlight #{hl.rank_order ?? "—"}</p>
                  <p className="text-muted-foreground font-mono">{formatTime(hl.start_sec)} → {formatTime(hl.end_sec)}</p>
                  <p className="text-muted-foreground">Score: {hl.score ?? "—"}</p>
                </div>
              }>
                <div className={`absolute top-0 cursor-pointer transition-all duration-200 hover:scale-150 ${isSelected ? "scale-150 drop-shadow-[0_0_6px_#8B5CF6]" : ""}`} style={{ left: `${left}%`, transform: "translateX(-50%)" }} onClick={() => onSelectHighlight(hl)}>
                  <Star style={{ width: size, height: size, color: "#8B5CF6" }} fill={isSelected ? "#8B5CF6" : "none"} />
                </div>
              </TimelineTooltip>
            );
          })}
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/60 px-0.5 font-mono">
        {timeLabels.map((t, i) => <span key={i}>{t}</span>)}
      </div>

      {/* Minimap + Zoom for long videos */}
      {isLong && (
        <div className="mt-3 pt-3 border-t border-border/15 space-y-2">
          {/* Minimap */}
          <div className="relative h-5 bg-surface-0/60 rounded-lg overflow-hidden border border-border/20">
            {segments.map((seg) => {
              const left = (seg.start_sec / duration) * 100;
              const width = ((seg.end_sec - seg.start_sec) / duration) * 100;
              return <div key={seg.id} className="absolute top-0 h-full opacity-40" style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%`, backgroundColor: SEGMENT_COLORS[seg.type] || "#6B7280" }} />;
            })}
            {/* Viewport indicator */}
            <div
              className="absolute top-0 h-full border border-primary/50 bg-primary/10 rounded-sm"
              style={{ left: `${viewStart * 100}%`, width: `${viewportFraction * 100}%` }}
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}>
              <Minus className="h-3 w-3" />
            </Button>
            <Slider value={[zoom]} min={1} max={8} step={0.5} onValueChange={([v]) => setZoom(v)} className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}>
              <Plus className="h-3 w-3" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground/50 w-8">{zoom.toFixed(1)}×</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-border/15 text-[10px] text-muted-foreground">
        {Object.entries(SEGMENT_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
            {SEGMENT_LABELS[type] || type}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" style={{ color: "#F59E0B" }} /> Breakpoint</span>
        <span className="flex items-center gap-1.5"><Star className="h-3 w-3" style={{ color: "#8B5CF6" }} /> Highlight</span>
        {chunks.length > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px border-l border-dashed border-muted-foreground/40" /> Chunk Boundary
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Breakpoint Storyboard ───────────────────────────────────────────────────

function BreakpointStoryboard({ breakpoints, selected, currentTime, onCardClick }: { breakpoints: Breakpoint[]; selected: SelectedItem | null; currentTime: number; onCardClick: (bp: Breakpoint) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine which card is "active" based on current playback position
  const activeCardId = useMemo(() => {
    for (let i = breakpoints.length - 1; i >= 0; i--) {
      const bp = breakpoints[i];
      const leadIn = bp.lead_in_sec ?? 3;
      const start = bp.timestamp_sec - leadIn - 5;
      const end = bp.timestamp_sec + 5;
      if (currentTime >= start && currentTime <= end) return bp.id;
    }
    return null;
  }, [breakpoints, currentTime]);

  return (
    <div className="glass-panel-elevated rounded-2xl p-5">
      <h2 className="font-semibold text-xs tracking-wide uppercase text-foreground/80 mb-4 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-breakpoint" /> Ad-Break Storyboard
      </h2>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
        {breakpoints.map((bp, i) => {
          const isSelected = selected?.kind === "breakpoint" && selected.data.id === bp.id;
          const isActive = activeCardId === bp.id;
          const valley = VALLEY_CONFIG[bp.valley_type || ""] || VALLEY_CONFIG.scene_transition;
          const ValleyIcon = valley.icon;
          const confNorm = bp.confidence !== null ? (bp.confidence! > 1 ? bp.confidence! / 100 : bp.confidence) : null;

          // Confidence badge color
          const confBadgeBg = confNorm === null ? "bg-muted/30"
            : confNorm >= 0.85 ? "bg-[#10B981]/20"
            : confNorm >= 0.65 ? "bg-[#F59E0B]/20"
            : "bg-[#EF4444]/20";
          const confBadgeText = confNorm === null ? "text-muted-foreground"
            : confNorm >= 0.85 ? "text-[#10B981]"
            : confNorm >= 0.65 ? "text-[#F59E0B]"
            : "text-[#EF4444]";
          const confBadgeBorder = confNorm === null ? "border-muted/30"
            : confNorm >= 0.85 ? "border-[#10B981]/30"
            : confNorm >= 0.65 ? "border-[#F59E0B]/30"
            : "border-[#EF4444]/30";

          return (
            <div
              key={bp.id}
              onClick={() => onCardClick(bp)}
              className={`flex-shrink-0 w-[220px] p-4 rounded-xl cursor-pointer transition-all duration-300 glass-tooltip border-2
                ${isActive ? "storyboard-card-active" : ""}
                ${isSelected ? "border-primary/60 ring-1 ring-primary/30 scale-[1.03]" : "border-border/20 hover:border-border/40 hover:scale-[1.01]"}
              `}
            >
              {/* Header: Break # + Timestamp */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">BREAK {i + 1}</span>
                <span className="text-sm font-mono font-bold text-foreground">{formatTime(bp.timestamp_sec)}</span>
              </div>

              {/* Valley Type Icon — Large */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-surface-1/80 flex items-center justify-center shrink-0 border border-border/20">
                  <ValleyIcon className={`h-[32px] w-[32px] ${valley.color}`} strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-foreground block">{valley.label}</span>
                  <span className="text-[10px] text-muted-foreground">Narrative Valley</span>
                </div>
              </div>

              {/* Confidence Badge + Ad Slot */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${confBadgeBg} ${confBadgeText} ${confBadgeBorder}`}>
                  {confNorm !== null ? `${(confNorm * 100).toFixed(0)}%` : "—"}
                </span>
                {bp.ad_slot_duration_rec && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Timer className="h-3 w-3" />{bp.ad_slot_duration_rec}s
                  </span>
                )}
              </div>

              {/* Reason — 2-line truncated */}
              {bp.reason && (
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-2 mb-2">{bp.reason}</p>
              )}

              {/* Compliance Notes */}
              {bp.compliance_notes && (
                <div className="flex items-start gap-1.5 pt-2 border-t border-border/15">
                  <Shield className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <p className="text-[9px] text-muted-foreground/50 line-clamp-1 leading-relaxed">{bp.compliance_notes}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ selected, onExportJSON, onDownloadMasterPackage }: {
  selected: SelectedItem | null; onExportJSON: () => void; onDownloadMasterPackage: () => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-16 overflow-auto">
      <div>
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">{selected ? "Element Detail" : "Select an Element"}</h3>
        {!selected ? (
          <p className="text-xs text-muted-foreground/60 leading-relaxed">Click any segment, breakpoint, or highlight on the timeline to inspect it.</p>
        ) : selected.kind === "segment" ? (
          <div className="animate-fade-in"><SegmentDetail seg={selected.data} /></div>
        ) : selected.kind === "breakpoint" ? (
          <div className="animate-fade-in"><BreakpointDetail bp={selected.data} /></div>
        ) : selected.kind === "highlight" ? (
          <div className="animate-fade-in"><HighlightDetail hl={selected.data} /></div>
        ) : selected.kind === "act" ? (
          <div className="animate-fade-in">
            <Row label="Structure" value={selected.data.label} />
            <Row label="Range" value={`${formatTime(selected.data.start_sec)} → ${formatTime(selected.data.end_sec)}`} mono />
            <ReasonBox title="Act Summary" text={selected.data.summary} />
          </div>
        ) : null}
      </div>
      <div className="border-t border-border/20 pt-4 mt-auto">
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">Export</h3>
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" className="w-full gap-2 rounded-xl text-xs h-8 border-border/40 hover:border-primary/40 hover:bg-primary/5 btn-hover" onClick={onExportJSON}><FileJson className="h-3.5 w-3.5" /> Export JSON</Button>
          <Button variant="outline" size="sm" className="w-full gap-2 rounded-xl text-xs h-8 border-border/40 hover:border-primary/40 hover:bg-primary/5 btn-hover" onClick={onDownloadMasterPackage}><Package className="h-3.5 w-3.5" /> Download Master Package</Button>
        </div>
      </div>
    </div>
  );
}

function SegmentDetail({ seg }: { seg: Segment }) {
  return (<div className="space-y-2.5 text-xs"><Row label="Type" value={seg.type.replace("_", " ")} /><Row label="Time" value={`${formatTime(seg.start_sec)} → ${formatTime(seg.end_sec)}`} mono /><ConfidenceRow value={seg.confidence} />{seg.summary && <ReasonBox title="AI Summary" text={seg.summary} />}</div>);
}

function BreakpointDetail({ bp }: { bp: Breakpoint }) {
  const valley = VALLEY_CONFIG[bp.valley_type || ""];
  const ValleyIcon = valley?.icon || Zap;
  return (
    <div className="space-y-2.5 text-xs">
      {valley && (
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-0/60 border border-border/20">
          <div className="h-8 w-8 rounded-lg bg-surface-1/80 flex items-center justify-center"><ValleyIcon className={`h-4 w-4 ${valley.color}`} /></div>
          <div><p className="font-semibold text-foreground text-[11px]">{valley.label}</p><p className="text-[10px] text-muted-foreground">Narrative Valley</p></div>
        </div>
      )}
      <Row label="Timestamp" value={formatTime(bp.timestamp_sec)} mono />
      {bp.lead_in_sec != null && <Row label="Lead-In" value={formatTime(bp.lead_in_sec)} mono />}
      <ConfidenceRow value={bp.confidence} />
      {bp.ad_slot_duration_rec && <Row label="Ad Slot Rec." value={`${bp.ad_slot_duration_rec}s`} />}
      {bp.reason && <ReasonBox title="Why This Break" text={bp.reason} />}
      {bp.compliance_notes && <ReasonBox title="Compliance Notes" text={bp.compliance_notes} />}
    </div>
  );
}

function HighlightDetail({ hl }: { hl: Highlight }) {
  return (<div className="space-y-2.5 text-xs"><Row label="Rank" value={`#${hl.rank_order ?? "—"}`} /><Row label="Time" value={`${formatTime(hl.start_sec)} → ${formatTime(hl.end_sec)}`} mono /><Row label="Score" value={String(hl.score ?? "—")} /><ConfidenceRow value={hl.score} />{hl.reason && <ReasonBox title="Why This Highlight" text={hl.reason} />}</div>);
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (<div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={`font-medium text-foreground capitalize ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span></div>);
}

function ConfidenceRow({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = value > 1 ? value : value * 100;
  return (<div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className={`font-semibold ${confidenceColor(value > 1 ? value / 100 : value)}`}>{pct.toFixed(1)}%</span></div>);
}

function ReasonBox({ title, text }: { title: string; text: string }) {
  return (<div className="mt-2 p-3 rounded-xl bg-surface-0/60 border border-border/20"><p className="text-[10px] font-medium text-accent mb-1 uppercase tracking-wide">{title}</p><p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p></div>);
}

// ─── Main Component ──────────────────────────────────────────────────────────

const Results = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({ title: "", content_type: null, content_metadata: null, delivery_target: null, duration_sec: null });
  const [chunks, setChunks] = useState<AnalysisChunk[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  // Track video playback position
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => setCurrentTime(vid.currentTime);
    vid.addEventListener("timeupdate", onTime);
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [videoUrl]);

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const fetchAll = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const [projRes, vidRes, segRes, bpRes, hlRes, expRes, chunkRes] = await Promise.all([
          supabase.from("projects").select("title, content_type, content_metadata, delivery_target, duration_sec").eq("id", projectId).single(),
          supabase.from("videos").select("s3_uri, duration_sec").eq("project_id", projectId).single(),
          supabase.from("segments").select("*").eq("project_id", projectId).order("start_sec"),
          supabase.from("breakpoints").select("*").eq("project_id", projectId).order("timestamp_sec"),
          supabase.from("highlights").select("*").eq("project_id", projectId).order("score", { ascending: false }),
          supabase.from("exports").select("file_url").eq("project_id", projectId).eq("type", "reel").order("created_at", { ascending: false }).limit(1),
          supabase.from("analysis_chunks").select("id, chunk_index, start_sec, end_sec, overlap_start_sec, overlap_end_sec").eq("project_id", projectId).order("chunk_index"),
        ]);

        if (projRes.error) {
          console.error("[Results] Failed to fetch project:", projRes.error.message);
          setFetchError("Project not found or could not be loaded.");
          setLoading(false);
          return;
        }

        if (projRes.data) setProjectInfo(projRes.data as ProjectInfo);
        if (vidRes.data) { setVideoUrl(s3UriToUrl(vidRes.data.s3_uri || "", "us-east-1")); setTotalDuration(Number(vidRes.data.duration_sec) || 0); }
        if (segRes.data) setSegments(segRes.data as Segment[]);
        if (bpRes.data) setBreakpoints(bpRes.data as Breakpoint[]);
        if (hlRes.data) setHighlights(hlRes.data as Highlight[]);
        if (expRes.data?.[0]?.file_url) setReelUrl(expRes.data[0].file_url);
        if (chunkRes.data) setChunks(chunkRes.data as AnalysisChunk[]);

        // Warn if no analysis data found
        if ((!segRes.data || segRes.data.length === 0) && (!bpRes.data || bpRes.data.length === 0)) {
          console.warn("[Results] No segments or breakpoints found for project", projectId);
          setFetchError("No analysis data found for this project. The analysis may still be processing.");
        }
      } catch (err: any) {
        console.error("[Results] Unexpected fetch error:", err);
        setFetchError("Failed to load results. Please check your connection and try again.");
      }
      setLoading(false);
    };
    fetchAll();
  }, [projectId]);

  const duration = useMemo(() => {
    if (totalDuration > 0) return totalDuration;
    if (segments.length === 0) return 600;
    return Math.max(...segments.map((s) => s.end_sec));
  }, [totalDuration, segments]);

  const seekTo = useCallback((sec: number) => { if (videoRef.current) { videoRef.current.currentTime = sec; videoRef.current.play().catch(() => {}); } }, []);
  const handleSelectSegment = useCallback((seg: Segment) => { setSelected({ kind: "segment", data: seg }); seekTo(seg.start_sec); }, [seekTo]);
  const handleSelectBreakpoint = useCallback((bp: Breakpoint) => { setSelected({ kind: "breakpoint", data: bp }); seekTo(bp.timestamp_sec); }, [seekTo]);
  const handleSelectHighlight = useCallback((hl: Highlight) => { setSelected({ kind: "highlight", data: hl }); seekTo(hl.start_sec); }, [seekTo]);
  const handleSelectAct = useCallback((act: SelectedItem) => { setSelected(act); if (act.kind === "act") seekTo(act.data.start_sec); }, [seekTo]);
  const handleBreakpointCardClick = useCallback((bp: Breakpoint) => { setSelected({ kind: "breakpoint", data: bp }); seekTo(Math.max(0, bp.timestamp_sec - 10)); }, [seekTo]);

  const handleExportJSON = useCallback(() => {
    const data = { segments, breakpoints, highlights };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `storybreak-${projectId}.json`; a.click(); URL.revokeObjectURL(url);
  }, [segments, breakpoints, highlights, projectId]);

  const handleDownloadReel = useCallback(() => { if (reelUrl) window.open(reelUrl, "_blank"); }, [reelUrl]);

  const handleDownloadMasterPackage = useCallback(() => {
    const safeTitle = (projectInfo.title || "StoryBreak-Export").replace(/[^a-zA-Z0-9_-]/g, "_");
    const edl = generateEDL(breakpoints, projectInfo.title || "StoryBreak Export");
    const ott = generateOTTManifest(breakpoints, projectId || "", projectInfo);

    const edlBlob = new Blob([edl], { type: "text/plain" });
    const ottBlob = new Blob([JSON.stringify(ott, null, 2)], { type: "application/json" });

    const edlUrl = URL.createObjectURL(edlBlob);
    const edlA = document.createElement("a"); edlA.href = edlUrl; edlA.download = `${safeTitle}-breakpoints.edl`; edlA.click(); URL.revokeObjectURL(edlUrl);

    setTimeout(() => {
      const ottUrl = URL.createObjectURL(ottBlob);
      const ottA = document.createElement("a"); ottA.href = ottUrl; ottA.download = `${safeTitle}-ott-manifest.json`; ottA.click(); URL.revokeObjectURL(ottUrl);
      toast({ title: "Master Package exported", description: "EDL + OTT Manifest downloaded successfully." });
    }, 300);
  }, [breakpoints, projectInfo, projectId]);

  if (!projectId) return <DemoResults />;

  if (fetchError && !loading && segments.length === 0 && breakpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 max-w-xl mx-auto animate-fade-in">
        <div className="glass-panel rounded-2xl p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-2">Unable to Load Results</h2>
          <p className="text-sm text-muted-foreground mb-4">{fetchError}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/")}>← New Analysis</Button>
            <Button size="sm" className="text-xs" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col px-4 py-4 max-w-[1400px] mx-auto gap-4 animate-fade-in">
        <div className="h-14 rounded-2xl skeleton-shimmer" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4">
          <VideoSkeleton label="Source Video" /><VideoSkeleton label="AI Highlight Reel" />
          <div className="glass-panel rounded-2xl p-4"><div className="h-3 w-24 rounded skeleton-shimmer mb-4" /><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-3 rounded skeleton-shimmer" style={{ width: `${80 - i * 10}%` }} />)}</div></div>
        </div>
        <div className="h-48 rounded-2xl skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 py-4 max-w-[1400px] mx-auto gap-4 animate-fade-in">
      {/* Content Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <ContentHeader project={projectInfo} segments={segments} breakpoints={breakpoints} highlights={highlights} />
        </div>
        <Button variant="ghost" size="sm" className="text-xs rounded-lg text-muted-foreground btn-hover shrink-0" onClick={() => navigate("/")}>← New Analysis</Button>
      </div>

      {/* Video Panels + Detail + Scene Index */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] xl:grid-cols-[1fr_1fr_320px] gap-4">
        {/* Source Video */}
        <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow fade-in-600 fade-in-delay-1">
          <div className="relative">
            {videoUrl ? <video ref={videoRef} src={videoUrl} className="w-full aspect-video bg-surface-0 object-contain" controls preload="metadata" /> : <div className="aspect-video bg-surface-0 flex items-center justify-center"><Play className="h-6 w-6 text-muted-foreground/40" /></div>}
            <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-surface-1/90 border-0 text-muted-foreground pointer-events-none">Source Video</Badge>
          </div>
        </div>

        {/* Analysis Summary Panel */}
        <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow fade-in-600 fade-in-delay-2">
          <div className="aspect-video bg-primary/[0.02] flex flex-col items-center justify-center gap-3 p-6">
            <Sparkles className="h-8 w-8 text-primary/40" />
            <p className="text-sm font-semibold text-foreground">Analysis Complete</p>
            <p className="text-xs text-muted-foreground text-center">{segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights detected</p>
          </div>
        </div>

        {/* Detail Panel + Scene Index */}
        <div className="fade-in-600 fade-in-delay-3 space-y-4">
          <DetailPanel selected={selected} onExportJSON={handleExportJSON} onDownloadMasterPackage={handleDownloadMasterPackage} />
          <SceneIndex segments={segments} contentType={projectInfo.content_type} duration={duration} onSelect={handleSelectSegment} />
        </div>
      </div>

      {/* Breakpoint Storyboard */}
      {breakpoints.length > 0 && (
        <div className="fade-in-600 fade-in-delay-2">
          <BreakpointStoryboard breakpoints={breakpoints} selected={selected} currentTime={currentTime} onCardClick={handleBreakpointCardClick} />
        </div>
      )}

      {/* Timeline */}
      <div className="fade-in-600 fade-in-delay-3">
        <Timeline
          segments={segments} breakpoints={breakpoints} highlights={highlights}
          duration={duration} selected={selected} contentType={projectInfo.content_type} chunks={chunks}
          onSelectSegment={handleSelectSegment} onSelectBreakpoint={handleSelectBreakpoint}
          onSelectHighlight={handleSelectHighlight} onSelectAct={handleSelectAct}
        />
      </div>
    </div>
  );
};

function DemoResults() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <Sparkles className="h-10 w-10 text-primary/40 mb-4" />
      <h1 className="text-xl font-bold text-foreground mb-2">No Project Selected</h1>
      <p className="text-sm text-muted-foreground mb-6">Upload a video to see AI analysis results here.</p>
      <Button className="rounded-xl glow-blue btn-hover" onClick={() => navigate("/")}>Upload Video</Button>
    </div>
  );
}

export default Results;
