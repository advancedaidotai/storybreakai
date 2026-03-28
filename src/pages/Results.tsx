import { useNavigate } from "react-router-dom";
import { Play, Sparkles, Star, Download, Share2, FileJson, Link2, Cloud, Mail, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const segments = [
  { id: "SEG-001", label: "Opening Establishing", start: "00:00", end: "01:24", color: "bg-primary/50" },
  { id: "SEG-002", label: "Character Introduction", start: "01:24", end: "03:48", color: "bg-segment/50" },
  { id: "SEG-003", label: "Rising Tension", start: "03:48", end: "06:12", color: "bg-primary/50" },
  { id: "SEG-004", label: "Emotional Pivot", start: "06:12", end: "08:30", color: "bg-accent/50" },
  { id: "SEG-005", label: "Resolution Arc", start: "08:30", end: "10:15", color: "bg-segment/50" },
  { id: "SEG-006", label: "Closing Sequence", start: "10:15", end: "12:00", color: "bg-primary/50" },
];

const breakpoints = [25, 52, 70];
const highlights = [15, 40, 85];

const Results = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col px-6 py-6 max-w-7xl mx-auto gap-5">
      {/* Video Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl overflow-hidden cinematic-shadow">
          <div className="aspect-video bg-surface-0 flex items-center justify-center relative">
            <div className="h-14 w-14 rounded-2xl bg-surface-2/80 flex items-center justify-center">
              <Play className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <Badge variant="secondary" className="absolute top-3 left-3 text-[10px] bg-surface-2/80 border-0 text-muted-foreground">Source Video</Badge>
            <span className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-surface-1/90 px-2 py-0.5 rounded-md font-mono">12:00</span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl overflow-hidden glow-blue cinematic-shadow">
          <div className="aspect-video bg-primary/[0.03] flex items-center justify-center relative">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary/60" />
            </div>
            <Badge className="absolute top-3 left-3 text-[10px] bg-accent/90 text-accent-foreground border-0">AI Highlight Reel</Badge>
            <Badge variant="outline" className="absolute top-3 right-3 text-[10px] border-border/40 text-muted-foreground">Proprietary Model</Badge>
            <span className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-surface-1/90 px-2 py-0.5 rounded-md font-mono">03:42</span>
          </div>
        </div>
      </div>

      {/* Sequence Intelligence Timeline */}
      <div className="glass-panel-elevated rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-xs tracking-wide uppercase text-foreground/80">Sequence Intelligence Timeline</h2>
          <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">Interactive Mode</Badge>
        </div>

        <div className="relative h-10 bg-surface-0/60 rounded-xl overflow-hidden border border-border/20">
          {segments.map((seg) => {
            const totalMin = 12;
            const parseMin = (t: string) => { const [m, s] = t.split(":").map(Number); return m + s / 60; };
            const left = (parseMin(seg.start) / totalMin) * 100;
            const width = ((parseMin(seg.end) - parseMin(seg.start)) / totalMin) * 100;
            return (
              <div
                key={seg.id}
                className={`absolute top-1 bottom-1 ${seg.color} rounded-lg hover:opacity-100 transition-all duration-200 cursor-pointer opacity-70`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={seg.label}
              />
            );
          })}

          {breakpoints.map((pos, i) => (
            <div key={`bp-${i}`} className="absolute top-0 bottom-0 w-0.5 bg-breakpoint/70" style={{ left: `${pos}%` }}>
              <Star className="h-2.5 w-2.5 text-breakpoint absolute -top-0.5 -translate-x-1/2" />
            </div>
          ))}

          {highlights.map((pos, i) => (
            <div key={`hl-${i}`} className="absolute -top-0.5" style={{ left: `${pos}%` }}>
              <Sparkles className="h-3 w-3 text-highlight" />
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/60 px-0.5 font-mono">
          {["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>

        <div className="flex gap-5 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary/60" /> Story Segment</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-breakpoint" /> Breakpoint</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-highlight" /> Highlight</span>
        </div>
      </div>

      {/* Bottom: Details + Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-xs font-semibold mb-4 uppercase tracking-wide text-foreground/70">Segment Detail</h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Segment</span><span className="font-medium text-foreground">Emotional Pivot</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sequence ID</span><span className="font-mono text-[10px] text-muted-foreground">SEG-004</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Start / End</span><span className="font-mono text-foreground">06:12 – 08:30</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className="text-segment font-semibold">98.4%</span></div>
          </div>
          <div className="mt-4 p-3 rounded-xl bg-surface-0/60 border border-border/20">
            <p className="text-[10px] font-medium text-accent mb-1 uppercase tracking-wide">Why This Was Selected</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              High emotional contrast — camera shift from wide to close-up combined with audio intensity spike creates a compelling narrative pivot.
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-xs font-semibold mb-4 uppercase tracking-wide text-foreground/70">Export Actions</h3>
          <div className="flex gap-3 mb-5">
            <Button variant="outline" className="flex-1 gap-2 rounded-xl text-xs h-9 border-border/40 hover:border-primary/40 hover:bg-primary/5">
              <FileJson className="h-3.5 w-3.5" /> Export JSON
            </Button>
            <Button className="flex-1 gap-2 rounded-xl text-xs h-9 glow-blue">
              <Download className="h-3.5 w-3.5" /> Download Reel
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">Quick Share</p>
          <div className="flex gap-2 mb-5">
            {[Link2, Cloud, Mail].map((Icon, i) => (
              <button key={i} className="h-8 w-8 rounded-xl bg-surface-2/60 hover:bg-surface-3/60 flex items-center justify-center transition-all duration-200 border border-border/20">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Activity className="h-3 w-3 text-segment" />
            <span>Processing Node: <span className="text-segment font-medium">Active</span></span>
          </div>
        </div>
      </div>

      {/* New Analysis */}
      <div className="flex justify-center mt-1">
        <Button variant="outline" size="sm" className="rounded-xl text-xs border-border/40 hover:border-primary/40 hover:bg-primary/5" onClick={() => navigate("/")}>
          ← New Analysis
        </Button>
      </div>
    </div>
  );
};

export default Results;
