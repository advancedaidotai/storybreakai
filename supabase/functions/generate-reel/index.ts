import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_BASE = "https://queue.fal.run";
const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total

// ─── AWS Signature helpers for presigned URLs ────────────────────────────────

function hmacSHA256(key: Uint8Array, msg: string): Promise<ArrayBuffer> {
  return crypto.subtle
    .importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((k) => crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, date: string, region: string, service: string) {
  let k = new Uint8Array(await hmacSHA256(new TextEncoder().encode("AWS4" + secret), date));
  k = new Uint8Array(await hmacSHA256(k, region));
  k = new Uint8Array(await hmacSHA256(k, service));
  k = new Uint8Array(await hmacSHA256(k, "aws4_request"));
  return k;
}

async function generatePresignedUrl(bucket: string, key: string, region: string, accessKey: string, secretKey: string, expirySec = 3600): Promise<string> {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expirySec),
    "X-Amz-SignedHeaders": "host",
  });

  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const canonicalQueryString = queryParams.toString().split("&").sort().join("&");
  const canonicalRequest = `GET\n/${encodedKey}\n${canonicalQueryString}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, "s3");
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return `https://${host}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, baseDelay = 2000): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`[generate-reel] Rate limited (429), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return resp;
  }
  throw new Error("Max retries exceeded for rate-limited request");
}

// ─── fal.ai queue helpers ────────────────────────────────────────────────────

async function falSubmit(endpoint: string, input: object, apiKey: string): Promise<string> {
  console.log(`[generate-reel] fal.ai submit: ${endpoint}`, JSON.stringify(input).slice(0, 200));
  const resp = await fetchWithRetry(`${FAL_BASE}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`fal.ai submit error (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  console.log(`[generate-reel] fal.ai request_id: ${data.request_id}`);
  return data.request_id;
}

async function falPollResult(endpoint: string, requestId: string, apiKey: string, deadlineMs: number): Promise<any> {
  const statusUrl = `${FAL_BASE}/${endpoint}/requests/${requestId}/status`;
  const resultUrl = `${FAL_BASE}/${endpoint}/requests/${requestId}`;

  while (Date.now() < deadlineMs) {
    const statusResp = await fetchWithRetry(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!statusResp.ok) {
      const errText = await statusResp.text();
      throw new Error(`fal.ai status error (${statusResp.status}): ${errText.slice(0, 300)}`);
    }

    const status = await statusResp.json();
    console.log(`[generate-reel] fal.ai poll ${requestId}: ${status.status}`);

    if (status.status === "COMPLETED") {
      const resultResp = await fetchWithRetry(resultUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!resultResp.ok) {
        const errText = await resultResp.text();
        throw new Error(`fal.ai result error (${resultResp.status}): ${errText.slice(0, 300)}`);
      }
      const result = await resultResp.json();
      console.log(`[generate-reel] fal.ai result for ${requestId}:`, JSON.stringify(result).slice(0, 300));
      return result;
    }

    if (status.status === "FAILED") {
      throw new Error(`fal.ai job failed: ${JSON.stringify(status.error || status)}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error("Reel generation timed out");
}

async function falRun(endpoint: string, input: object, apiKey: string, deadlineMs: number): Promise<any> {
  const requestId = await falSubmit(endpoint, input, apiKey);
  return await falPollResult(endpoint, requestId, apiKey, deadlineMs);
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok", function: "generate-reel" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let projectId: string | undefined;
  const pipelineDeadline = Date.now() + PIPELINE_TIMEOUT_MS;

  try {
    const body = await req.json();
    projectId = body.project_id;

    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const falApiKey = Deno.env.get("FAL_API_KEY");
    if (!falApiKey) throw new Error("FAL_API_KEY not configured");

    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY");
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY");
    const awsRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

    // 1) Fetch top 5 highlights by score, then re-order chronologically
    const { data: highlights, error: hlErr } = await supabase
      .from("highlights")
      .select("id, start_sec, end_sec, score, rank_order")
      .eq("project_id", projectId)
      .order("score", { ascending: false })
      .limit(5);

    if (hlErr || !highlights || highlights.length === 0) {
      throw new Error("No highlights found for project");
    }

    // Re-order chronologically for natural viewing flow
    highlights.sort((a: any, b: any) => Number(a.start_sec) - Number(b.start_sec));

    // Fetch video S3 URI
    const { data: video, error: vidErr } = await supabase
      .from("videos").select("s3_uri").eq("project_id", projectId).single();

    if (vidErr || !video?.s3_uri) throw new Error("Video not found for project");

    // 2) Generate presigned URL for fal.ai to access private S3 bucket
    const s3Uri = video.s3_uri as string;
    let videoUrl: string;

    if (s3Uri.startsWith("s3://") && awsAccessKey && awsSecretKey) {
      const withoutProtocol = s3Uri.slice(5);
      const slashIdx = withoutProtocol.indexOf("/");
      const bucket = withoutProtocol.slice(0, slashIdx);
      const key = withoutProtocol.slice(slashIdx + 1);
      videoUrl = await generatePresignedUrl(bucket, key, awsRegion, awsAccessKey, awsSecretKey, 3600);
      console.log(`[generate-reel] Generated presigned URL for S3 object (1h expiry)`);
    } else if (s3Uri.startsWith("s3://")) {
      // Fallback to public URL format
      const withoutProtocol = s3Uri.slice(5);
      const slashIdx = withoutProtocol.indexOf("/");
      const bucket = withoutProtocol.slice(0, slashIdx);
      const key = withoutProtocol.slice(slashIdx + 1);
      videoUrl = `https://${bucket}.s3.${awsRegion}.amazonaws.com/${key}`;
    } else {
      videoUrl = s3Uri;
    }

    // Update status
    await supabase.from("projects").update({ status: "generating_reel" }).eq("id", projectId);

    console.log(`[generate-reel] Trimming ${highlights.length} clips for project ${projectId}`);

    // 3) Trim all highlight clips in parallel — failures drop gracefully
    console.log(`[generate-reel] Trimming ${highlights.length} clips in parallel for project ${projectId}`);

    const trimResults = await Promise.allSettled(
      highlights.map(async (hl: any) => {
        console.log(`[generate-reel] Trimming highlight ${hl.id}: ${hl.start_sec}s → ${hl.end_sec}s`);
        const result = await falRun("fal-ai/workflow-utilities/trim-video", {
          video_url: videoUrl,
          start_time: Number(hl.start_sec),
          end_time: Number(hl.end_sec),
        }, falApiKey, pipelineDeadline);

        if (!result?.video?.url) {
          throw new Error(`No video URL returned for highlight ${hl.id}`);
        }
        console.log(`[generate-reel] Trimmed clip ready: ${result.video.url.slice(0, 80)}...`);
        return { url: result.video.url, start_sec: Number(hl.start_sec) };
      })
    );

    // Collect successful clips in chronological order
    const trimmedClips = trimResults
      .map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[generate-reel] Trim failed for highlight ${highlights[i].id}, skipping: ${(r as PromiseRejectedResult).reason?.message}`);
        return null;
      })
      .filter(Boolean) as { url: string; start_sec: number }[];

    trimmedClips.sort((a, b) => a.start_sec - b.start_sec);
    const trimmedUrls = trimmedClips.map((c) => c.url);

    if (trimmedUrls.length === 0) {
      throw new Error("All clip trims failed — no clips available for reel");
    }

    // 4) Merge all trimmed clips with cross-dissolve transition
    if (Date.now() >= pipelineDeadline) throw new Error("Reel generation timed out");

    console.log(`[generate-reel] Merging ${trimmedUrls.length} clips`);
    const mergeResult = await falRun("fal-ai/ffmpeg-api/merge-videos", {
      video_urls: trimmedUrls,
      transition: "xfade",
      transition_duration: 0.5,
    }, falApiKey, pipelineDeadline);

    if (!mergeResult?.video?.url) {
      throw new Error("Merge failed: no video URL in response");
    }

    const reelUrl = mergeResult.video.url;
    console.log(`[generate-reel] Reel ready: ${reelUrl.slice(0, 120)}`);

    // 5) Store in exports table
    const { error: exportErr } = await supabase.from("exports").insert({
      project_id: projectId, type: "reel", file_url: reelUrl,
    });
    if (exportErr) throw new Error(`Failed to save export: ${exportErr.message}`);

    // 6) Update status to complete
    await supabase.from("projects").update({ status: "complete" }).eq("id", projectId);

    console.log(`[generate-reel] Project ${projectId} reel generation complete (${trimmedUrls.length} clips)`);

    return new Response(
      JSON.stringify({ success: true, project_id: projectId, reel_url: reelUrl, clips_count: trimmedUrls.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(`[generate-reel] Error for project ${projectId}:`, err.message);

    if (projectId) {
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId).catch(() => {});
    }

    return new Response(
      JSON.stringify({ error: err.message || "Reel generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
