import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { Check, Loader2, AlertCircle, RefreshCw, CloudUpload, Brain, Layers, Sparkles, Film, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ProjectStatus = "draft" | "uploaded" | "uploading" | "analyzing" | "segments_done" | "highlights_done" | "breakpoints_done" | "merging" | "generating_reel" | "ready" | "complete" | "failed";

const STEPS = [
  { key: "uploading", label: "Uploading Video", description: "Transferring to secure cloud storage", icon: CloudUpload },
  { key: "uploaded", label: "Preparing Analysis", description: "Configuring AI parameters", icon: Layers },
  { key: "analyzing", label: "AI Video Analysis", description: "Pegasus is analyzing narrative structure", icon: Brain },
  { key: "segments_done", label: "Detecting Segments", description: "Identifying narrative arcs and scene boundaries", icon: Film },
  { key: "breakpoints_done", label: "Finding Ad Breaks", description: "Locating semantic narrative valleys", icon: Sparkles },
  { key: "highlights_done", label: "Scoring Highlights", description: "Ranking most engaging moments", icon: Sparkles },
  { key: "complete", label: "Finalizing", description: "Preparing your results dashboard", icon: Check },
] as const;

function statusToStepIndex(status: ProjectStatus): number {
  switch (status) {
    case "draft": return -1;
    case "uploading": return 0;
    case "uploaded": return 1;
    case "analyzing": return 2;
    case "segments_done": return 3;
    case "breakpoints_done": return 4;
    case "highlights_done": return 5;
    case "merging": return 5;
    case "generating_reel": return 6;
    case "ready": case "complete": return 6;
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
  const [elapsedSec, setElapsedSec] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track elapsed time for timeout warnings
  useEffect(() => {
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

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

    let isPolling = false;
    const poll = async () => {
      if (!isMounted.current || isPolling) return;
      isPolling = true;
      try {
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
      } finally {
        isPolling = false;
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => { isMounted.current = false; clearInterval(interval); };
  }, [projectId, navigate]);

  // Auto-trigger analyze-video when status = uploaded
  useEffect(() => {
    if (!projectId || status !== "uploaded" || triggeredAnalyze.current) return;
    triggeredAnalyze.current = true;
    
    supabase.functions.invoke("analyze-video", { body: { project_id: projectId } })
      .then(({ data, error: fnErr }) => {
        // The Supabase SDK sets fnErr for non-2xx responses with a generic message.
        // The actual error detail may be in data.error or fnErr.context.
        const serverError = data?.error;
        const contextError = (fnErr as any)?.context?.error;
        if (fnErr || serverError) {
          const detail = serverError || contextError || fnErr?.message || "Unknown error";
          console.error("[Processing] analyze-video error:", detail, { data, fnErr });
          setError(`Analysis error: ${detail}`);
          setStatus("failed");
        }
      })
      .catch((err: any) => {
        console.error("[Processing] analyze-video unexpected error:", err);
        setError(`Analysis failed to start: ${err?.message || "Could not connect to analysis service"}. Please retry.`);
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

      <h1 className="text-2xl font-bold tracking-tight text-foreground">Working some magic</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">Our AI is watching your video and mapping every scene, arc, and highlight. This usually takes a few minutes.</p>

      {/* Elapsed time */}
      {elapsedSec > 0 && !isFailed && (
        <div className="flex items-center gap-2 mt-3">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-xs font-mono text-muted-foreground/60">
            Elapsed: {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, "0")}
          </span>
        </div>
      )}

      {/* Timeout warnings */}
      {elapsedSec >= 600 && !isFailed && (
        <div className="w-full max-w-sm mt-4 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Analysis may have stalled. Try retrying or starting over.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 rounded-lg gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive w-fit"
            onClick={handleRetry}
            disabled={retrying}
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Restarting…" : "Retry Analysis"}
          </Button>
        </div>
      )}
      {elapsedSec >= 300 && elapsedSec < 600 && !isFailed && (
        <div className="w-full max-w-sm mt-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400 flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>This is taking longer than expected. Analysis of longer videos may take up to 15 minutes.</span>
        </div>
      )}

      {/* 7-Step Pipeline Stepper */}
      <div className="mt-10 w-full max-w-md space-y-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = activeStep > i;
          const isActive = activeStep === i;
          const isError = isFailed && isActive;
          const isPending = !isDone && !isActive;

          // Dynamic description for "Preparing Analysis" step
          const desc = step.key === "uploaded" && projectMeta?.content_type
            ? `Configuring AI for ${(projectMeta.content_type || "video").replace("_", " ")} delivery`
            : step.description;

          return (
            <div key={step.key} className="flex gap-4">
              {/* Step indicator column */}
              <div className="flex flex-col items-center">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 border-2 ${
                  isDone ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : isActive && !isError ? "bg-blue-500/20 border-blue-500/50 text-blue-400 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  : isError ? "bg-destructive/20 border-destructive/40 text-destructive"
                  : "bg-surface-2/50 border-border/20 text-muted-foreground/30"
                }`}>
                  {isDone ? <Check className="h-4 w-4" />
                    : isActive && !isError ? <Loader2 className="h-4 w-4 animate-spin" />
                    : isError ? <AlertCircle className="h-4 w-4" />
                    : <span className="text-[11px] font-bold">{i + 1}</span>}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-px flex-1 min-h-[28px] transition-colors duration-500 ${
                    isDone ? "bg-emerald-500/30" : "bg-border/20 border-l border-dashed border-border/30"
                  }`} style={isDone ? {} : { width: 0, borderLeftWidth: 1 }} />
                )}
              </div>

              {/* Step content */}
              <div className="pb-5 flex-1">
                <p className={`font-semibold text-sm transition-colors duration-300 ${
                  isDone ? "text-foreground" : isActive ? (isError ? "text-destructive" : "text-blue-400") : "text-muted-foreground/40"
                }`}>{step.label}</p>

                {/* Description */}
                <p className={`text-[11px] mt-0.5 transition-colors duration-300 ${
                  isDone ? "text-muted-foreground/60" : isActive && !isError ? "text-blue-400/60" : "text-muted-foreground/25"
                }`}>{desc}</p>

                {isDone && <p className="text-[10px] text-emerald-400/70 mt-1 font-medium">Complete</p>}

                {isActive && !isError && (
                  <p className="text-[10px] text-blue-400/50 mt-1 font-medium tracking-wide">{encourageMsg}</p>
                )}

                {/* Activity indicator for any active step */}
                {isActive && !isError && (
                  <div className="mt-3 space-y-2 fade-in-600">
                    {/* Indeterminate shimmer bar when no chunk data yet */}
                    {!(step.key === "analyzing" && chunkProgress && chunkProgress.total > 0) && (
                      <div className="w-full h-1.5 rounded-full bg-surface-2/60 overflow-hidden">
                        <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-primary/20 via-primary to-primary/20 animate-[slide-progress_2s_ease-in-out_infinite]" />
                      </div>
                    )}

                    {/* Chunk sub-progress for the "AI Video Analysis" step */}
                    {step.key === "analyzing" && chunkProgress && chunkProgress.total > 0 && (
                      <div className="glass-panel rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {chunkProgress.total > 1 ? "Multi-pass Analysis" : "Analyzing Video"}
                          </span>
                          <span className="text-[11px] font-mono text-primary">
                            {chunkProgress.total > 1
                              ? `${chunkProgress.completed} / ${chunkProgress.total} chunks`
                              : chunkProgress.completed > 0 ? "Complete" : "In progress…"}
                          </span>
                        </div>
                        <Progress value={chunkProgress.total > 0 ? (chunkProgress.completed / chunkProgress.total) * 100 : 0} className="h-1.5" />
                        {chunkProgress.currentChunk && (
                          <p className="text-[10px] text-muted-foreground/70">
                            Processing {chunkProgress.total > 1 ? `chunk ${chunkProgress.currentChunk.index} of ${chunkProgress.total} ` : ""}
                            <span className="font-mono text-primary/60">
                              ({formatTimeRange(chunkProgress.currentChunk.start_sec, chunkProgress.currentChunk.end_sec)})
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Show live scene count on segments step */}
                {isActive && !isError && step.key === "segments_done" && scenesFound > 0 && (
                  <p className="text-[10px] text-primary font-medium mt-1 animate-pulse">
                    {scenesFound} scene{scenesFound !== 1 ? "s" : ""} identified so far
                  </p>
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

      <div className="flex items-center justify-center gap-3 w-full max-w-sm mt-8">
        <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>← Start Over</Button>

        {!isFailed && status !== "draft" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-destructive gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> Cancel Analysis
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass-panel-elevated border-border/30 max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Cancel Analysis?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground text-sm">
                  This will stop the current analysis and mark the project as failed. You can retry later or start a new project. Any partial results will be discarded.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg text-xs">Keep Running</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-lg text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await supabase.from("projects").update({ status: "failed" as any }).eq("id", projectId);
                    setStatus("failed");
                    setError("Analysis was cancelled.");
                  }}
                >
                  Cancel Analysis
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
};

export default Processing;
