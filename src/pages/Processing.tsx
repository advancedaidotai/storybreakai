import { useNavigate } from "react-router-dom";
import { Check, Loader2, Circle, Lightbulb, Clock, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const steps = [
  { label: "Analyzing Video", detail: "Frame extraction complete", status: "done" as const },
  { label: "Detecting Story Segments", detail: "24 segments identified", status: "done" as const },
  { label: "Identifying Highlights", detail: "PROCESSING · SCENE 14/32", status: "active" as const },
  { label: "Generating Reel", detail: "Waiting…", status: "waiting" as const },
];

const Processing = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center px-6 py-20 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Refining Your Vision</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        AI is analyzing your footage and constructing an intelligent highlight reel.
      </p>

      {/* Stepper */}
      <div className="mt-14 w-full max-w-sm space-y-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                  step.status === "done"
                    ? "bg-segment/20 text-segment"
                    : step.status === "active"
                    ? "bg-primary/20 text-primary animate-pulse-glow glow-blue"
                    : "bg-surface-2 text-muted-foreground"
                }`}
              >
                {step.status === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : step.status === "active" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-px flex-1 min-h-[36px] ${
                  step.status === "done" ? "bg-segment/30" : "bg-border/40"
                }`} />
              )}
            </div>

            <div className="pb-7">
              <p className={`font-medium text-sm ${step.status === "waiting" ? "text-muted-foreground/60" : "text-foreground"}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-0.5 ${step.status === "active" ? "text-primary/80 font-medium tracking-wide" : "text-muted-foreground"}`}>
                {step.detail}
              </p>
              {step.status === "active" && (
                <Progress value={44} className="mt-3 h-1.5 w-56" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Director's Insight */}
      <div className="w-full max-w-sm glass-panel-elevated rounded-2xl p-5 border-l-2 border-l-breakpoint mt-2 glow-amber">
        <div className="flex items-start gap-3">
          <div className="h-7 w-7 rounded-lg bg-breakpoint/15 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="h-3.5 w-3.5 text-breakpoint" />
          </div>
          <div>
            <p className="font-semibold text-xs text-breakpoint tracking-wide uppercase">AI Director's Insight</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Detected a strong emotional pivot at 04:32 — the shift from wide establishing shots to tight close-ups creates a natural act break.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between w-full max-w-sm mt-12 text-xs">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> ~2 min</span>
          <span className="flex items-center gap-1.5"><Monitor className="h-3 w-3" /> 4K UHD</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="text-xs h-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>Cancel</Button>
          <Button size="sm" className="text-xs h-8 rounded-lg glow-blue" onClick={() => navigate("/results")}>Skip to Results</Button>
        </div>
      </div>
    </div>
  );
};

export default Processing;
