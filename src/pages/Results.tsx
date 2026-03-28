import { useNavigate } from "react-router-dom";
import { Play, Sparkles, Star, Download, Share2, FileJson, Link2, Cloud, Mail, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const segments = [
  { id: "SEG-001", label: "Opening Establishing", start: "00:00", end: "01:24", color: "bg-primary" },
  { id: "SEG-002", label: "Character Introduction", start: "01:24", end: "03:48", color: "bg-segment" },
  { id: "SEG-003", label: "Rising Tension", start: "03:48", end: "06:12", color: "bg-primary" },
  { id: "SEG-004", label: "Emotional Pivot", start: "06:12", end: "08:30", color: "bg-accent" },
  { id: "SEG-005", label: "Resolution Arc", start: "08:30", end: "10:15", color: "bg-segment" },
  { id: "SEG-006", label: "Closing Sequence", start: "10:15", end: "12:00", color: "bg-primary" },
];

const breakpoints = [25, 52, 70]; // percentage positions
const highlights = [15, 40, 85]; // percentage positions

const Results = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col px-6 py-8 max-w-7xl mx-auto gap-6">
      {/* Video Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="aspect-video bg-muted/30 flex items-center justify-center relative">
            <Play className="h-12 w-12 text-muted-foreground/50" />
            <Badge variant="secondary" className="absolute top-3 left-3 text-xs">Source Video</Badge>
            <span className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">12:00</span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl overflow-hidden glow-blue">
          <div className="aspect-video bg-primary/5 flex items-center justify-center relative">
            <Sparkles className="h-12 w-12 text-primary/50" />
            <Badge className="absolute top-3 left-3 text-xs bg-accent text-accent-foreground">AI Highlight Reel</Badge>
            <Badge variant="outline" className="absolute top-3 right-3 text-xs">Proprietary Model</Badge>
            <span className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">03:42</span>
          </div>
        </div>
      </div>

      {/* Sequence Intelligence Timeline */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">Sequence Intelligence Timeline</h2>
          <Badge variant="outline" className="text-xs text-primary border-primary/30">Interactive Mode Active</Badge>
        </div>

        {/* Timeline Bar */}
        <div className="relative h-12 bg-muted/40 rounded-lg overflow-hidden">
          {/* Segments */}
          {segments.map((seg, i) => {
            const totalMin = 12;
            const parseMin = (t: string) => { const [m, s] = t.split(":").map(Number); return m + s / 60; };
            const left = (parseMin(seg.start) / totalMin) * 100;
            const width = ((parseMin(seg.end) - parseMin(seg.start)) / totalMin) * 100;
            return (
              <div
                key={seg.id}
                className={`absolute top-1 bottom-1 ${seg.color} rounded opacity-60 hover:opacity-90 transition-opacity cursor-pointer`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={seg.label}
              />
            );
          })}

          {/* Breakpoint markers */}
          {breakpoints.map((pos, i) => (
            <div key={`bp-${i}`} className="absolute top-0 bottom-0 w-0.5 bg-breakpoint" style={{ left: `${pos}%` }}>
              <Star className="h-3 w-3 text-breakpoint absolute -top-1 -translate-x-1/2" />
            </div>
          ))}

          {/* Highlight markers */}
          {highlights.map((pos, i) => (
            <div key={`hl-${i}`} className="absolute -top-1" style={{ left: `${pos}%` }}>
              <Sparkles className="h-3.5 w-3.5 text-highlight" />
            </div>
          ))}
        </div>

        {/* Time scale */}
        <div className="flex justify-between mt-1.5 text-xs text-muted-foreground px-1">
          {["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-5 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Story Segment</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-breakpoint" /> Breakpoint</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-highlight" /> Highlight</span>
        </div>
      </div>

      {/* Bottom: Details + Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Segment Detail */}
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3">Segment Detail</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Segment</span><span className="font-medium">Emotional Pivot</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sequence ID</span><span className="font-mono text-xs">SEG-004</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Start / End</span><span>06:12 – 08:30</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className="text-segment font-semibold">98.4%</span></div>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs font-medium text-accent mb-1">Why This Was Selected</p>
            <p className="text-xs text-muted-foreground">
              High emotional contrast detected — camera shift from wide to close-up combined with audio intensity spike creates a compelling narrative pivot point.
            </p>
          </div>
        </div>

        {/* Export Actions */}
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3">Export Actions</h3>
          <div className="flex gap-3 mb-4">
            <Button variant="outline" className="flex-1 gap-2 rounded-xl">
              <FileJson className="h-4 w-4" /> Export JSON
            </Button>
            <Button className="flex-1 gap-2 rounded-xl">
              <Download className="h-4 w-4" /> Download Reel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-2">Quick Share</p>
          <div className="flex gap-2 mb-4">
            {[Link2, Cloud, Mail].map((Icon, i) => (
              <button key={i} className="h-9 w-9 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-segment" />
            <span>Processing Node: <span className="text-segment font-medium">Active</span></span>
          </div>
        </div>
      </div>

      {/* New Analysis */}
      <div className="flex justify-center mt-2">
        <Button variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
          ← New Analysis
        </Button>
      </div>
    </div>
  );
};

export default Results;
