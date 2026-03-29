import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_BASE = "https://queue.fal.run";

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 4,
  baseDelay = 1000
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`[generate-reel] Rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return resp;
  }
  throw new Error("Max retries exceeded");
}

// ─── fal.ai queue helpers ────────────────────────────────────────────────────

async function falSubmit(endpoint: string, input: object, apiKey: string): Promise<string> {
  const resp = await fetchWithRetry(`${FAL_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`fal.ai submit error (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  return data.request_id;
}

async function falPollResult(endpoint: string, requestId: string, apiKey: string, timeoutMs = 300000): Promise<any> {
  const statusUrl = `${FAL_BASE}/${endpoint}/requests/${requestId}/status`;
  const resultUrl = `${FAL_BASE}/${endpoint}/requests/${requestId}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const statusResp = await fetchWithRetry(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!statusResp.ok) {
      const errText = await statusResp.text();
      throw new Error(`fal.ai status error (${statusResp.status}): ${errText.slice(0, 300)}`);
    }

    const status = await statusResp.json();

    if (status.status === "COMPLETED") {
      const resultResp = await fetchWithRetry(resultUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!resultResp.ok) {
        const errText = await resultResp.text();
        throw new Error(`fal.ai result error (${resultResp.status}): ${errText.slice(0, 300)}`);
      }
      return await resultResp.json();
    }

    if (status.status === "FAILED") {
      throw new Error(`fal.ai job failed: ${JSON.stringify(status.error || status)}`);
    }

    // IN_QUEUE or IN_PROGRESS — wait and retry
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error("fal.ai job timed out after 5 minutes");
}

async function falRun(endpoint: string, input: object, apiKey: string): Promise<any> {
  const requestId = await falSubmit(endpoint, input, apiKey);
  console.log(`[generate-reel] fal.ai job submitted: ${endpoint} → ${requestId}`);
  return await falPollResult(endpoint, requestId, apiKey);
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.project_id;

    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const falApiKey = Deno.env.get("FAL_API_KEY");
    if (!falApiKey) {
      throw new Error("FAL_API_KEY not configured");
    }

    // 1) Fetch top highlights by score
    const { data: highlights, error: hlErr } = await supabase
      .from("highlights")
      .select("id, start_sec, end_sec, score, rank_order")
      .eq("project_id", projectId)
      .order("score", { ascending: false })
      .limit(8);

    if (hlErr || !highlights || highlights.length === 0) {
      throw new Error("No highlights found for project");
    }

    // Sort by start_sec for chronological reel order
    highlights.sort((a: any, b: any) => a.start_sec - b.start_sec);

    // Fetch video s3_uri
    const { data: video, error: vidErr } = await supabase
      .from("videos")
      .select("s3_uri")
      .eq("project_id", projectId)
      .single();

    if (vidErr || !video?.s3_uri) {
      throw new Error("Video not found for project");
    }

    // Convert s3:// URI to HTTPS URL for fal.ai
    const s3Uri = video.s3_uri as string;
    let videoUrl: string;
    if (s3Uri.startsWith("s3://")) {
      const withoutProtocol = s3Uri.slice(5);
      const slashIdx = withoutProtocol.indexOf("/");
      const bucket = withoutProtocol.slice(0, slashIdx);
      const key = withoutProtocol.slice(slashIdx + 1);
      const region = Deno.env.get("BEDROCK_REGION") || "us-east-1";
      videoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    } else {
      videoUrl = s3Uri;
    }

    // 2) Update status
    await supabase.from("projects").update({ status: "generating_reel" }).eq("id", projectId);

    console.log(`[generate-reel] Trimming ${highlights.length} clips for project ${projectId}`);

    // 3) Trim each highlight clip
    const trimmedUrls: string[] = [];

    for (const hl of highlights) {
      console.log(`[generate-reel] Trimming ${hl.start_sec}s → ${hl.end_sec}s`);
      const result = await falRun("fal-ai/workflow-utilities/trim-video", {
        video_url: videoUrl,
        start_time: Number(hl.start_sec),
        end_time: Number(hl.end_sec),
      }, falApiKey);

      if (!result?.video?.url) {
        throw new Error(`Trim failed for highlight ${hl.id}: no video URL in response`);
      }

      trimmedUrls.push(result.video.url);
      console.log(`[generate-reel] Trimmed clip ready: ${result.video.url.slice(0, 80)}...`);
    }

    // 4) Merge all trimmed clips
    console.log(`[generate-reel] Merging ${trimmedUrls.length} clips`);
    const mergeResult = await falRun("fal-ai/ffmpeg-api/merge-videos", {
      video_urls: trimmedUrls,
    }, falApiKey);

    if (!mergeResult?.video?.url) {
      throw new Error("Merge failed: no video URL in response");
    }

    const reelUrl = mergeResult.video.url;
    console.log(`[generate-reel] Reel ready: ${reelUrl.slice(0, 80)}...`);

    // 5) Store in exports table
    const { error: exportErr } = await supabase.from("exports").insert({
      project_id: projectId,
      type: "reel",
      file_url: reelUrl,
    });

    if (exportErr) {
      console.error("[generate-reel] Export insert error:", exportErr.message);
      throw new Error(`Failed to save export: ${exportErr.message}`);
    }

    // 6) Update status to complete
    await supabase.from("projects").update({ status: "complete" }).eq("id", projectId);

    console.log(`[generate-reel] Project ${projectId} reel generation complete`);

    return new Response(
      JSON.stringify({
        success: true,
        project_id: projectId,
        reel_url: reelUrl,
        clips_count: trimmedUrls.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[generate-reel] Error for project ${projectId}:`, err.message);

    if (projectId) {
      await supabase
        .from("projects")
        .update({ status: "failed" })
        .eq("id", projectId)
        .catch(() => {});
    }

    return new Response(
      JSON.stringify({ error: err.message || "Reel generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
