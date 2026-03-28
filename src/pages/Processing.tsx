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
    <div className="flex flex-col items-center px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">Refining Your Vision</h1>
      <p className="text-muted-foreground mt-2 text-center">
        Our AI is analyzing your footage and constructing an intelligent highlight reel.
      </p>

      {/* Stepper */}
      <div className="mt-12 w-full max-w-md space-y-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex gap-4">
            {/* Icon + Line */}
            <div className="flex flex-col items-center">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                  step.status === "done"
                    ? "bg-segment text-primary-foreground"
                    : step.status === "active"
                    ? "bg-primary text-primary-foreground animate-pulse-glow"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step.status === "done" ? (
                  <Check className="h-4 w-4" />
                ) : step.status === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-px flex-1 min-h-[40px] ${
                  step.status === "done" ? "bg-segment" : "bg-border"
                }`} />
              )}
            </div>

            {/* Content */}
            <div className="pb-8">
              <p className={`font-semibold ${step.status === "waiting" ? "text-muted-foreground" : ""}`}>
                {step.label}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{step.detail}</p>
              {step.status === "active" && (
                <Progress value={44} className="mt-3 h-2 w-64" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Director's Insight */}
      <div className="w-full max-w-md glass-panel rounded-2xl p-5 border-l-4 border-breakpoint mt-4 glow-amber">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-breakpoint shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-breakpoint">AI Director's Insight</p>
            <p className="text-sm text-muted-foreground mt-1">
              Detected a strong emotional pivot at 04:32 — the shift from wide establishing shots to tight close-ups creates a natural act break. Recommending this as a primary breakpoint.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between w-full max-w-md mt-10 text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> ~2 min remaining</span>
          <span className="flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" /> 4K UHD</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Cancel</Button>
          <Button size="sm" onClick={() => navigate("/results")}>Skip to Results</Button>
        </div>
      </div>
    </div>
  );
};

export default Processing;
