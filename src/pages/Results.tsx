import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Play, Sparkles, Star, Download, FileJson, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Segment {
  id: string;
  start_sec: number;
  end_sec: number;
  type: string;
  summary: string | null;
  confidence: number | null;
}

interface Breakpoint {
  id: string;
  timestamp_sec: number;
  type: string | null;
  reason: string | null;
  confidence: number | null;
}

interface Highlight {
  id: string;
  start_sec: number;
  end_sec: number;
  score: number | null;
  reason: string | null;
  rank_order: number | null;
}

type SelectedItem =
  | { kind: "segment"; data: Segment }
  | { kind: "breakpoint"; data: Breakpoint }
  | { kind: "highlight"; data: Highlight };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  opening: "#3B82F6",
  story_unit: "#10B981",
  transition: "#6B7280",
  climax: "#EF4444",
  resolution: "#8B5CF6",
};

const SEGMENT_LABELS: Record<string, string> = {
  opening: "Opening",
  story_unit: "Story Unit",
  transition: "Transition",
  climax: "Climax",
  resolution: "Resolution",
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function confidenceColor(c: number | null): string {
  if (c === null) return "text-muted-foreground";
  if (c >= 0.85) return "text-segment";
  if (c >= 0.65) return "text-breakpoint";
  return "text-destructive";
}

function s3UriToUrl(uri: string, region: string): string {
  if (!uri.startsWith("s3://")) return uri;
  const rest = uri.slice(5);
  const idx = rest.indexOf("/");
  const bucket = rest.slice(0, idx);
  const key = rest.slice(idx + 1);
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// ─── Skeleton Components ─────────────────────────────────────────────────────

function VideoSkeleton({ label }: { label: string }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow">
      <div className="relative aspect-video skeleton-shimmer">
        <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-surface-1/90 border-0 text-muted-foreground pointer-events-none z-10">
          {label}
        </Badge>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="glass-panel-elevated rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-48 rounded skeleton-shimmer" />
        <div className="h-4 w-24 rounded-full skeleton-shimmer" />
      </div>
      <div className="h-10 rounded-xl skeleton-shimmer mb-1" />
      <div className="h-6 rounded skeleton-shimmer mb-1 opacity-60" />
      <div className="h-6 rounded skeleton-shimmer mb-1 opacity-40" />
      <div className="flex justify-between mt-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-2 w-8 rounded skeleton-shimmer" />
        ))}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    if (!projectId) return;

    const fetchAll = async () => {
      setLoading(true);

      const [projRes, vidRes, segRes, bpRes, hlRes, expRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("videos").select("s3_uri, duration_sec").eq("project_id", projectId).single(),
        supabase.from("segments").select("*").eq("project_id", projectId).order("start_sec"),
        supabase.from("breakpoints").select("*").eq("project_id", projectId).order("timestamp_sec"),
        supabase.from("highlights").select("*").eq("project_id", projectId).order("score", { ascending: false }),
        supabase.from("exports").select("file_url").eq("project_id", projectId).eq("type", "reel").order("created_at", { ascending: false }).limit(1),
      ]);

      if (projRes.data) setProjectTitle(projRes.data.title);
      if (vidRes.data) {
        const url = s3UriToUrl(vidRes.data.s3_uri || "", "us-east-1");
        setVideoUrl(url);
        setTotalDuration(Number(vidRes.data.duration_sec) || 0);
      }
      if (segRes.data) setSegments(segRes.data as Segment[]);
      if (bpRes.data) setBreakpoints(bpRes.data as Breakpoint[]);
      if (hlRes.data) setHighlights(hlRes.data as Highlight[]);
      if (expRes.data?.[0]?.file_url) setReelUrl(expRes.data[0].file_url);

      setLoading(false);
    };

    fetchAll();
  }, [projectId]);

  const duration = useMemo(() => {
    if (totalDuration > 0) return totalDuration;
    if (segments.length === 0) return 600;
    return Math.max(...segments.map((s) => s.end_sec));
  }, [totalDuration, segments]);

  const seekTo = useCallback((sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const handleSelectSegment = useCallback((seg: Segment) => {
    setSelected({ kind: "segment", data: seg });
    seekTo(seg.start_sec);
  }, [seekTo]);

  const handleSelectBreakpoint = useCallback((bp: Breakpoint) => {
    setSelected({ kind: "breakpoint", data: bp });
    seekTo(bp.timestamp_sec);
  }, [seekTo]);

  const handleSelectHighlight = useCallback((hl: Highlight) => {
    setSelected({ kind: "highlight", data: hl });
    seekTo(hl.start_sec);
  }, [seekTo]);

  const handleExportJSON = useCallback(() => {
    const data = { segments, breakpoints, highlights };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storybreak-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [segments, breakpoints, highlights, projectId]);

  const handleDownloadReel = useCallback(() => {
    if (!reelUrl) return;
    window.open(reelUrl, "_blank");
  }, [reelUrl]);

  if (!projectId) return <DemoResults />;

  if (loading) {
    return (
      <div className="flex flex-col px-4 py-4 max-w-[1400px] mx-auto gap-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 w-48 rounded skeleton-shimmer mb-2" />
            <div className="h-3 w-32 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4">
          <VideoSkeleton label="Source Video" />
          <VideoSkeleton label="AI Highlight Reel" />
          <div className="glass-panel rounded-2xl p-4">
            <div className="h-3 w-24 rounded skeleton-shimmer mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-3 rounded skeleton-shimmer" style={{ width: `${80 - i * 10}%` }} />
              ))}
            </div>
          </div>
        </div>
        <TimelineSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 py-4 max-w-[1400px] mx-auto gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between fade-in-600">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground truncate max-w-md">{projectTitle || "Analysis Results"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs rounded-lg text-muted-foreground btn-hover" onClick={() => navigate("/")}>
          ← New Analysis
        </Button>
      </div>

      {/* Video Panels + Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] xl:grid-cols-[1fr_1fr_320px] gap-4">
        {/* Source Video */}
        <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow fade-in-600 fade-in-delay-1">
          <div className="relative">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full aspect-video bg-surface-0 object-contain"
                controls
                preload="metadata"
              />
            ) : (
              <div className="aspect-video bg-surface-0 flex items-center justify-center">
                <Play className="h-6 w-6 text-muted-foreground/40" />
              </div>
            )}
            <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-surface-1/90 border-0 text-muted-foreground pointer-events-none">
              Source Video
            </Badge>
          </div>
        </div>

        {/* Highlight Reel */}
        <div className="glass-panel rounded-2xl overflow-hidden glow-blue cinematic-shadow fade-in-600 fade-in-delay-2">
          <div className="relative">
            {reelUrl ? (
              <video
                src={reelUrl}
                className="w-full aspect-video bg-primary/[0.02] object-contain"
                controls
                preload="metadata"
              />
            ) : (
              <div className="aspect-video bg-primary/[0.02] flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary/40" />
              </div>
            )}
            <Badge className="absolute top-2 left-2 text-[10px] bg-accent/90 text-accent-foreground border-0 pointer-events-none">
              AI Highlight Reel
            </Badge>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="fade-in-600 fade-in-delay-3">
          <DetailPanel
            selected={selected}
            onExportJSON={handleExportJSON}
            onDownloadReel={handleDownloadReel}
            reelUrl={reelUrl}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="fade-in-600 fade-in-delay-3">
        <Timeline
          segments={segments}
          breakpoints={breakpoints}
          highlights={highlights}
          duration={duration}
          selected={selected}
          onSelectSegment={handleSelectSegment}
          onSelectBreakpoint={handleSelectBreakpoint}
          onSelectHighlight={handleSelectHighlight}
        />
      </div>
    </div>
  );
};

// ─── Timeline Tooltip ────────────────────────────────────────────────────────

function TimelineTooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
      className="relative"
    >
      {children}
      {show && (
        <div
          className="fixed z-50 glass-tooltip rounded-xl px-3 py-2 pointer-events-none animate-fade-in max-w-[220px]"
          style={{
            left: pos.x,
            top: pos.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Component ──────────────────────────────────────────────────────

function Timeline({
  segments,
  breakpoints,
  highlights,
  duration,
  selected,
  onSelectSegment,
  onSelectBreakpoint,
  onSelectHighlight,
}: {
  segments: Segment[];
  breakpoints: Breakpoint[];
  highlights: Highlight[];
  duration: number;
  selected: SelectedItem | null;
  onSelectSegment: (s: Segment) => void;
  onSelectBreakpoint: (b: Breakpoint) => void;
  onSelectHighlight: (h: Highlight) => void;
}) {
  const maxScore = useMemo(() => Math.max(...highlights.map((h) => h.score || 1), 1), [highlights]);

  const timeLabels = useMemo(() => {
    const count = 7;
    const step = duration / (count - 1);
    return Array.from({ length: count }, (_, i) => formatTime(Math.round(i * step)));
  }, [duration]);

  return (
    <div className="glass-panel-elevated rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-xs tracking-wide uppercase text-foreground/80">
          Sequence Intelligence Timeline
        </h2>
        <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">
          Interactive Mode
        </Badge>
      </div>

      {/* Layer 1: Segments */}
      <div className="relative h-10 bg-surface-0/60 rounded-xl overflow-visible border border-border/20 mb-2">
        {segments.map((seg) => {
          const left = (seg.start_sec / duration) * 100;
          const width = ((seg.end_sec - seg.start_sec) / duration) * 100;
          const color = SEGMENT_COLORS[seg.type] || "#6B7280";
          const isSelected = selected?.kind === "segment" && selected.data.id === seg.id;

          return (
            <TimelineTooltip
              key={seg.id}
              content={
                <div className="text-[10px]">
                  <p className="font-semibold text-foreground capitalize">{seg.type.replace("_", " ")}</p>
                  <p className="text-muted-foreground font-mono">{formatTime(seg.start_sec)} → {formatTime(seg.end_sec)}</p>
                  {seg.summary && <p className="text-muted-foreground mt-1 line-clamp-2">{seg.summary}</p>}
                </div>
              }
            >
              <div
                className={`absolute top-1 bottom-1 rounded-lg cursor-pointer transition-all duration-200 timeline-segment-glow ${
                  isSelected ? "opacity-100 ring-1 ring-white/40" : "opacity-60 hover:opacity-90"
                }`}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.5)}%`,
                  backgroundColor: color,
                  color: color,
                }}
                onClick={() => onSelectSegment(seg)}
              />
            </TimelineTooltip>
          );
        })}
      </div>

      {/* Layer 2: Breakpoints */}
      <div className="relative h-7 mb-1">
        {breakpoints.map((bp) => {
          const left = (bp.timestamp_sec / duration) * 100;
          const isSelected = selected?.kind === "breakpoint" && selected.data.id === bp.id;

          return (
            <TimelineTooltip
              key={bp.id}
              content={
                <div className="text-[10px]">
                  <p className="font-semibold" style={{ color: "#F59E0B" }}>Breakpoint</p>
                  <p className="text-muted-foreground font-mono">{formatTime(bp.timestamp_sec)}</p>
                  <p className="text-muted-foreground capitalize">{(bp.type || "").replace("_", " ")}</p>
                  {bp.reason && <p className="text-muted-foreground mt-1 line-clamp-2">{bp.reason}</p>}
                </div>
              }
            >
              <div
                className={`absolute top-0 cursor-pointer transition-all duration-200 hover:scale-150 ${
                  isSelected ? "scale-150 drop-shadow-[0_0_6px_#F59E0B]" : ""
                }`}
                style={{ left: `${left}%`, transform: `translateX(-50%)` }}
                onClick={() => onSelectBreakpoint(bp)}
              >
                <Zap
                  className="h-5 w-5"
                  style={{ color: "#F59E0B" }}
                  fill={isSelected ? "#F59E0B" : "none"}
                />
              </div>
            </TimelineTooltip>
          );
        })}
      </div>

      {/* Layer 3: Highlights */}
      <div className="relative h-7 mb-1">
        {highlights.map((hl) => {
          const left = (hl.start_sec / duration) * 100;
          const scoreFrac = (hl.score || 0) / maxScore;
          const size = 14 + scoreFrac * 8;
          const isSelected = selected?.kind === "highlight" && selected.data.id === hl.id;

          return (
            <TimelineTooltip
              key={hl.id}
              content={
                <div className="text-[10px]">
                  <p className="font-semibold" style={{ color: "#8B5CF6" }}>Highlight #{hl.rank_order ?? "—"}</p>
                  <p className="text-muted-foreground font-mono">{formatTime(hl.start_sec)} → {formatTime(hl.end_sec)}</p>
                  <p className="text-muted-foreground">Score: {hl.score ?? "—"}</p>
                  {hl.reason && <p className="text-muted-foreground mt-1 line-clamp-2">{hl.reason}</p>}
                </div>
              }
            >
              <div
                className={`absolute top-0 cursor-pointer transition-all duration-200 hover:scale-150 ${
                  isSelected ? "scale-150 drop-shadow-[0_0_6px_#8B5CF6]" : ""
                }`}
                style={{ left: `${left}%`, transform: `translateX(-50%)` }}
                onClick={() => onSelectHighlight(hl)}
              >
                <Star
                  style={{ width: size, height: size, color: "#8B5CF6" }}
                  fill={isSelected ? "#8B5CF6" : "none"}
                />
              </div>
            </TimelineTooltip>
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/60 px-0.5 font-mono">
        {timeLabels.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-border/15 text-[10px] text-muted-foreground">
        {Object.entries(SEGMENT_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
            {SEGMENT_LABELS[type] || type}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <Zap className="h-3 w-3" style={{ color: "#F59E0B" }} /> Breakpoint
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="h-3 w-3" style={{ color: "#8B5CF6" }} /> Highlight
        </span>
      </div>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  selected,
  onExportJSON,
  onDownloadReel,
  reelUrl,
}: {
  selected: SelectedItem | null;
  onExportJSON: () => void;
  onDownloadReel: () => void;
  reelUrl: string | null;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-16 overflow-auto">
      <div>
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">
          {selected ? "Element Detail" : "Select an Element"}
        </h3>

        {!selected ? (
          <p className="text-xs text-muted-foreground/60 leading-relaxed">
            Click any segment, breakpoint, or highlight on the timeline to inspect it.
          </p>
        ) : selected.kind === "segment" ? (
          <div className="animate-fade-in"><SegmentDetail seg={selected.data} /></div>
        ) : selected.kind === "breakpoint" ? (
          <div className="animate-fade-in"><BreakpointDetail bp={selected.data} /></div>
        ) : (
          <div className="animate-fade-in"><HighlightDetail hl={selected.data} /></div>
        )}
      </div>

      <div className="border-t border-border/20 pt-4 mt-auto">
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">Export</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 rounded-xl text-xs h-8 border-border/40 hover:border-primary/40 hover:bg-primary/5 btn-hover"
            onClick={onExportJSON}
          >
            <FileJson className="h-3.5 w-3.5" /> Export JSON
          </Button>
          <Button
            size="sm"
            className="w-full gap-2 rounded-xl text-xs h-8 glow-blue btn-hover"
            onClick={onDownloadReel}
            disabled={!reelUrl}
          >
            <Download className="h-3.5 w-3.5" /> Download Reel
          </Button>
        </div>
      </div>
    </div>
  );
}

function SegmentDetail({ seg }: { seg: Segment }) {
  return (
    <div className="space-y-2.5 text-xs">
      <Row label="Type" value={seg.type.replace("_", " ")} />
      <Row label="Time" value={`${formatTime(seg.start_sec)} → ${formatTime(seg.end_sec)}`} mono />
      <ConfidenceRow value={seg.confidence} />
      {seg.summary && <ReasonBox title="AI Summary" text={seg.summary} />}
    </div>
  );
}

function BreakpointDetail({ bp }: { bp: Breakpoint }) {
  return (
    <div className="space-y-2.5 text-xs">
      <Row label="Type" value={(bp.type || "natural_pause").replace("_", " ")} />
      <Row label="Timestamp" value={formatTime(bp.timestamp_sec)} mono />
      <ConfidenceRow value={bp.confidence} />
      {bp.reason && <ReasonBox title="Why This Break" text={bp.reason} />}
    </div>
  );
}

function HighlightDetail({ hl }: { hl: Highlight }) {
  return (
    <div className="space-y-2.5 text-xs">
      <Row label="Rank" value={`#${hl.rank_order ?? "—"}`} />
      <Row label="Time" value={`${formatTime(hl.start_sec)} → ${formatTime(hl.end_sec)}`} mono />
      <Row label="Score" value={String(hl.score ?? "—")} />
      <ConfidenceRow value={hl.score} />
      {hl.reason && <ReasonBox title="Why This Highlight" text={hl.reason} />}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground capitalize ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

function ConfidenceRow({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = value > 1 ? value : value * 100;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">Confidence</span>
      <span className={`font-semibold ${confidenceColor(value > 1 ? value / 100 : value)}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function ReasonBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2 p-3 rounded-xl bg-surface-0/60 border border-border/20">
      <p className="text-[10px] font-medium text-accent mb-1 uppercase tracking-wide">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function DemoResults() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <Sparkles className="h-10 w-10 text-primary/40 mb-4" />
      <h1 className="text-xl font-bold text-foreground mb-2">No Project Selected</h1>
      <p className="text-sm text-muted-foreground mb-6">Upload a video to see AI analysis results here.</p>
      <Button className="rounded-xl glow-blue btn-hover" onClick={() => navigate("/")}>
        Upload Video
      </Button>
    </div>
  );
}

export default Results;
