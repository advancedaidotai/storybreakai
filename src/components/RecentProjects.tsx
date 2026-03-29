import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Film, Tv, Clapperboard, Loader2, MoreVertical, Archive, Trash2 } from "lucide-react";
import { useRecentProjects, type RecentProject } from "@/hooks/useRecentProjects";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const ACTIVE_STATUSES = ["analyzing", "generating_reel", "segments_done"];

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

function ProjectCard({
  project,
  onArchive,
  onRequestDelete,
}: {
  project: RecentProject;
  onArchive: (id: string) => void;
  onRequestDelete: (project: RecentProject) => void;
}) {
  const navigate = useNavigate();
  const title = getProjectDisplayTitle(project);
  const isActive = ACTIVE_STATUSES.includes(project.status);

  const handleClick = () => {
    const s = project.status;
    const title = getProjectDisplayTitle(project);
    if (s === "analyzing" || s === "generating_reel" || s === "segments_done") {
      toast({ title: `Resuming project: ${title}` });
      navigate(`/processing/${project.id}`);
    } else if (s === "uploaded" || s === "draft") {
      toast({ title: `Resuming project: ${title}`, description: "Pre-filling form with project metadata." });
      navigate("/");
    } else {
      toast({ title: `Resuming project: ${title}` });
      navigate(`/results/${project.id}`);
    }
  };

  return (
    <div
      className="relative flex-shrink-0 w-[220px] rounded-xl border border-border/15 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.03] group cursor-pointer"
      style={{ backgroundColor: "hsl(222 25% 11%)" }}
      onClick={handleClick}
    >
      {/* Kebab menu */}
      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 w-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5">
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => onArchive(project.id)}
              className="gap-2 text-xs text-muted-foreground cursor-pointer"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
            {isActive ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Cannot delete while analysis is in progress
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenuItem
                onClick={() => onRequestDelete(project)}
                className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
    </div>
  );
}

export default function RecentProjects() {
  const { data: projects, isLoading, error } = useRecentProjects();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<RecentProject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const optimisticRemove = useCallback(
    (id: string) => {
      queryClient.setQueryData<RecentProject[]>(["recent-projects"], (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
    },
    [queryClient]
  );

  const optimisticRestore = useCallback(
    (project: RecentProject) => {
      queryClient.setQueryData<RecentProject[]>(["recent-projects"], (old) => {
        if (!old) return [project];
        const exists = old.some((p) => p.id === project.id);
        if (exists) return old;
        return [...old, project].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    },
    [queryClient]
  );

  const handleArchive = useCallback(
    async (id: string) => {
      const project = projects?.find((p) => p.id === id);
      optimisticRemove(id);
      toast({ title: "Project archived" });

      const { error: err } = await supabase
        .from("projects")
        .update({ status: "archived" as any })
        .eq("id", id);

      if (err) {
        if (project) optimisticRestore(project);
        toast({ title: "Failed to archive", description: err.message, variant: "destructive" });
      }
    },
    [projects, optimisticRemove, optimisticRestore]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const project = deleteTarget;
    setDeleting(true);
    optimisticRemove(project.id);
    setDeleteTarget(null);

    // CASCADE deletes handle related tables automatically
    const { error: err } = await supabase.from("projects").delete().eq("id", project.id);

    if (err) {
      optimisticRestore(project);
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    } else {
      toast({ title: "Project deleted" });
    }
    setDeleting(false);
  }, [deleteTarget, optimisticRemove, optimisticRestore]);

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

  if (error) return null;

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
          <ProjectCard
            key={p.id}
            project={p}
            onArchive={handleArchive}
            onRequestDelete={setDeleteTarget}
          />
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all associated data (video, segments, breakpoints, highlights, exports). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
