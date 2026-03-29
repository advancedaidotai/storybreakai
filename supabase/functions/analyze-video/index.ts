import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Normalization helpers ───────────────────────────────────────────────────

function clamp01(value: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

interface AnalysisLog {
  project_id: string;
  log_type: string;
  message: string;
  raw_data?: unknown;
}

async function flushLogs(supabase: any, logs: AnalysisLog[]) {
  if (logs.length === 0) return;
  const { error } = await supabase.from("analysis_logs").insert(logs);
  if (error) console.error(`[analyze-video] Failed to flush ${logs.length} analysis logs:`, error.message);
}

// ─── AWS Signature V4 helpers ────────────────────────────────────────────────

function hmacSHA256(key: Uint8Array, msg: string): Promise<ArrayBuffer> {
  return crypto.subtle
    .importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((k) => crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, date: string, region: string, service: string) {
  let k = new Uint8Array(await hmacSHA256(new TextEncoder().encode("AWS4" + secret), date));
  k = new Uint8Array(await hmacSHA256(k, region));
  k = new Uint8Array(await hmacSHA256(k, service));
  k = new Uint8Array(await hmacSHA256(k, "aws4_request"));
  return k;
}

async function signedBedrockRequest(params: {
  region: string; accessKey: string; secretKey: string; modelId: string; body: object;
}): Promise<Response> {
  const { region, accessKey, secretKey, modelId, body } = params;
  const service = "bedrock";
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(modelId)}/invoke`;
  const url = `https://${host}${path}`;
  const payload = JSON.stringify(body);
  const payloadBytes = new TextEncoder().encode(payload);
  const payloadHash = await sha256(payloadBytes);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const canonicalRequestHash = await sha256(new TextEncoder().encode(canonicalRequest));
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalRequestHash].join("\n");
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Amz-Date": amzDate, Authorization: authorization, Accept: "application/json" },
    body: payload,
  });
}

// ─── Constants & types ───────────────────────────────────────────────────────

const DELIVERY_LABELS: Record<string, string> = {
  youtube: "YouTube (3-5 minute ad-break intervals)",
  cable_vod: "Cable/VOD (8-12 minute ad-break intervals)",
  cable: "Cable (8-12 minute ad-break intervals)",
  broadcast: "Broadcast/Master (act structure breaks)",
  ott: "OTT/Streaming (flexible mid-roll ad placements)",
};

const CONTENT_TYPE_PROMPTS: Record<string, string> = {
  tv_episode: "This is a TV episode. Identify act breaks, cold opens, and commercial break points. Segments should map to TV act structure (teaser/act-1/act-2/act-3/tag).",
  feature_film: "This is a feature film. Identify three-act structure (setup/confrontation/resolution), major plot points, inciting incident, midpoint reversal, climax, and denouement. Breakpoints should identify natural intermission points and reel changes.",
};

const SEGMENT_TYPES = ["opening", "climax", "story_unit", "transition", "resolution"];
const VALLEY_TYPES = ["dialogue_pause", "topic_shift", "emotional_resolution", "scene_transition"];

const CHUNK_DURATION = 45 * 60; // 45 min chunks
const OVERLAP_DURATION = 5 * 60; // 5 min overlap
const MAX_SINGLE_PASS = 3600; // 60 min

interface RawSegment { start_sec: number; end_sec: number; type: string; summary?: string; confidence?: number; }
interface RawBreakpoint { timestamp_sec: number; type: string; reason?: string; confidence?: number; lead_in_sec?: number; valley_type?: string; ad_slot_duration_rec?: number; compliance_notes?: string; }
interface RawHighlight { start_sec: number; end_sec: number; score: number; reason?: string; rank_order?: number; }
interface AnalysisResult { segments: RawSegment[]; breakpoints: RawBreakpoint[]; highlights: RawHighlight[]; }

function validateAndClean(raw: unknown, projectId: string): { result: AnalysisResult; logs: AnalysisLog[] } {
  const logs: AnalysisLog[] = [];
  if (!raw || typeof raw !== "object") throw new Error("Response is not an object");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.segments)) throw new Error("Missing segments array");
  if (!Array.isArray(obj.breakpoints)) throw new Error("Missing breakpoints array");
  if (!Array.isArray(obj.highlights)) throw new Error("Missing highlights array");

  // ── Segments: filter invalid, clamp confidence ──
  const segments: RawSegment[] = [];
  for (let i = 0; i < obj.segments.length; i++) {
    const s = obj.segments[i] as any;
    if (typeof s.start_sec !== "number" || typeof s.end_sec !== "number" || s.end_sec <= s.start_sec) {
      logs.push({ project_id: projectId, log_type: "skipped_segment", message: `Segment ${i}: invalid time range (start=${s.start_sec}, end=${s.end_sec})`, raw_data: s });
      continue;
    }
    const rawConf = typeof s.confidence === "number" ? s.confidence : null;
    const clampedConf = rawConf !== null ? clamp01(rawConf) : null;
    if (rawConf !== null && rawConf !== clampedConf) {
      logs.push({ project_id: projectId, log_type: "clamped_score", message: `Segment ${i}: confidence clamped from ${rawConf} to ${clampedConf}`, raw_data: { original: rawConf, clamped: clampedConf } });
    }
    segments.push({
      start_sec: s.start_sec, end_sec: s.end_sec,
      type: SEGMENT_TYPES.includes(s.type) ? s.type : "story_unit",
      summary: typeof s.summary === "string" ? s.summary : null,
      confidence: clampedConf,
    });
  }

  // ── Breakpoints: filter invalid, clamp confidence ──
  const breakpoints: RawBreakpoint[] = [];
  for (let i = 0; i < obj.breakpoints.length; i++) {
    const b = obj.breakpoints[i] as any;
    if (typeof b.timestamp_sec !== "number" || b.timestamp_sec <= 0) {
      logs.push({ project_id: projectId, log_type: "skipped_breakpoint", message: `Breakpoint ${i}: invalid timestamp_sec (${b.timestamp_sec})`, raw_data: b });
      continue;
    }
    const rawConf = typeof b.confidence === "number" ? b.confidence : 0.5;
    const clampedConf = clamp01(rawConf);
    if (rawConf !== clampedConf) {
      logs.push({ project_id: projectId, log_type: "clamped_score", message: `Breakpoint ${i}: confidence clamped from ${rawConf} to ${clampedConf}`, raw_data: { original: rawConf, clamped: clampedConf } });
    }
    breakpoints.push({
      timestamp_sec: b.timestamp_sec, type: typeof b.type === "string" ? b.type : "natural_pause",
      reason: typeof b.reason === "string" ? b.reason : "Natural narrative pause detected",
      confidence: clampedConf,
      lead_in_sec: typeof b.lead_in_sec === "number" ? b.lead_in_sec : 3,
      valley_type: VALLEY_TYPES.includes(b.valley_type) ? b.valley_type : "scene_transition",
      ad_slot_duration_rec: typeof b.ad_slot_duration_rec === "number" ? b.ad_slot_duration_rec : 30,
      compliance_notes: typeof b.compliance_notes === "string" ? b.compliance_notes : "No specific compliance flags",
    });
  }

  // ── Highlights: filter invalid, clamp score ──
  const highlights: RawHighlight[] = [];
  for (let i = 0; i < obj.highlights.length; i++) {
    const h = obj.highlights[i] as any;
    if (typeof h.start_sec !== "number" || typeof h.end_sec !== "number" || h.end_sec <= h.start_sec) {
      logs.push({ project_id: projectId, log_type: "skipped_highlight", message: `Highlight ${i}: invalid time range (start=${h.start_sec}, end=${h.end_sec})`, raw_data: h });
      continue;
    }
    const rawScore = typeof h.score === "number" ? h.score : 0;
    // Normalize: if score looks like 0-100 range, convert to 0-1
    const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;
    const clampedScore = clamp01(normalizedScore);
    if (rawScore !== clampedScore) {
      logs.push({ project_id: projectId, log_type: "clamped_score", message: `Highlight ${i}: score normalized from ${rawScore} to ${clampedScore}`, raw_data: { original: rawScore, clamped: clampedScore } });
    }
    highlights.push({
      start_sec: h.start_sec, end_sec: h.end_sec, score: clampedScore,
      reason: typeof h.reason === "string" ? h.reason : null,
      rank_order: typeof h.rank_order === "number" ? h.rank_order : i + 1,
    });
  }

  if (segments.length === 0) {
    logs.push({ project_id: projectId, log_type: "parse_error", message: "AI returned no valid segments after normalization", raw_data: { original_count: obj.segments.length } });
  }

  logs.push({ project_id: projectId, log_type: "info", message: `Normalization complete: ${segments.length} segments, ${breakpoints.length} breakpoints, ${highlights.length} highlights (filtered ${obj.segments.length - segments.length}s, ${obj.breakpoints.length - breakpoints.length}b, ${obj.highlights.length - highlights.length}h)` });

  return { result: { segments, breakpoints, highlights }, logs };
}

function extractJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim());
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return JSON.parse(braceMatch[0]);
  throw new Error("Could not extract JSON from AI response");
}

// ─── Build prompt ────────────────────────────────────────────────────────────

const DELIVERY_PROMPT_RULES: Record<string, string> = {
  youtube: "This is for YouTube delivery. Place ad breaks every 3-5 minutes. Favor frequent, short breaks at conversational pauses or topic transitions. Viewers expect mid-roll ads; place them where engagement dips naturally.",
  cable_vod: "This is for Cable/VOD delivery. Place ad breaks every 8-12 minutes following standard cable commercial pod timing. Align breaks with scene transitions and act-outs. Each break should feel like a natural 'commercial bumper' moment.",
  cable: "This is for Cable delivery. Place ad breaks every 8-12 minutes following standard cable commercial pod timing. Align breaks with scene transitions and act-outs. Each break should feel like a natural 'commercial bumper' moment.",
  broadcast: "This is for Broadcast/Master delivery. Follow strict broadcast act structure with breaks only at act boundaries. Breaks must align with fade-to-black or established act-out patterns. Compliance with broadcast standards is critical.",
  ott: "This is for OTT/Streaming delivery. Place mid-roll ad breaks at natural narrative valleys with flexible timing (typically every 5-10 minutes). Optimize for viewer retention — breaks should feel organic, not forced. Favor moments where the viewer would naturally pause. Shorter, more frequent breaks are preferred over long commercial pods.",
};

function buildPrompt(opts: {
  s3Uri: string; deliveryLabel: string; deliveryTarget: string; contentType?: string;
  chunkContext?: { index: number; total: number; startMin: number; endMin: number; totalMin: number };
}): string {
  const { s3Uri, deliveryLabel, deliveryTarget, contentType, chunkContext } = opts;
  const contentTypeExtra = contentType && CONTENT_TYPE_PROMPTS[contentType] ? ` ${CONTENT_TYPE_PROMPTS[contentType]}` : "";
  const deliveryRules = DELIVERY_PROMPT_RULES[deliveryTarget] || DELIVERY_PROMPT_RULES.broadcast;

  let chunkPrefix = "";
  if (chunkContext) {
    chunkPrefix = `You are analyzing chunk ${chunkContext.index} of ${chunkContext.total} (from ${chunkContext.startMin}m to ${chunkContext.endMin}m) of a ${contentType || "video"}. The full video is ${chunkContext.totalMin} minutes. Analyze this portion and return timestamps RELATIVE to the start of this chunk (starting at 0). `;
  }

  return `${chunkPrefix}You are a senior Broadcast Standards & Practices editor with 20 years of experience in ad-break placement and content segmentation. Your task is to analyze the video at ${s3Uri} for ${deliveryLabel} format and identify optimal ad-break insertion points.${contentTypeExtra}

${deliveryRules}

CRITICAL CONSTRAINTS:
- NEVER cut mid-sentence or mid-dialogue. Wait for a natural speech pause or sentence completion.
- NEVER cut mid-action or during a physical movement sequence. Wait for the action to resolve.
- NEVER cut during high-intensity music, crescendos, or emotional musical peaks. Wait for the music to settle or transition.
- NEVER place a break within 30 seconds of a previous break ending.

BREAKPOINT DETECTION — Identify 5-7 Semantic Narrative Valleys:
A Semantic Narrative Valley is a moment where narrative tension, dialogue density, and musical intensity are all simultaneously low — creating an organic pause where an ad break feels natural rather than intrusive.

For each breakpoint return:
- timestamp_sec: exact second of the proposed break
- lead_in_sec: seconds before the break where a transition graphic could be inserted (typically 2-5 seconds before)
- valley_type: one of "dialogue_pause" (gap between speakers or after a monologue), "topic_shift" (conversation changes subject or new scene topic), "emotional_resolution" (emotional beat has resolved, e.g. character makes a decision), "scene_transition" (visual cut between locations or time periods)
- reason: a detailed 1-2 sentence explanation of WHY this is a good break point, referencing the specific narrative moment
- confidence: 0.0-1.0 score of break quality
- ad_slot_duration_rec: recommended ad slot duration in seconds (15, 30, 60, 90, or 120)
- compliance_notes: any broadcast compliance observations (e.g., "Clean fade to black detected", "Scene ends on wide establishing shot — safe cut point", "No active dialogue or music at this timestamp")
- type: "natural_pause" or "act_break"

SEGMENTS — Return 4-8 narrative segments:
Each with start_sec, end_sec, type (opening/story_unit/transition/climax/resolution), summary (1-2 sentence description), confidence (0.0-1.0).

HIGHLIGHTS — Return top 5-10 most engaging moments:
Score each by: semantic_importance (plot significance) + emotional_intensity (performance energy) + transition_strength (visual dynamism) + pacing_shift (rhythm change) + usability (standalone clip potential).
Each with start_sec, end_sec, score (0-100), reason (why this moment stands out), rank_order (1 = best).

All timestamps in seconds. Return ONLY valid JSON with keys: segments, breakpoints, highlights.`;
}

// ─── Bedrock call with response parsing ──────────────────────────────────────

async function callPegasus(prompt: string, projectId: string): Promise<{ result: AnalysisResult; logs: AnalysisLog[] }> {
  const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY")!;
  const awsSecretKey = Deno.env.get("AWS_SECRET_KEY")!;
  const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

  const bedrockResp = await signedBedrockRequest({
    region: bedrockRegion, accessKey: awsAccessKey, secretKey: awsSecretKey,
    modelId: "twelvelabs.pegasus-1-2-v1:0",
    body: { inputText: prompt, textGenerationConfig: { maxTokenCount: 4096, temperature: 0.2, topP: 0.9 } },
  });

  if (!bedrockResp.ok) {
    const errText = await bedrockResp.text();
    throw new Error(`Bedrock API error (${bedrockResp.status}): ${errText.slice(0, 500)}`);
  }

  const bedrockData = await bedrockResp.json();
  let responseText: string;
  if (bedrockData?.results?.[0]?.outputText) responseText = bedrockData.results[0].outputText;
  else if (bedrockData?.output?.text) responseText = bedrockData.output.text;
  else if (typeof bedrockData?.body === "string") responseText = bedrockData.body;
  else responseText = JSON.stringify(bedrockData);

  console.log(`[analyze-video] Raw response length: ${responseText.length}`);
  const rawJSON = extractJSON(responseText);
  return validateAndClean(rawJSON, projectId);
}

// ─── Single-pass insert ──────────────────────────────────────────────────────

async function insertResults(supabase: any, projectId: string, analysis: AnalysisResult) {
  const { error: segErr } = await supabase.from("segments").insert(
    analysis.segments.map((s) => ({ project_id: projectId, start_sec: s.start_sec, end_sec: s.end_sec, type: s.type, summary: s.summary, confidence: s.confidence }))
  );
  if (segErr) throw new Error(`Failed to insert segments: ${segErr.message}`);

  const { error: bpErr } = await supabase.from("breakpoints").insert(
    analysis.breakpoints.map((b) => ({ project_id: projectId, timestamp_sec: b.timestamp_sec, type: b.type, reason: b.reason, confidence: b.confidence, lead_in_sec: b.lead_in_sec, valley_type: b.valley_type, ad_slot_duration_rec: b.ad_slot_duration_rec, compliance_notes: b.compliance_notes }))
  );
  if (bpErr) throw new Error(`Failed to insert breakpoints: ${bpErr.message}`);

  const { error: hlErr } = await supabase.from("highlights").insert(
    analysis.highlights.map((h) => ({ project_id: projectId, start_sec: h.start_sec, end_sec: h.end_sec, score: h.score, reason: h.reason, rank_order: h.rank_order }))
  );
  if (hlErr) throw new Error(`Failed to insert highlights: ${hlErr.message}`);
}

// ─── Chunk boundary calculation ──────────────────────────────────────────────

function calculateChunks(durationSec: number): { start_sec: number; end_sec: number; overlap_start_sec: number | null; overlap_end_sec: number | null }[] {
  const chunks: { start_sec: number; end_sec: number; overlap_start_sec: number | null; overlap_end_sec: number | null }[] = [];
  let start = 0;
  while (start < durationSec) {
    const end = Math.min(start + CHUNK_DURATION, durationSec);
    const overlapStart = start > 0 ? start : null;
    const overlapEnd = start > 0 ? Math.min(start + OVERLAP_DURATION, end) : null;
    chunks.push({ start_sec: start, end_sec: end, overlap_start_sec: overlapStart, overlap_end_sec: overlapEnd });
    start = end - OVERLAP_DURATION;
    if (start >= durationSec) break;
    if (end >= durationSec) break;
  }
  return chunks;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.project_id;
    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "project_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch video + project
    const { data: video, error: vidErr } = await supabase.from("videos").select("s3_uri, duration_sec").eq("project_id", projectId).single();
    if (vidErr || !video?.s3_uri) {
      return new Response(JSON.stringify({ error: "Video not found for project" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: project } = await supabase.from("projects").select("delivery_target, content_type, duration_sec").eq("id", projectId).single();
    const deliveryTarget = project?.delivery_target || "youtube";
    const deliveryLabel = DELIVERY_LABELS[deliveryTarget] || DELIVERY_LABELS.youtube;
    const contentType = project?.content_type || "short_form";
    const durationSec = project?.duration_sec || video.duration_sec || 0;

    if (!Deno.env.get("AWS_ACCESS_KEY") || !Deno.env.get("AWS_SECRET_KEY")) throw new Error("AWS credentials not configured");

    // Update status
    await supabase.from("projects").update({ status: "analyzing" }).eq("id", projectId);

    // ─── Strategy router ─────────────────────────────────────────────
    const useMultiPass = durationSec > MAX_SINGLE_PASS;

    if (!useMultiPass) {
      // ── SINGLE-PASS ──────────────────────────────────────────────
      console.log(`[analyze-video] SINGLE-PASS for project ${projectId} (${durationSec}s, ${contentType})`);
      const prompt = buildPrompt({ s3Uri: video.s3_uri, deliveryLabel, deliveryTarget, contentType });
      const { result: analysis, logs } = await callPegasus(prompt, projectId);
      await flushLogs(supabase, logs);

      if (analysis.segments.length === 0) {
        await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
        return new Response(JSON.stringify({ error: "AI returned no valid segments after normalization" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[analyze-video] Parsed: ${analysis.segments.length} segments, ${analysis.breakpoints.length} breakpoints, ${analysis.highlights.length} highlights`);
      await insertResults(supabase, projectId, analysis);
      await supabase.from("projects").update({ status: "segments_done" }).eq("id", projectId);
      await supabase.from("projects").update({ status: "highlights_done" }).eq("id", projectId);
      console.log(`[analyze-video] Project ${projectId} single-pass complete`);
    } else {
      // ── MULTI-PASS (one chunk per invocation, self-re-invoke) ──

      // Check if chunk records already exist (resuming)
      const { data: existingChunks } = await supabase
        .from("analysis_chunks")
        .select("chunk_index, status")
        .eq("project_id", projectId)
        .order("chunk_index");

      if (!existingChunks || existingChunks.length === 0) {
        // First invocation: create chunk records
        const chunks = calculateChunks(durationSec);
        console.log(`[analyze-video] MULTI-PASS INIT for project ${projectId}: ${chunks.length} chunks, ${durationSec}s total`);

        const chunkRecords = chunks.map((c, i) => ({
          project_id: projectId!,
          chunk_index: i + 1,
          start_sec: c.start_sec,
          end_sec: c.end_sec,
          overlap_start_sec: c.overlap_start_sec,
          overlap_end_sec: c.overlap_end_sec,
          status: "pending" as const,
        }));
        const { error: chunkInsertErr } = await supabase.from("analysis_chunks").insert(chunkRecords);
        if (chunkInsertErr) throw new Error(`Failed to create chunk records: ${chunkInsertErr.message}`);
      }

      // Re-fetch chunks to find the next pending one
      const { data: allChunks } = await supabase
        .from("analysis_chunks")
        .select("chunk_index, start_sec, end_sec, overlap_start_sec, overlap_end_sec, status")
        .eq("project_id", projectId)
        .order("chunk_index");

      if (!allChunks || allChunks.length === 0) throw new Error("No chunk records found");

      const totalChunks = allChunks.length;
      const completedCount = allChunks.filter((c: any) => c.status === "complete").length;
      const failedChunk = allChunks.find((c: any) => c.status === "failed");
      const nextPending = allChunks.find((c: any) => c.status === "pending" || c.status === "analyzing");

      if (failedChunk && !nextPending) {
        // A chunk failed previously and no pending work — mark project failed
        throw new Error(`Chunk ${failedChunk.chunk_index} previously failed`);
      }

      if (!nextPending) {
        // All chunks complete — trigger merge
        console.log(`[analyze-video] All ${totalChunks} chunks complete — dispatching merge for project ${projectId}`);
        await supabase.from("projects").update({ status: "segments_done" }).eq("id", projectId);

        const mergeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/merge-analysis-chunks`;
        const mergeResp = await fetch(mergeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ project_id: projectId }),
        });
        if (!mergeResp.ok) {
          const mergeErr = await mergeResp.text();
          throw new Error(`Merge failed: ${mergeErr}`);
        }
        console.log(`[analyze-video] Merge dispatch complete for project ${projectId}`);

        return new Response(JSON.stringify({ success: true, project_id: projectId, mode: "multi_pass", phase: "merge_complete" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Process ONE chunk ──────────────────────────────────────
      const chunk = nextPending;
      const chunkNum = chunk.chunk_index;
      const totalMin = Math.round(durationSec / 60);

      console.log(`[analyze-video] CHUNK START ${chunkNum}/${totalChunks} (${chunk.start_sec}s-${chunk.end_sec}s) for project ${projectId}`);
      await supabase.from("analysis_chunks").update({ status: "analyzing" }).eq("project_id", projectId).eq("chunk_index", chunkNum);

      try {
        const prompt = buildPrompt({
          s3Uri: video.s3_uri,
          deliveryLabel,
          deliveryTarget,
          contentType,
          chunkContext: {
            index: chunkNum,
            total: totalChunks,
            startMin: Math.round(chunk.start_sec / 60),
            endMin: Math.round(chunk.end_sec / 60),
            totalMin,
          },
        });

        const { result: analysis, logs: chunkLogs } = await callPegasus(prompt, projectId);
        await flushLogs(supabase, chunkLogs);

        await supabase.from("analysis_chunks").update({
          status: "complete",
          pegasus_response: { segments: analysis.segments, breakpoints: analysis.breakpoints, highlights: analysis.highlights },
        }).eq("project_id", projectId).eq("chunk_index", chunkNum);

        console.log(`[analyze-video] CHUNK SUCCESS ${chunkNum}/${totalChunks}: ${analysis.segments.length}s, ${analysis.breakpoints.length}b, ${analysis.highlights.length}h`);
      } catch (chunkErr: any) {
        console.error(`[analyze-video] CHUNK FAILED ${chunkNum}/${totalChunks}:`, chunkErr.message);
        await supabase.from("analysis_chunks").update({ status: "failed" }).eq("project_id", projectId).eq("chunk_index", chunkNum);
        throw new Error(`Chunk ${chunkNum} analysis failed: ${chunkErr.message}`);
      }

      // ── Fire-and-forget: re-invoke self for next chunk ─────────
      const remainingAfterThis = totalChunks - (completedCount + 1);
      if (remainingAfterThis > 0) {
        console.log(`[analyze-video] NEXT-CHUNK DISPATCH: ${remainingAfterThis} chunks remaining for project ${projectId}`);
        const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-video`;
        // Fire-and-forget — don't await the full response
        fetch(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ project_id: projectId }),
        }).catch((e) => console.error(`[analyze-video] Self-invoke failed:`, e.message));
      } else {
        // This was the last chunk — re-invoke to trigger merge path
        console.log(`[analyze-video] FINAL CHUNK DONE — re-invoking for merge dispatch, project ${projectId}`);
        const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-video`;
        fetch(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ project_id: projectId }),
        }).catch((e) => console.error(`[analyze-video] Self-invoke for merge failed:`, e.message));
      }
    }

    return new Response(JSON.stringify({ success: true, project_id: projectId, mode: useMultiPass ? "multi_pass" : "single_pass" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[analyze-video] Error for project ${projectId}:`, err.message);
    if (projectId) {
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId).catch(() => {});
    }
    return new Response(JSON.stringify({ error: err.message || "Analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
