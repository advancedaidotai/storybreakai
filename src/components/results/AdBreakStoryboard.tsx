import { useState, useMemo, useRef } from "react";
import { Zap, Timer, Shield, Play, MessageCircle, ArrowRightLeft, Heart, Film, ChevronDown, ChevronUp } from "lucide-react";
import { useThumbnailCapture } from "@/hooks/useThumbnailCapture";

interface Breakpoint {
  id: string;
  timestamp_sec: number;
  type: string | null;
  reason: string | null;
  confidence: number | null;
  lead_in_sec: number | null;
  valley_type: string | null;
  ad_slot_duration_rec: number | null;
  compliance_notes: string | null;
}

type ViewMode = "grid" | "list" | "timeline";

const VALLEY_ICONS: Record<string, { icon: typeof MessageCircle; label: string; emoji: string }> = {
  dialogue_pause: { icon: MessageCircle, label: "Dialogue Pause", emoji: "💬" },
  topic_shift: { icon: ArrowRightLeft, label: "Topic Shift", emoji: "🔄" },
  emotional_resolution: { icon: Heart, label: "Emotional Resolution", emoji: "💫" },
  scene_transition: { icon: Film, label: "Scene Transition", emoji: "🎬" },
};

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function confidenceColor(c: number | null): { bg: string; text: string; border: string } {
  if (c === null) return { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-muted/30" };
  if (c >= 0.85) return { bg: "bg-[#10B981]/20", text: "text-[#10B981]", border: "border-[#10B981]/30" };
  if (c >= 0.65) return { bg: "bg-[#F59E0B]/20", text: "text-[#F59E0B]", border: "border-[#F59E0B]/30" };
  return { bg: "bg-[#EF4444]/20", text: "text-[#EF4444]", border: "border-[#EF4444]/30" };
}

interface AdBreakStoryboardProps {
  breakpoints: Breakpoint[];
  videoRef: React.RefObject<HTMLVideoElement>;
  onBreakpointSelect: (bp: Breakpoint) => void;
  selectedBreakpointId: string | null;
  currentTime: number;
  totalDuration: number;
}

export function AdBreakStoryboard({
  breakpoints,
  videoRef,
  onBreakpointSelect,
  selectedBreakpointId,
  currentTime,
  totalDuration,
}: AdBreakStoryboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const timestamps = useMemo(
    () => breakpoints.map((bp) => bp.timestamp_sec),
    [breakpoints]
  );
  const { thumbnails, loading: thumbnailsLoading } = useThumbnailCapture(videoRef, timestamps);

  // Determine active card based on current playback
  const activeCardId = useMemo(() => {
    for (let i = breakpoints.length - 1; i >= 0; i--) {
      const bp = breakpoints[i];
      const leadIn = bp.lead_in_sec ?? 3;
      const start = bp.timestamp_sec - leadIn - 5;
      const end = bp.timestamp_sec + 5;
      if (currentTime >= start && currentTime <= end) return bp.id;
    }
    return null;
  }, [breakpoints, currentTime]);

  if (breakpoints.length === 0) {
    return (
      <div className="glass-panel-elevated rounded-2xl p-8 text-center">
        <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <h2 className="font-semibold text-sm text-foreground/70 mb-1">No Ad Breaks Detected</h2>
        <p className="text-xs text-muted-foreground/50">The AI analysis did not identify any ad break insertion points for this content.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel-elevated rounded-2xl p-5">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-xs tracking-wide uppercase text-foreground/80 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-breakpoint" /> Where to Place Ad Breaks
        </h2>
        <div className="flex items-center gap-1 bg-surface-0/60 rounded-full p-0.5 border border-border/20">
          {(["grid", "list", "timeline"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all capitalize ${
                viewMode === mode
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "grid" ? "Grid View" : mode === "list" ? "List View" : "Timeline"}
            </button>
          ))}
        </div>
      </div>

      {/* Now Previewing indicator */}
      {selectedBreakpointId && (
        <div className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <Play className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-medium text-primary">
            Now Previewing: Break {breakpoints.findIndex((bp) => bp.id === selectedBreakpointId) + 1}
          </span>
        </div>
      )}

      {viewMode === "grid" && (
        <GridView
          breakpoints={breakpoints}
          thumbnails={thumbnails}
          thumbnailsLoading={thumbnailsLoading}
          onSelect={onBreakpointSelect}
          selectedId={selectedBreakpointId}
          activeId={activeCardId}
        />
      )}
      {viewMode === "list" && (
        <ListView
          breakpoints={breakpoints}
          thumbnails={thumbnails}
          thumbnailsLoading={thumbnailsLoading}
          onSelect={onBreakpointSelect}
          selectedId={selectedBreakpointId}
          activeId={activeCardId}
        />
      )}
      {viewMode === "timeline" && (
        <TimelineView
          breakpoints={breakpoints}
          thumbnails={thumbnails}
          thumbnailsLoading={thumbnailsLoading}
          onSelect={onBreakpointSelect}
          selectedId={selectedBreakpointId}
          activeId={activeCardId}
          totalDuration={totalDuration}
        />
      )}
    </div>
  );
}

// ─── Grid View ────────────────────────────────────────────────────────────────

function GridView({
  breakpoints, thumbnails, thumbnailsLoading, onSelect, selectedId, activeId,
}: {
  breakpoints: Breakpoint[];
  thumbnails: Record<number, string>;
  thumbnailsLoading: boolean;
  onSelect: (bp: Breakpoint) => void;
  selectedId: string | null;
  activeId: string | null;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {breakpoints.map((bp, i) => (
        <GridCard
          key={bp.id}
          bp={bp}
          index={i}
          thumbnail={thumbnails[bp.timestamp_sec]}
          thumbnailLoading={thumbnailsLoading && !thumbnails[bp.timestamp_sec]}
          onSelect={onSelect}
          isSelected={selectedId === bp.id}
          isActive={activeId === bp.id}
        />
      ))}
    </div>
  );
}

function GridCard({
  bp, index, thumbnail, thumbnailLoading, onSelect, isSelected, isActive,
}: {
  bp: Breakpoint;
  index: number;
  thumbnail?: string;
  thumbnailLoading: boolean;
  onSelect: (bp: Breakpoint) => void;
  isSelected: boolean;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const valley = VALLEY_ICONS[bp.valley_type || ""] || VALLEY_ICONS.scene_transition;
  const conf = confidenceColor(bp.confidence);

  return (
    <div
      onClick={() => onSelect(bp)}
      className={`rounded-xl cursor-pointer transition-all duration-300 overflow-hidden border-2
        ${isActive ? "storyboard-card-active" : ""}
        ${isSelected ? "border-[#3B82F6] ring-1 ring-[#3B82F6]/30 scale-[1.02] shadow-[0_0_20px_rgba(59,130,246,0.15)]" : "border-[#1F2937] hover:border-[#374151] hover:scale-[1.01]"}
      `}
      style={{ backgroundColor: "#111827" }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface-0">
        {thumbnail ? (
          <img src={thumbnail} alt={`Break ${index + 1}`} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br from-[#1F2937] to-[#111827] flex items-center justify-center ${thumbnailLoading ? "animate-pulse" : ""}`}>
            <Zap className="h-6 w-6 text-muted-foreground/20" />
          </div>
        )}
        {/* Break number badge (top-left) */}
        <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm">
          BREAK {index + 1}
        </span>
        {/* Timestamp overlay (bottom-right, YouTube style) */}
        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
          {formatTime(bp.timestamp_sec)}
        </span>
      </div>

      {/* Card body */}
      <div className="p-3.5">
        {/* Valley type + confidence */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{valley.emoji}</span>
            <span className="text-[11px] font-semibold text-foreground">{valley.label}</span>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${conf.bg} ${conf.text} ${conf.border}`}>
            {bp.confidence !== null ? `${(bp.confidence * 100).toFixed(0)}%` : "—"}
          </span>
        </div>

        {/* Reason text (truncated) */}
        {bp.reason && (
          <div className="mb-2">
            <p className={`text-[11px] text-muted-foreground/80 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
              {bp.reason}
            </p>
            {bp.reason.length > 100 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5 mt-0.5"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
              </button>
            )}
          </div>
        )}

        {/* Lead-in + Ad slot duration */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {bp.lead_in_sec != null && (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> {bp.lead_in_sec}s lead-in
            </span>
          )}
          {bp.ad_slot_duration_rec != null && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" /> {bp.ad_slot_duration_rec}s ad slot
            </span>
          )}
        </div>

        {/* Preview button */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(bp); }}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-medium transition-colors border border-primary/20"
        >
          <Play className="h-3 w-3" /> Preview
        </button>
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  breakpoints, thumbnails, thumbnailsLoading, onSelect, selectedId, activeId,
}: {
  breakpoints: Breakpoint[];
  thumbnails: Record<number, string>;
  thumbnailsLoading: boolean;
  onSelect: (bp: Breakpoint) => void;
  selectedId: string | null;
  activeId: string | null;
}) {
  return (
    <div className="space-y-2">
      {breakpoints.map((bp, i) => {
        const valley = VALLEY_ICONS[bp.valley_type || ""] || VALLEY_ICONS.scene_transition;
        const conf = confidenceColor(bp.confidence);
        const isSelected = selectedId === bp.id;
        const isActive = activeId === bp.id;
        const thumbnail = thumbnails[bp.timestamp_sec];

        return (
          <div
            key={bp.id}
            onClick={() => onSelect(bp)}
            className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 border-2
              ${isActive ? "storyboard-card-active" : ""}
              ${isSelected ? "border-[#3B82F6] bg-[#3B82F6]/5" : "border-[#1F2937] hover:border-[#374151]"}
            `}
            style={{ backgroundColor: isSelected ? undefined : "#111827" }}
          >
            {/* Thumbnail */}
            <div className="w-28 h-16 rounded-lg overflow-hidden shrink-0 relative">
              {thumbnail ? (
                <img src={thumbnail} alt={`Break ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br from-[#1F2937] to-[#111827] flex items-center justify-center ${thumbnailsLoading ? "animate-pulse" : ""}`}>
                  <Zap className="h-4 w-4 text-muted-foreground/20" />
                </div>
              )}
              <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-mono font-bold px-1 py-0.5 rounded">
                {formatTime(bp.timestamp_sec)}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-muted-foreground/60">BREAK {i + 1}</span>
                <span className="text-[11px]">{valley.emoji} {valley.label}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${conf.bg} ${conf.text} ${conf.border}`}>
                  {bp.confidence !== null ? `${(bp.confidence * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
              {bp.reason && (
                <p className="text-[10px] text-muted-foreground/70 line-clamp-1">{bp.reason}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground/50">
                {bp.lead_in_sec != null && <span>{bp.lead_in_sec}s lead-in</span>}
                {bp.ad_slot_duration_rec != null && <span>{bp.ad_slot_duration_rec}s ad slot</span>}
              </div>
            </div>

            {/* Preview button */}
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(bp); }}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-medium transition-colors border border-primary/20"
            >
              <Play className="h-3 w-3" /> Preview
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({
  breakpoints, thumbnails, thumbnailsLoading, onSelect, selectedId, activeId, totalDuration,
}: {
  breakpoints: Breakpoint[];
  thumbnails: Record<number, string>;
  thumbnailsLoading: boolean;
  onSelect: (bp: Breakpoint) => void;
  selectedId: string | null;
  activeId: string | null;
  totalDuration: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dur = totalDuration || 1;

  return (
    <div className="relative">
      {/* Timeline bar */}
      <div className="h-1 bg-surface-0/80 rounded-full mb-6 mx-4 relative border border-border/20">
        {breakpoints.map((bp) => {
          const pos = (bp.timestamp_sec / dur) * 100;
          return (
            <div
              key={`dot-${bp.id}`}
              className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 ${
                selectedId === bp.id ? "bg-[#3B82F6] border-[#3B82F6]" : "bg-breakpoint border-breakpoint/60"
              }`}
              style={{ left: `${pos}%`, transform: "translate(-50%, -50%)" }}
            />
          );
        })}
      </div>

      {/* Scrollable thumbnail strip */}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin px-2">
        {breakpoints.map((bp, i) => {
          const valley = VALLEY_ICONS[bp.valley_type || ""] || VALLEY_ICONS.scene_transition;
          const conf = confidenceColor(bp.confidence);
          const isSelected = selectedId === bp.id;
          const isActive = activeId === bp.id;
          const thumbnail = thumbnails[bp.timestamp_sec];

          return (
            <div
              key={bp.id}
              onClick={() => onSelect(bp)}
              className={`flex-shrink-0 w-[180px] cursor-pointer transition-all duration-200 rounded-xl overflow-hidden border-2
                ${isActive ? "storyboard-card-active" : ""}
                ${isSelected ? "border-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.2)]" : "border-[#1F2937] hover:border-[#374151]"}
              `}
              style={{ backgroundColor: "#111827" }}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video">
                {thumbnail ? (
                  <img src={thumbnail} alt={`Break ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br from-[#1F2937] to-[#111827] flex items-center justify-center ${thumbnailsLoading ? "animate-pulse" : ""}`}>
                    <Zap className="h-4 w-4 text-muted-foreground/20" />
                  </div>
                )}
                <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {i + 1}
                </span>
              </div>

              <div className="p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-foreground">{formatTime(bp.timestamp_sec)}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${conf.bg} ${conf.text} ${conf.border}`}>
                    {bp.confidence !== null ? `${(bp.confidence * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px]">{valley.emoji}</span>
                  <span className="text-[9px] text-muted-foreground truncate">{valley.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1 px-4 text-[9px] text-muted-foreground/40 font-mono">
        <span>00:00</span>
        <span>{formatTime(dur / 4)}</span>
        <span>{formatTime(dur / 2)}</span>
        <span>{formatTime((dur * 3) / 4)}</span>
        <span>{formatTime(dur)}</span>
      </div>
    </div>
  );
}
