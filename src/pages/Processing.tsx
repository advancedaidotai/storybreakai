import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { Check, Loader2, AlertCircle, RefreshCw, CloudUpload, Brain, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type ProjectStatus = "draft" | "uploaded" | "analyzing" | "segments_done" | "highlights_done" | "generating_reel" | "ready" | "complete" | "failed";

const STEPS = [
  { key: "uploaded", label: "Uploaded to Cloud", icon: CloudUpload },
  { key: "analyzing", label: "Analyzing with AI", icon: Brain },
  { key: "segments_done", label: "Detecting Segments", icon: Layers },
  { key: "highlights_done", label: "Identifying Highlights", icon: Sparkles },
] as const;

function statusToStepIndex(status: ProjectStatus): number {
  switch (status) {
    case "draft": return -1;
    case "uploaded": return 0;
    case "analyzing": return 1;
    case "segments_done": return 2;
    case "highlights_done": return 4;
    case "generating_reel": case "ready": case "complete": return 5;
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

function formatTimeRange(startSec: number, endSec: number) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(startSec)} – ${fmt(endSec)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Processing = () => {
  const navigate = useNavigate();
  const { projectId: rawId } = useParams<{ projectId: string }>();
  const projectId = rawId && UUID_RE.test(rawId) ? rawId : undefined;
  const [status, setStatus] = useState<ProjectStatus>("uploaded");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const triggeredAnalyze = useRef(false);
  

  // Poll project status + chunk progress
  useEffect(() => {
    if (!projectId) return;

    const poll = async () => {
      const { data, error: fetchErr } = await supabase.from("projects").select("status").eq("id", projectId).single();
      if (fetchErr || !data) return;

      const newStatus = data.status as ProjectStatus;
      setStatus(newStatus);

      if (newStatus === "complete" || newStatus === "ready") {
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
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
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

  // Skip reel generation — navigate to results once highlights are done
  useEffect(() => {
    if (!projectId) return;
    if (status === "highlights_done" || status === "ready") {
      console.log("[Processing] Analysis complete — navigating to results");
      navigate(`/results/${projectId}`, { replace: true });
    }
  }, [projectId, status, navigate]);

  const handleRetry = useCallback(async () => {
    if (!projectId) return;
    setRetrying(true);
    setError(null);
    setChunkProgress(null);
    triggeredAnalyze.current = false;
    
    await supabase.from("projects").update({ status: "uploaded" as any }).eq("id", projectId);
    setStatus("uploaded");
    setRetrying(false);
  }, [projectId]);

  const activeStep = statusToStepIndex(status);
  const isFailed = status === "failed";

  if (!projectId) {
    return (
      <div className="flex flex-col items-center px-6 py-20 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sample Processing</h1>
        <p className="text-muted-foreground mt-2 text-center text-sm">This is a demo view. Upload a real video to see AI processing in action.</p>
        <DemoStepper />
        <div className="flex gap-2 mt-12">
          <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>← Back</Button>
          <Button size="sm" className="text-xs h-8 rounded-lg glow-blue" onClick={() => navigate("/results")}>Skip to Results</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-20 max-w-xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Refining Your Vision</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">AI is analyzing your footage and constructing an intelligent highlight reel.</p>

      {/* Stepper */}
      <div className="mt-14 w-full max-w-sm space-y-0">
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
                  <p className="text-xs text-primary/70 mt-0.5 font-medium tracking-wide uppercase">In progress…</p>
                )}
                {isDone && <p className="text-xs text-segment/70 mt-0.5">Complete</p>}

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

      {/* Error state */}
      {isFailed && (
        <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border-l-2 border-l-destructive mt-2 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-xs text-destructive uppercase tracking-wide">Processing Failed</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {error || "An error occurred during analysis. This could be a temporary issue — try again."}
              </p>
              <Button size="sm" variant="outline" className="mt-3 text-xs h-8 rounded-lg gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive" onClick={handleRetry} disabled={retrying}>
                <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Restarting…" : "Retry Analysis"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center w-full max-w-sm mt-12">
        <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>← New Analysis</Button>
      </div>
    </div>
  );
};

function DemoStepper() {
  return (
    <div className="mt-14 w-full max-w-sm space-y-0">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isDone = i < 2;
        const isActive = i === 2;
        return (
          <div key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${isDone ? "bg-segment/20 text-segment" : isActive ? "bg-primary/20 text-primary animate-pulse glow-blue" : "bg-surface-2 text-muted-foreground/40"}`}>
                {isDone ? <Check className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              </div>
              {i < STEPS.length - 1 && <div className={`w-px flex-1 min-h-[32px] ${isDone ? "bg-segment/30" : "bg-border/30"}`} />}
            </div>
            <div className="pb-6">
              <p className={`font-medium text-sm ${isDone ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground/50"}`}>{step.label}</p>
              {isActive && <p className="text-xs text-primary/70 mt-0.5 font-medium tracking-wide uppercase">In progress…</p>}
              {isDone && <p className="text-xs text-segment/70 mt-0.5">Complete</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Processing;
