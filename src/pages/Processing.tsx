import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { Check, Loader2, Circle, AlertCircle, RefreshCw, CloudUpload, Brain, Layers, Sparkles, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ProjectStatus =
  | "draft"
  | "uploaded"
  | "analyzing"
  | "segments_done"
  | "highlights_done"
  | "generating_reel"
  | "ready"
  | "complete"
  | "failed";

const STEPS = [
  { key: "uploaded", label: "Uploaded to Cloud", icon: CloudUpload },
  { key: "analyzing", label: "Analyzing with AI", icon: Brain },
  { key: "segments_done", label: "Detecting Segments", icon: Layers },
  { key: "highlights_done", label: "Identifying Highlights", icon: Sparkles },
  { key: "generating_reel", label: "Generating Highlight Reel", icon: Film },
] as const;

// Map status → which step index is active (0-based), -1 = none started
function statusToStepIndex(status: ProjectStatus): number {
  switch (status) {
    case "draft":
      return -1;
    case "uploaded":
      return 0;
    case "analyzing":
      return 1;
    case "segments_done":
      return 2;
    case "highlights_done":
      return 3;
    case "generating_reel":
      return 4;
    case "ready":
    case "complete":
      return 5; // all done
    case "failed":
      return -2; // error state
    default:
      return -1;
  }
}

const Processing = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [status, setStatus] = useState<ProjectStatus>("uploaded");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const triggeredAnalyze = useRef(false);
  const triggeredReel = useRef(false);

  // Poll project status
  useEffect(() => {
    if (!projectId) return;

    const poll = async () => {
      const { data, error: fetchErr } = await supabase
        .from("projects")
        .select("status")
        .eq("id", projectId)
        .single();

      if (fetchErr || !data) {
        console.error("[Processing] Poll error:", fetchErr?.message);
        return;
      }

      const newStatus = data.status as ProjectStatus;
      setStatus(newStatus);

      if (newStatus === "complete" || newStatus === "ready") {
        navigate(`/results/${projectId}`, { replace: true });
      }
    };

    poll(); // immediate first check
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [projectId, navigate]);

  // Auto-trigger analyze-video when status = uploaded
  useEffect(() => {
    if (!projectId || status !== "uploaded" || triggeredAnalyze.current) return;
    triggeredAnalyze.current = true;

    console.log("[Processing] Auto-triggering analyze-video");
    supabase.functions
      .invoke("analyze-video", { body: { project_id: projectId } })
      .then(({ error: fnErr }) => {
        if (fnErr) console.error("[Processing] analyze-video error:", fnErr.message);
      });
  }, [projectId, status]);

  // Auto-trigger generate-reel when status = highlights_done or ready (after analysis)
  useEffect(() => {
    if (!projectId || triggeredReel.current) return;
    // Trigger reel generation once analysis is fully done
    // "ready" from analyze-video means all segments/breakpoints/highlights inserted
    if (status === "ready" || status === "highlights_done") {
      triggeredReel.current = true;
      console.log("[Processing] Auto-triggering generate-reel");
      supabase.functions
        .invoke("generate-reel", { body: { project_id: projectId } })
        .then(({ error: fnErr }) => {
          if (fnErr) console.error("[Processing] generate-reel error:", fnErr.message);
        });
    }
  }, [projectId, status]);

  const handleRetry = useCallback(async () => {
    if (!projectId) return;
    setRetrying(true);
    setError(null);
    triggeredAnalyze.current = false;
    triggeredReel.current = false;

    // Reset status to uploaded to restart pipeline
    await supabase.from("projects").update({ status: "uploaded" as any }).eq("id", projectId);
    setStatus("uploaded");
    setRetrying(false);
  }, [projectId]);

  const activeStep = statusToStepIndex(status);
  const isFailed = status === "failed";

  // Demo mode (no projectId)
  if (!projectId) {
    return (
      <div className="flex flex-col items-center px-6 py-20 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sample Processing</h1>
        <p className="text-muted-foreground mt-2 text-center text-sm">
          This is a demo view. Upload a real video to see AI processing in action.
        </p>
        <DemoStepper />
        <div className="flex gap-2 mt-12">
          <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <Button size="sm" className="text-xs h-8 rounded-lg glow-blue" onClick={() => navigate("/results")}>
            Skip to Results
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-20 max-w-xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Refining Your Vision</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        AI is analyzing your footage and constructing an intelligent highlight reel.
      </p>

      {/* Stepper */}
      <div className="mt-14 w-full max-w-sm space-y-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = activeStep > i;
          const isActive = activeStep === i;
          const isWaiting = activeStep < i;
          const isError = isFailed && isActive;

          return (
            <div key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ${
                    isDone
                      ? "bg-segment/20 text-segment"
                      : isActive && !isError
                      ? "bg-primary/20 text-primary animate-pulse glow-blue"
                      : isError
                      ? "bg-destructive/20 text-destructive"
                      : "bg-surface-2 text-muted-foreground/40"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : isActive && !isError ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isError ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-px flex-1 min-h-[32px] transition-colors duration-500 ${
                      isDone ? "bg-segment/30" : "bg-border/30"
                    }`}
                  />
                )}
              </div>

              <div className="pb-6">
                <p
                  className={`font-medium text-sm transition-colors duration-300 ${
                    isDone
                      ? "text-foreground"
                      : isActive
                      ? isError
                        ? "text-destructive"
                        : "text-primary"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </p>
                {isActive && !isError && (
                  <p className="text-xs text-primary/70 mt-0.5 font-medium tracking-wide uppercase">
                    In progress…
                  </p>
                )}
                {isDone && (
                  <p className="text-xs text-segment/70 mt-0.5">Complete</p>
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
                An error occurred during analysis. This could be a temporary issue — try again.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs h-8 rounded-lg gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Restarting…" : "Retry Analysis"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-center w-full max-w-sm mt-12">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/")}
        >
          ← New Analysis
        </Button>
      </div>
    </div>
  );
};

/** Demo stepper for /processing without projectId */
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
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isDone
                    ? "bg-segment/20 text-segment"
                    : isActive
                    ? "bg-primary/20 text-primary animate-pulse glow-blue"
                    : "bg-surface-2 text-muted-foreground/40"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-px flex-1 min-h-[32px] ${isDone ? "bg-segment/30" : "bg-border/30"}`} />
              )}
            </div>
            <div className="pb-6">
              <p className={`font-medium text-sm ${isDone ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground/50"}`}>
                {step.label}
              </p>
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
