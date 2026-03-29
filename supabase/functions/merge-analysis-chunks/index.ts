import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SEGMENT_TYPES = ["opening", "climax", "story_unit", "transition", "resolution"];

interface Segment { start_sec: number; end_sec: number; type: string; summary?: string | null; confidence?: number | null; }
interface Breakpoint { timestamp_sec: number; type: string; reason?: string | null; confidence?: number | null; lead_in_sec?: number | null; valley_type?: string | null; ad_slot_duration_rec?: number | null; compliance_notes?: string | null; }
interface Highlight { start_sec: number; end_sec: number; score: number; reason?: string | null; rank_order?: number | null; }

interface ChunkData {
  chunk_index: number;
  start_sec: number;
  end_sec: number;
  overlap_start_sec: number | null;
  overlap_end_sec: number | null;
  pegasus_response: { segments: Segment[]; breakpoints: Breakpoint[]; highlights: Highlight[] };
}

// ─── De-duplication helpers ──────────────────────────────────────────────────

function isInOverlap(timestamp: number, nextChunkOverlapStart: number | null, nextChunkOverlapEnd: number | null): boolean {
  if (nextChunkOverlapStart == null || nextChunkOverlapEnd == null) return false;
  return timestamp >= nextChunkOverlapStart && timestamp <= nextChunkOverlapEnd;
}

function mergeSegments(chunks: ChunkData[]): Segment[] {
  const allSegments: Segment[] = [];

  for (const chunk of chunks) {
    const offsetStart = chunk.start_sec;
    for (const seg of chunk.pegasus_response.segments) {
      const absStart = seg.start_sec + offsetStart;
      const absEnd = seg.end_sec + offsetStart;

      // Skip segments entirely within this chunk's overlap zone if it's not the first occurrence
      if (chunk.overlap_start_sec != null && chunk.overlap_end_sec != null) {
        if (absStart >= chunk.overlap_start_sec && absEnd <= chunk.overlap_end_sec) {
          // Check if a previous chunk already covers this — skip
          const isDuplicate = allSegments.some(
            (s) => Math.abs(s.start_sec - absStart) < 30 && Math.abs(s.end_sec - absEnd) < 30 && s.type === seg.type
          );
          if (isDuplicate) continue;
        }
      }

      allSegments.push({ ...seg, start_sec: absStart, end_sec: absEnd });
    }
  }

  // Merge adjacent segments of same type that span chunk boundaries
  allSegments.sort((a, b) => a.start_sec - b.start_sec);
  const merged: Segment[] = [];
  for (const seg of allSegments) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type && seg.start_sec - last.end_sec < 60) {
      // Merge: extend the previous segment
      last.end_sec = Math.max(last.end_sec, seg.end_sec);
      if (seg.confidence != null && (last.confidence == null || seg.confidence > last.confidence)) {
        last.confidence = seg.confidence;
      }
      if (seg.summary && !last.summary) last.summary = seg.summary;
      else if (seg.summary && last.summary) last.summary = `${last.summary} ${seg.summary}`;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

function mergeBreakpoints(chunks: ChunkData[]): Breakpoint[] {
  const allBps: Breakpoint[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const offsetStart = chunk.start_sec;

    for (const bp of chunk.pegasus_response.breakpoints) {
      const absTimestamp = bp.timestamp_sec + offsetStart;
      const absLeadIn = bp.lead_in_sec != null ? bp.lead_in_sec + offsetStart : null;

      // De-duplicate: if a breakpoint within 30s already exists with higher confidence, skip
      const existing = allBps.find((b) => Math.abs(b.timestamp_sec - absTimestamp) < 30);
      if (existing) {
        // Keep higher confidence
        if ((bp.confidence ?? 0) > (existing.confidence ?? 0)) {
          Object.assign(existing, { ...bp, timestamp_sec: absTimestamp, lead_in_sec: absLeadIn });
        }
        continue;
      }

      allBps.push({ ...bp, timestamp_sec: absTimestamp, lead_in_sec: absLeadIn });
    }
  }

  allBps.sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  return allBps;
}

function mergeHighlights(chunks: ChunkData[]): Highlight[] {
  const allHls: Highlight[] = [];

  for (const chunk of chunks) {
    const offsetStart = chunk.start_sec;
    for (const hl of chunk.pegasus_response.highlights) {
      const absStart = hl.start_sec + offsetStart;
      const absEnd = hl.end_sec + offsetStart;

      // De-duplicate overlapping highlights
      const existing = allHls.find(
        (h) => Math.abs(h.start_sec - absStart) < 15 && Math.abs(h.end_sec - absEnd) < 15
      );
      if (existing) {
        if (hl.score > existing.score) {
          Object.assign(existing, { ...hl, start_sec: absStart, end_sec: absEnd });
        }
        continue;
      }

      allHls.push({ ...hl, start_sec: absStart, end_sec: absEnd });
    }
  }

  // Global re-scoring: normalize scores 0-1 across all highlights
  if (allHls.length > 0) {
    const maxScore = Math.max(...allHls.map((h) => h.score));
    const minScore = Math.min(...allHls.map((h) => h.score));
    const range = maxScore - minScore || 1;
    for (const hl of allHls) {
      hl.score = Number(((hl.score - minScore) / range).toFixed(3));
    }
  }

  // Re-rank
  allHls.sort((a, b) => b.score - a.score);
  allHls.forEach((hl, i) => { hl.rank_order = i + 1; });

  return allHls;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok", function: "merge-analysis-chunks" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.project_id;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "project_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all completed chunks
    const { data: chunks, error: chunkErr } = await supabase
      .from("analysis_chunks")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "complete")
      .order("chunk_index");

    if (chunkErr || !chunks || chunks.length === 0) {
      throw new Error("No completed analysis chunks found");
    }

    console.log(`[merge] Processing ${chunks.length} chunks for project ${projectId}`);

    const chunkData: ChunkData[] = chunks.map((c: any) => ({
      chunk_index: c.chunk_index,
      start_sec: c.start_sec,
      end_sec: c.end_sec,
      overlap_start_sec: c.overlap_start_sec,
      overlap_end_sec: c.overlap_end_sec,
      pegasus_response: c.pegasus_response,
    }));

    // Merge
    const mergedSegments = mergeSegments(chunkData);
    const mergedBreakpoints = mergeBreakpoints(chunkData);
    const mergedHighlights = mergeHighlights(chunkData);

    console.log(`[merge] Merged: ${mergedSegments.length} segments, ${mergedBreakpoints.length} breakpoints, ${mergedHighlights.length} highlights`);

    // Insert merged results
    if (mergedSegments.length > 0) {
      const { error: segErr } = await supabase.from("segments").insert(
        mergedSegments.map((s) => ({
          project_id: projectId!, start_sec: s.start_sec, end_sec: s.end_sec,
          type: SEGMENT_TYPES.includes(s.type) ? s.type : "story_unit",
          summary: s.summary, confidence: s.confidence,
        }))
      );
      if (segErr) throw new Error(`Failed to insert merged segments: ${segErr.message}`);
    }

    if (mergedBreakpoints.length > 0) {
      const { error: bpErr } = await supabase.from("breakpoints").insert(
        mergedBreakpoints.map((b) => ({
          project_id: projectId!, timestamp_sec: b.timestamp_sec, type: b.type,
          reason: b.reason, confidence: b.confidence, lead_in_sec: b.lead_in_sec,
          valley_type: b.valley_type, ad_slot_duration_rec: b.ad_slot_duration_rec,
          compliance_notes: b.compliance_notes,
        }))
      );
      if (bpErr) throw new Error(`Failed to insert merged breakpoints: ${bpErr.message}`);
    }

    if (mergedHighlights.length > 0) {
      const { error: hlErr } = await supabase.from("highlights").insert(
        mergedHighlights.map((h) => ({
          project_id: projectId!, start_sec: h.start_sec, end_sec: h.end_sec,
          score: h.score, reason: h.reason, rank_order: h.rank_order,
        }))
      );
      if (hlErr) throw new Error(`Failed to insert merged highlights: ${hlErr.message}`);
    }

    // Update project status
    await supabase.from("projects").update({ status: "highlights_done" }).eq("id", projectId);

    console.log(`[merge] Project ${projectId} merge complete`);

    return new Response(JSON.stringify({
      success: true, project_id: projectId,
      segments: mergedSegments.length, breakpoints: mergedBreakpoints.length, highlights: mergedHighlights.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[merge] Error for project ${projectId}:`, err.message);
    if (projectId) {
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId).catch(() => {});
    }
    return new Response(JSON.stringify({ error: err.message || "Merge failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
