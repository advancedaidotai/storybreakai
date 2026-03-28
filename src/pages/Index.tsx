import { useNavigate } from "react-router-dom";
import { CloudUpload, Play, Clapperboard, Brain, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Clapperboard, title: "Scene Detection", desc: "Frame-level precision identifying natural boundaries and transitions." },
  { icon: Brain, title: "Mood Analysis", desc: "Map emotional arcs and tonal shifts across your sequence." },
  { icon: Wand2, title: "Auto-Assembly", desc: "Generate highlight reels from detected story beats." },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center px-6 py-20 max-w-3xl mx-auto">
      {/* Hero */}
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-center leading-[1.1]">
        Transform Footage into{" "}
        <span className="text-gradient-blue">Cinematic Stories</span>
      </h1>
      <p className="mt-5 text-muted-foreground text-center max-w-xl text-sm leading-relaxed">
        Upload long-form video and let AI detect semantic segments, find natural breakpoints, and generate a polished highlight reel.
      </p>

      {/* Upload Card */}
      <div className="mt-14 w-full max-w-lg glass-panel-elevated rounded-2xl p-10 border border-border/30 hover:border-primary/30 transition-all duration-300 group cursor-pointer">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:glow-blue transition-all duration-300">
            <CloudUpload className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Drop your video files here</p>
            <p className="text-xs text-muted-foreground mt-1.5">MP4, MOV, MXF · up to 4 GB</p>
          </div>
          <Button
            size="lg"
            className="mt-1 rounded-xl px-8 glow-blue"
            onClick={() => navigate("/processing")}
          >
            Select Master Clips
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 mt-10 w-full max-w-lg">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] text-muted-foreground tracking-[0.2em] font-medium uppercase">or explore possibilities</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* Sample */}
      <Button
        variant="outline"
        className="mt-5 rounded-xl gap-2 text-xs border-border/50 hover:border-primary/40 hover:bg-primary/5"
        onClick={() => navigate("/processing")}
      >
        <Play className="h-3.5 w-3.5" /> Try Sample Video
      </Button>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 w-full">
        {features.map((f) => (
          <div key={f.title} className="glass-panel rounded-2xl p-5 surface-interactive group">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:glow-blue transition-all duration-300">
              <f.icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-24 text-center text-[11px] text-muted-foreground/60">
        StoryBreak AI v0.1 · Powered by <span className="text-primary/70">MineYourMedia</span>
      </footer>
    </div>
  );
};

export default Index;
