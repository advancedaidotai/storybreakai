import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { Check, Loader2, AlertCircle, RefreshCw, CloudUpload, Brain, Layers, Sparkles, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type ProjectStatus = "draft" | "uploaded" | "analyzing" | "segments_done" | "highlights_done" | "generating_reel" | "ready" | "complete" | "failed";

const STEPS = [
  { key: "uploaded", label: "Getting your video ready...", icon: CloudUpload },
  { key: "analyzing", label: "Finding the story beats...", icon: Brain },
  { key: "segments_done", label: "Mapping scene boundaries...", icon: Layers },
] as const;

function statusToStepIndex(status: ProjectStatus): number {
  switch (status) {
    case "draft": return -1;
    case "uploaded": return 0;
    case "analyzing": return 1;
    case "segments_done": return 2;
    case "generating_reel": return 3;
    case "highlights_done": case "ready": case "complete": return 3;
    case "failed": return -2;
    default: return -1;
  }
}

interface ChunkProgress {
  total: number;
  completed: number;
  analyzing: number;
  currentChunk?: { index: number; start_sec: number; end_sec: number };
}

interface ProjectMeta {
  title: string;
  content_metadata: any;
  content_type: string | null;
  duration_sec: number | null;
}

function formatTimeRange(startSec: number, endSec: number) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(startSec)} – ${fmt(endSec)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENCOURAGING = [
  "Hang tight, almost there…",
  "Our AI is deep in concentration…",
  "Great content takes a moment to decode…",
  "Piecing together the narrative…",
];

const Processing = () => {
  const navigate = useNavigate();
  const { projectId: rawId } = useParams<{ projectId: string }>();
  const projectId = rawId && UUID_RE.test(rawId) ? rawId : undefined;
  const [status, setStatus] = useState<ProjectStatus>("uploaded");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const triggeredAnalyze = useRef(false);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [scenesFound, setScenesFound] = useState(0);
  const [thumbTimestamps, setThumbTimestamps] = useState<number[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Poll project status + chunk progress + metadata
  useEffect(() => {
    if (!projectId) return;
    const isMounted = { current: true };

    // Fetch project metadata once
    supabase.from("projects").select("title, content_metadata, content_type, duration_sec").eq("id", projectId).single()
      .then(({ data }) => { if (isMounted.current && data) setProjectMeta(data as ProjectMeta); });

    // Fetch video URL
    supabase.from("videos").select("s3_uri, original_filename").eq("project_id", projectId).limit(1).single()
      .then(({ data }) => {
        if (isMounted.current && data?.s3_uri && !data.s3_uri.startsWith("s3://")) {
          setVideoUrl(data.s3_uri);
        }
      });

    const poll = async () => {
      if (!isMounted.current) return;
      const { data, error: fetchErr } = await supabase.from("projects").select("status").eq("id", projectId).single();
      if (fetchErr || !data || !isMounted.current) return;

      const newStatus = data.status as ProjectStatus;
      if (!isMounted.current) return;
      setStatus(newStatus);

      if (newStatus === "complete" || newStatus === "ready" || newStatus === "highlights_done") {
        navigate(`/results/${projectId}`, { replace: true });
        return;
      }

      // Check for chunk progress during analysis
      if (newStatus === "analyzing" || newStatus === "segments_done") {
        const { data: chunks } = await supabase
          .from("analysis_chunks")
          .select("chunk_index, start_sec, end_sec, status")
          .eq("project_id", projectId)
          .order("chunk_index");

        if (!isMounted.current) return;
        if (chunks && chunks.length > 0) {
          const completed = chunks.filter((c: any) => c.status === "complete").length;
          const analyzingChunk = chunks.find((c: any) => c.status === "analyzing");
          setChunkProgress({
            total: chunks.length,
            completed,
            analyzing: analyzingChunk ? 1 : 0,
            currentChunk: analyzingChunk ? { index: analyzingChunk.chunk_index, start_sec: analyzingChunk.start_sec, end_sec: analyzingChunk.end_sec } : undefined,
          });
        }
      }

      // Count segments found so far
      const { count } = await supabase
        .from("segments")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (!isMounted.current) return;
      if (count !== null) setScenesFound(count);
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { isMounted.current = false; clearInterval(interval); };
  }, [projectId, navigate]);

  // Auto-trigger analyze-video when status = uploaded
  useEffect(() => {
    if (!projectId || status !== "uploaded" || triggeredAnalyze.current) return;
    triggeredAnalyze.current = true;
    console.log("[Processing] Triggering analyze-video for", projectId);
    supabase.functions.invoke("analyze-video", { body: { project_id: projectId } })
      .then(({ data, error: fnErr }) => {
        if (fnErr) {
          console.error("[Processing] analyze-video invoke error:", fnErr.message);
          setError(`Analysis failed to start: ${fnErr.message}`);
          setStatus("failed");
        } else if (data?.error) {
          console.error("[Processing] analyze-video returned error:", data.error);
          setError(`Analysis error: ${data.error}`);
          setStatus("failed");
        } else {
          console.log("[Processing] analyze-video invoked successfully");
        }
      })
      .catch((err: any) => {
        console.error("[Processing] analyze-video unexpected error:", err);
        setError("Failed to connect to analysis service. Please retry.");
        setStatus("failed");
      });
  }, [projectId, status]);


  // Generate thumbnail timestamps periodically from video
  useEffect(() => {
    if (!videoUrl || !projectMeta?.duration_sec) return;
    const dur = projectMeta.duration_sec;
    const addThumb = () => {
      setThumbTimestamps((prev) => {
        if (prev.length >= 6) return prev;
        const t = Math.floor(Math.random() * dur);
        if (prev.includes(t)) return prev;
        return [...prev, t].sort((a, b) => a - b);
      });
    };
    addThumb();
    const iv = setInterval(addThumb, 5000);
    return () => clearInterval(iv);
  }, [videoUrl, projectMeta?.duration_sec]);

  const handleRetry = useCallback(async () => {
    if (!projectId) return;
    setRetrying(true);
    setError(null);
    setChunkProgress(null);
    triggeredAnalyze.current = false;

    // Clean up stale data from the failed run
    await Promise.all([
      supabase.from("segments").delete().eq("project_id", projectId),
      supabase.from("breakpoints").delete().eq("project_id", projectId),
      supabase.from("highlights").delete().eq("project_id", projectId),
      supabase.from("analysis_chunks").delete().eq("project_id", projectId),
      supabase.from("analysis_logs").delete().eq("project_id", projectId),
    ]);

    await supabase.from("projects").update({ status: "uploaded" as any }).eq("id", projectId);
    setStatus("uploaded");
    setRetrying(false);
  }, [projectId]);

  const activeStep = statusToStepIndex(status);
  const isFailed = status === "failed";
  const overallPct = Math.min(100, Math.max(0, ((activeStep + 1) / STEPS.length) * 100));
  const encourageMsg = ENCOURAGING[activeStep >= 0 ? activeStep % ENCOURAGING.length : 0];

  const meta = projectMeta?.content_metadata || {};
  const displayTitle = meta.title || projectMeta?.title || "Your Video";
  const displayNetwork = meta.network || null;

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <AlertCircle className="h-10 w-10 text-muted-foreground/30 mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">No Active Analysis Found</h1>
        <p className="text-sm text-muted-foreground mb-6">We couldn't find an active analysis at this URL. Let's start fresh!</p>
        <Button className="rounded-xl glow-blue" onClick={() => navigate("/")}>Start New Analysis</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-12 max-w-2xl mx-auto animate-fade-in">
      {/* Overall progress bar */}
      <div className="w-full mb-8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">Overall Progress</p>
          <p className="text-xs font-mono text-primary">{isFailed ? "—" : `${Math.round(overallPct)}%`}</p>
        </div>
        <Progress value={isFailed ? 0 : overallPct} className="h-2" />
      </div>

      {/* Project metadata header */}
      <div className="w-full glass-panel rounded-2xl px-5 py-4 mb-8 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Film className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground truncate">{displayTitle}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {displayNetwork && <span className="text-[10px] text-muted-foreground bg-surface-2/80 px-2 py-0.5 rounded">{displayNetwork}</span>}
            {projectMeta?.content_type && (
              <span className="text-[10px] text-muted-foreground/60 capitalize">{projectMeta.content_type.replace("_", " ")}</span>
            )}
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">Working some magic ✨</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">Our AI is watching your video and mapping every scene, arc, and highlight. This usually takes a few minutes.</p>

      {/* Stepper */}
      <div className="mt-10 w-full max-w-sm space-y-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = activeStep > i;
          const isActive = activeStep === i;
          const isError = isFailed && isActive;

          return (
            <div key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ${
                  isDone ? "bg-segment/20 text-segment"
                  : isActive && !isError ? "bg-primary/20 text-primary animate-pulse glow-blue"
                  : isError ? "bg-destructive/20 text-destructive"
                  : "bg-surface-2 text-muted-foreground/40"
                }`}>
                  {isDone ? <Check className="h-4 w-4" />
                    : isActive && !isError ? <Loader2 className="h-4 w-4 animate-spin" />
                    : isError ? <AlertCircle className="h-4 w-4" />
                    : <Icon className="h-4 w-4" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-px flex-1 min-h-[32px] transition-colors duration-500 ${isDone ? "bg-segment/30" : "bg-border/30"}`} />
                )}
              </div>

              <div className="pb-6 flex-1">
                <p className={`font-medium text-sm transition-colors duration-300 ${
                  isDone ? "text-foreground" : isActive ? (isError ? "text-destructive" : "text-primary") : "text-muted-foreground/50"
                }`}>{step.label}</p>

                {isActive && !isError && (
                  <p className="text-xs text-primary/70 mt-0.5 font-medium tracking-wide">{encourageMsg}</p>
                )}
                {isDone && <p className="text-xs text-segment/70 mt-0.5">Done ✓</p>}

                {/* Chunk sub-progress for the "Analyzing with AI" step */}
                {isActive && !isError && step.key === "analyzing" && chunkProgress && chunkProgress.total > 1 && (
                  <div className="mt-3 glass-panel rounded-xl p-3 space-y-2 fade-in-600">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-medium">Multi-pass Analysis</span>
                      <span className="text-[11px] font-mono text-primary">
                        {chunkProgress.completed} / {chunkProgress.total} chunks
                      </span>
                    </div>
                    <Progress value={(chunkProgress.completed / chunkProgress.total) * 100} className="h-1.5" />
                    {chunkProgress.currentChunk && (
                      <p className="text-[10px] text-muted-foreground/70">
                        Analyzing chunk {chunkProgress.currentChunk.index} of {chunkProgress.total}{" "}
                        <span className="font-mono text-primary/60">
                          ({formatTimeRange(chunkProgress.currentChunk.start_sec, chunkProgress.currentChunk.end_sec)})
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Preview — video thumbnails */}
      {videoUrl && thumbTimestamps.length > 0 && (
        <div className="w-full mt-4 glass-panel rounded-2xl p-4 fade-in-600">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-foreground/80">Live Preview</p>
            {scenesFound > 0 && (
              <p className="text-xs text-primary font-medium animate-pulse">
                Discovered {scenesFound} scene{scenesFound !== 1 ? "s" : ""} so far…
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {thumbTimestamps.map((t) => (
              <div key={t} className="relative aspect-video rounded-lg overflow-hidden bg-surface-0 border border-border/10">
                <video
                  src={`${videoUrl}#t=${t}`}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                  onError={(e) => {
                    (e.target as HTMLVideoElement).style.display = "none";
                  }}
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                  <span className="text-[9px] font-mono text-white/80">
                    {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scene count when no video preview available */}
      {!videoUrl && scenesFound > 0 && (
        <div className="w-full mt-4 glass-panel rounded-2xl p-4 text-center fade-in-600">
          <p className="text-sm text-primary font-medium animate-pulse">
            Discovered {scenesFound} scene{scenesFound !== 1 ? "s" : ""} so far…
          </p>
        </div>
      )}

      {/* Error state */}
      {isFailed && (
        <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border-l-2 border-l-destructive mt-6 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-xs text-destructive uppercase tracking-wide">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {error || "The analysis hit a snag — but don't worry, these things happen. Let's give it another shot."}
              </p>
              <Button size="sm" variant="outline" className="mt-3 text-xs h-8 rounded-lg gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive" onClick={handleRetry} disabled={retrying}>
                <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Restarting…" : "Retry Analysis"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center w-full max-w-sm mt-8">
        <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>← Start Over</Button>
      </div>
    </div>
  );
};

export default Processing;
