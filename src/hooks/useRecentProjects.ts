import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RecentProject {
  id: string;
  title: string;
  content_type: string | null;
  content_metadata: Record<string, any> | null;
  status: string;
  created_at: string;
}

async function fetchRecentProjects(): Promise<RecentProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, content_type, content_metadata, status, created_at")
    .neq("status", "archived" as any)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as RecentProject[];
}

export function useRecentProjects() {
  return useQuery({
    queryKey: ["recent-projects"],
    queryFn: fetchRecentProjects,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
