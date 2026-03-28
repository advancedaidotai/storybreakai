import { useNavigate } from "react-router-dom";
import { CloudUpload, Play, Clapperboard, Brain, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Clapperboard, title: "Scene Detection", desc: "AI identifies natural scene boundaries and transitions with frame-level precision." },
  { icon: Brain, title: "Mood Analysis", desc: "Understand emotional arcs and tonal shifts across your entire sequence." },
  { icon: Wand2, title: "Auto-Assembly", desc: "Generate highlight reels automatically based on detected story beats." },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center px-6 py-16 max-w-4xl mx-auto">
      {/* Hero */}
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-center leading-tight">
        Transform Footage into{" "}
        <span className="text-gradient-blue">Cinematic Stories</span>
      </h1>
      <p className="mt-4 text-muted-foreground text-center max-w-2xl text-lg">
        Upload your long-form video and let AI detect semantic segments, find natural breakpoints, and generate a polished highlight reel — in minutes.
      </p>

      {/* Upload Card */}
      <div className="mt-12 w-full max-w-xl glass-panel rounded-2xl p-8 border-2 border-dashed border-border hover:border-primary/50 transition-colors group">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:glow-blue transition-shadow">
            <CloudUpload className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">Drop your video files here</p>
            <p className="text-sm text-muted-foreground mt-1">MP4, MOV, MXF · up to 4 GB</p>
          </div>
          <Button
            size="lg"
            className="mt-2 rounded-xl"
            onClick={() => navigate("/processing")}
          >
            Select Master Clips
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 mt-10 w-full max-w-xl">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground tracking-widest font-medium">OR EXPLORE POSSIBILITIES</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Sample */}
      <Button
        variant="outline"
        className="mt-6 rounded-xl gap-2"
        onClick={() => navigate("/processing")}
      >
        <Play className="h-4 w-4" /> Try Sample Video
      </Button>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full">
        {features.map((f) => (
          <div key={f.title} className="glass-panel rounded-2xl p-6 hover:border-primary/30 transition-colors">
            <f.icon className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-base">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-20 text-center text-xs text-muted-foreground">
        <p>StoryBreak AI v0.1 · Powered by <span className="text-primary">MineYourMedia</span></p>
      </footer>
    </div>
  );
};

export default Index;
