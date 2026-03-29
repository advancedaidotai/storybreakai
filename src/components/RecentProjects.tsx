import { useNavigate } from "react-router-dom";
import { Clock, Film, Tv, Clapperboard, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import { useRecentProjects, type RecentProject } from "@/hooks/useRecentProjects";

function getProjectDisplayTitle(p: RecentProject): string {
  const meta = p.content_metadata as Record<string, any> | null;
  if (meta?.film_title) return meta.film_title;
  if (meta?.show_title) return meta.show_title;
  if (meta?.title) return meta.title;
  if (p.title && p.title !== "Untitled") return p.title;
  return "Untitled Project";
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  complete: { label: "Complete", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  highlights_done: { label: "Complete", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  ready: { label: "Complete", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  analyzing: { label: "Analyzing", className: "bg-primary/15 text-primary border-primary/20 animate-pulse" },
  segments_done: { label: "Analyzing", className: "bg-primary/15 text-primary border-primary/20 animate-pulse" },
  uploaded: { label: "Uploaded", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive border-destructive/20" },
  draft: { label: "Draft", className: "bg-muted/30 text-muted-foreground border-border/20" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ContentTypeBadge({ type }: { type: string | null }) {
  const isFilm = type === "feature_film";
  const Icon = isFilm ? Clapperboard : Tv;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 font-medium">
      <Icon className="h-3 w-3" />
      {isFilm ? "Film" : "Episode"}
    </span>
  );
}

function ProjectCard({ project }: { project: RecentProject }) {
  const navigate = useNavigate();
  const title = getProjectDisplayTitle(project);

  const handleClick = () => {
    const s = project.status;
    if (s === "analyzing" || s === "uploaded" || s === "segments_done" || s === "draft") {
      navigate(`/processing/${project.id}`);
    } else {
      navigate(`/results/${project.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex-shrink-0 w-[220px] rounded-xl border border-border/15 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.03] group cursor-pointer"
      style={{ backgroundColor: "hsl(222 25% 11%)" }}
    >
      {/* Thumbnail placeholder */}
      <div className="h-20 rounded-lg mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(222 30% 14%), hsl(222 25% 18%))" }}>
        <Film className="h-6 w-6 text-muted-foreground/25" />
      </div>

      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{title}</p>

      <div className="flex items-center gap-2 mt-2">
        <ContentTypeBadge type={project.content_type} />
        <span className="text-muted-foreground/30">·</span>
        <StatusBadge status={project.status} />
      </div>

      <p className="text-[10px] text-muted-foreground/50 mt-2">{relativeTime(project.created_at)}</p>
    </button>
  );
}

export default function RecentProjects() {
  const { data: projects, isLoading, error } = useRecentProjects();

  if (isLoading) {
    return (
      <div className="mt-10">
        <SectionHeader />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      </div>
    );
  }

  if (error) return null; // Silently fail — not critical

  if (!projects || projects.length === 0) {
    return (
      <div className="mt-10">
        <SectionHeader />
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border border-border/10" style={{ backgroundColor: "hsl(222 25% 9%)" }}>
          <Film className="h-8 w-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground/50">No projects yet. Upload your first video to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <SectionHeader />
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border/20 scrollbar-track-transparent">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground/50" />
        <h3 className="text-sm font-semibold text-foreground/80">Recent Projects</h3>
      </div>
    </div>
  );
}
