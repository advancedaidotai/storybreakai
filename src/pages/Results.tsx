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

  // Fetch all data on mount
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

  // Compute total duration from segments if not from video metadata
  const duration = useMemo(() => {
    if (totalDuration > 0) return totalDuration;
    if (segments.length === 0) return 600; // fallback 10min
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

  // Demo mode
  if (!projectId) {
    return <DemoResults />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 py-4 max-w-[1400px] mx-auto gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground truncate max-w-md">{projectTitle || "Analysis Results"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {segments.length} segments · {breakpoints.length} breakpoints · {highlights.length} highlights
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs rounded-lg text-muted-foreground" onClick={() => navigate("/")}>
          ← New Analysis
        </Button>
      </div>

      {/* Video Panels + Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4">
        {/* Source Video */}
        <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow">
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
        <div className="glass-panel rounded-2xl overflow-hidden glow-blue cinematic-shadow">
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
        <DetailPanel
          selected={selected}
          onExportJSON={handleExportJSON}
          onDownloadReel={handleDownloadReel}
          reelUrl={reelUrl}
        />
      </div>

      {/* Sequence Intelligence Timeline */}
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
  );
};

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

  // Time labels
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
      <div className="relative h-10 bg-surface-0/60 rounded-xl overflow-hidden border border-border/20 mb-1">
        {segments.map((seg) => {
          const left = (seg.start_sec / duration) * 100;
          const width = ((seg.end_sec - seg.start_sec) / duration) * 100;
          const color = SEGMENT_COLORS[seg.type] || "#6B7280";
          const isSelected = selected?.kind === "segment" && selected.data.id === seg.id;

          return (
            <div
              key={seg.id}
              className={`absolute top-1 bottom-1 rounded-lg cursor-pointer transition-all duration-200 hover:opacity-100 ${
                isSelected ? "opacity-100 ring-1 ring-white/40" : "opacity-60"
              }`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                backgroundColor: color,
              }}
              title={`${seg.type}: ${formatTime(seg.start_sec)} → ${formatTime(seg.end_sec)}`}
              onClick={() => onSelectSegment(seg)}
            />
          );
        })}
      </div>

      {/* Layer 2: Breakpoints */}
      <div className="relative h-6 mb-1">
        {breakpoints.map((bp) => {
          const left = (bp.timestamp_sec / duration) * 100;
          const isSelected = selected?.kind === "breakpoint" && selected.data.id === bp.id;

          return (
            <div
              key={bp.id}
              className={`absolute top-0 cursor-pointer transition-transform duration-200 hover:scale-125 ${
                isSelected ? "scale-125" : ""
              }`}
              style={{ left: `${left}%`, transform: `translateX(-50%)` }}
              title={`Breakpoint: ${formatTime(bp.timestamp_sec)}`}
              onClick={() => onSelectBreakpoint(bp)}
            >
              <Zap
                className="h-4 w-4"
                style={{ color: "#F59E0B" }}
                fill={isSelected ? "#F59E0B" : "none"}
              />
            </div>
          );
        })}
      </div>

      {/* Layer 3: Highlights */}
      <div className="relative h-6 mb-1">
        {highlights.map((hl) => {
          const left = (hl.start_sec / duration) * 100;
          const scoreFrac = (hl.score || 0) / maxScore;
          const size = 12 + scoreFrac * 8; // 12-20px
          const isSelected = selected?.kind === "highlight" && selected.data.id === hl.id;

          return (
            <div
              key={hl.id}
              className={`absolute top-0 cursor-pointer transition-transform duration-200 hover:scale-125 ${
                isSelected ? "scale-125" : ""
              }`}
              style={{ left: `${left}%`, transform: `translateX(-50%)` }}
              title={`Highlight: ${formatTime(hl.start_sec)} → ${formatTime(hl.end_sec)} (score: ${hl.score})`}
              onClick={() => onSelectHighlight(hl)}
            >
              <Star
                style={{ width: size, height: size, color: "#8B5CF6" }}
                fill={isSelected ? "#8B5CF6" : "none"}
              />
            </div>
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
      <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-muted-foreground">
        {Object.entries(SEGMENT_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
            {type.replace("_", " ")}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <Zap className="h-2.5 w-2.5" style={{ color: "#F59E0B" }} /> Breakpoint
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="h-2.5 w-2.5" style={{ color: "#8B5CF6" }} /> Highlight
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
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-4 h-fit lg:max-h-[calc(56.25vw/2+2rem)] overflow-auto">
      {/* Detail */}
      <div>
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">
          {selected ? "Element Detail" : "Select an Element"}
        </h3>

        {!selected ? (
          <p className="text-xs text-muted-foreground/60 leading-relaxed">
            Click any segment, breakpoint, or highlight on the timeline to inspect it.
          </p>
        ) : selected.kind === "segment" ? (
          <SegmentDetail seg={selected.data} />
        ) : selected.kind === "breakpoint" ? (
          <BreakpointDetail bp={selected.data} />
        ) : (
          <HighlightDetail hl={selected.data} />
        )}
      </div>

      {/* Export */}
      <div className="border-t border-border/20 pt-4 mt-auto">
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-foreground/70">Export</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 rounded-xl text-xs h-8 border-border/40 hover:border-primary/40 hover:bg-primary/5"
            onClick={onExportJSON}
          >
            <FileJson className="h-3.5 w-3.5" /> Export JSON
          </Button>
          <Button
            size="sm"
            className="w-full gap-2 rounded-xl text-xs h-8 glow-blue"
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
  const pct = value > 1 ? value : value * 100; // handle 0-1 or 0-100
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

// ─── Demo fallback for /results without projectId ────────────────────────────

function DemoResults() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <Sparkles className="h-10 w-10 text-primary/40 mb-4" />
      <h1 className="text-xl font-bold text-foreground mb-2">No Project Selected</h1>
      <p className="text-sm text-muted-foreground mb-6">Upload a video to see AI analysis results here.</p>
      <Button className="rounded-xl glow-blue" onClick={() => navigate("/")}>
        Upload Video
      </Button>
    </div>
  );
}

export default Results;
