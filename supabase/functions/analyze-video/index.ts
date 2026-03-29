import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { BedrockRuntimeClient, InvokeModelCommand } from "npm:@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { STSClient, GetCallerIdentityCommand } from "npm:@aws-sdk/client-sts";

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

// ─── Constants & types ───────────────────────────────────────────────────────

const DELIVERY_LABELS: Record<string, string> = {
  youtube: "YouTube (3-5 minute ad-break intervals)",
  cable_vod: "Cable/VOD (8-12 minute ad-break intervals)",
  cable: "Cable (8-12 minute ad-break intervals)",
  broadcast: "Broadcast/Master (act structure breaks)",
  ott: "OTT/Streaming (flexible mid-roll ad placements)",
  streaming: "Streaming (chapter markers & minimal mid-rolls)",
  social: "Social Media (hooks, clips & engagement peaks)",
};

const CONTENT_TYPE_PROMPTS: Record<string, string | ((durationSec: number) => string)> = {
  short_form: (durationSec: number) => {
    if (durationSec <= 60) {
      return "This is ultra-short content (under 1 minute). Identify the hook (first 3 seconds), the core message, and the call-to-action. Do not place mid-roll breaks. Focus on clip boundaries and peak engagement moments.";
    }
    if (durationSec <= 300) {
      return "This is short-form content (under 5 minutes). Identify a tight narrative arc: hook, build, payoff. Place at most 1 mid-roll break at the strongest scene transition. Focus on pacing and engagement peaks. Identify segments suitable for social media repurposing.";
    }
    return "This is short-form content. Identify the narrative structure with emphasis on pacing and engagement. Place breaks at natural transition points — topic shifts, scene changes, or tonal shifts. Keep segments concise and identify the most engaging moments for highlights.";
  },

  tv_episode: "This is a TV episode. Identify act breaks, cold opens, and commercial break points. Segments should map to TV act structure (teaser/cold-open → act-1 → act-2 → act-3 → tag/outro). The cold open should be identified as a distinct segment. Each act break should be a dramatic beat — a cliffhanger, revelation, or emotional peak that motivates viewers to return after the break.",

  feature_film: (durationSec: number) => {
    if (durationSec < 1800) {
      return "This is a short film. Identify the narrative arc: setup, rising action, climax, and resolution. Focus on scene transitions and tonal shifts as natural break points. The compact format means fewer but more impactful segment boundaries.";
    }
    return "This is a feature film. Identify the three-act structure: Act I (setup, inciting incident — first 25%), Act II (confrontation, rising action, midpoint reversal — middle 50%), Act III (climax, resolution, denouement — final 25%). Mark major plot points, turning points, and emotional peaks. Breakpoints should identify natural intermission points and reel changes that respect the dramatic flow.";
  },
};

const SEGMENT_TYPES = ["opening", "climax", "story_unit", "transition", "resolution"];
const VALLEY_TYPES = ["dialogue_pause", "topic_shift", "emotional_resolution", "scene_transition"];

const CHUNK_DURATION = 7200; // 2 hours — raised for demo safety to avoid multi-pass bugs
const OVERLAP_DURATION = 5 * 60; // 5 min overlap
const MAX_SINGLE_PASS = 3600; // 60 min

interface RawSegment { start_sec: number; end_sec: number; type: string; summary?: string; confidence?: number; }
interface RawBreakpoint { timestamp_sec: number; type: string; reason?: string; confidence?: number; lead_in_sec?: number; valley_type?: string; ad_slot_duration_rec?: number; compliance_notes?: string; }
interface RawHighlight { start_sec: number; end_sec: number; score: number; reason?: string; rank_order?: number; }
interface AnalysisResult { segments: RawSegment[]; breakpoints: RawBreakpoint[]; highlights: RawHighlight[]; }

function normalizeKnownAnalysisError(message: string): string {
  const msg = message.toLowerCase();

  if (msg.includes("unprocessable video") || msg.includes("video format not supported") || msg.includes("codec")) {
    return "This video can't be processed by the AI model in its current format. Please re-encode it to H.264 video + AAC audio in an MP4 container, then retry.";
  }

  if (msg.includes("s3location not found") || msg.includes("video file not found in storage")) {
    return "The video file could not be found in storage. It may have been deleted or the upload didn't complete. Please re-upload the video and try again.";
  }

  if (msg.includes("failed to download video (404)")) {
    return "The video URL is not reachable (404). Please verify the exact direct video URL and try again.";
  }

  if (msg.includes("failed to download video")) {
    return "The video URL could not be downloaded by the analysis service. Please verify the link is public and directly points to a video file.";
  }

  if (msg.includes("video file too large")) {
    return "The video file exceeds the maximum allowed size for processing. Please use a smaller file or compress it and retry.";
  }

  return message;
}

function isKnownAnalysisInputError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("s3location not found") ||
    msg.includes("video file not found in storage") ||
    msg.includes("unprocessable video") ||
    msg.includes("video format not supported") ||
    msg.includes("codec") ||
    msg.includes("failed to download video") ||
    msg.includes("unsupported video uri scheme") ||
    msg.includes("video file too large") ||
    msg.includes("no response body from video url") ||
    msg.includes("no valid segments after normalization")
  );
}

function validateAndClean(raw: unknown, projectId: string): { result: AnalysisResult; logs: AnalysisLog[] } {
  const logs: AnalysisLog[] = [];
  if (!raw || typeof raw !== "object") throw new Error("Response is not an object");
  const obj = raw as Record<string, unknown>;

  // Default to empty arrays if missing or malformed (handles truncated JSON)
  if (!Array.isArray(obj.segments)) {
    logs.push({ project_id: projectId, log_type: "parse_error", message: `Missing or malformed segments array, defaulting to empty`, raw_data: { got: typeof obj.segments } });
    obj.segments = [];
  }
  if (!Array.isArray(obj.breakpoints)) {
    logs.push({ project_id: projectId, log_type: "parse_error", message: `Missing or malformed breakpoints array, defaulting to empty`, raw_data: { got: typeof obj.breakpoints } });
    obj.breakpoints = [];
  }
  if (!Array.isArray(obj.highlights)) {
    logs.push({ project_id: projectId, log_type: "parse_error", message: `Missing or malformed highlights array, defaulting to empty`, raw_data: { got: typeof obj.highlights } });
    obj.highlights = [];
  }

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

function repairTruncatedJSON(text: string): string {
  // Close open strings, arrays, and objects
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = text;
  // Close open string
  if (inString) repaired += '"';
  // Remove trailing comma before closing
  repaired = repaired.replace(/,\s*$/, "");
  // Close all open brackets/braces in reverse order
  while (stack.length > 0) repaired += stack.pop();
  return repaired;
}

function extractJSON(text: string): unknown {
  // Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // Code block extraction
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {
      try { return JSON.parse(repairTruncatedJSON(codeBlockMatch[1].trim())); } catch { /* continue */ }
    }
  }

  // Brace extraction
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {
      try { return JSON.parse(repairTruncatedJSON(braceMatch[0])); } catch { /* continue */ }
    }
  }

  // Last resort: find the opening brace and repair everything after it
  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    const partial = text.slice(firstBrace);
    try { return JSON.parse(repairTruncatedJSON(partial)); } catch { /* continue */ }
  }

  throw new Error("Could not extract JSON from AI response");
}

// ─── Build prompt ────────────────────────────────────────────────────────────

const DELIVERY_PROMPT_RULES: Record<string, string | ((durationSec: number) => string)> = {
  youtube: (durationSec: number) => {
    if (durationSec < 480) {
      return "This is for YouTube delivery. The video is under 8 minutes, so mid-roll ads are not eligible. Focus on identifying a strong pre-roll moment and optimal chapter markers for viewer navigation. Identify natural pause points where end-cards or overlays could appear.";
    }
    return "This is for YouTube delivery. Place mid-roll ad breaks every 3-5 minutes at natural engagement dips. The first break should come at 3-4 minutes to hook viewers first. Favor conversational pauses, topic transitions, and moments where viewers naturally look away. YouTube viewers expect mid-rolls; place them where they feel earned, not intrusive. Also identify chapter marker candidates for the description.";
  },

  social: "This is for Social Media delivery (TikTok, Instagram Reels, YouTube Shorts). Focus on identifying the hook (first 3 seconds), peak engagement moments, and natural clip boundaries for repurposing. For content over 60 seconds, identify 1 maximum mid-roll point at a strong scene transition. Prioritize thumb-stop moments and emotional peaks. Identify segments that work as standalone 15-30 second clips.",

  ott: "This is for OTT/Streaming delivery (platforms like Hulu, Peacock, Max, Disney+). Place mid-roll ad breaks at natural narrative valleys every 5-10 minutes. Ad pods should be brief (30-90 seconds recommended). Optimize for viewer retention — breaks should feel organic, never mid-scene or mid-dialogue. Server-Side Ad Insertion (SSAI) compatibility is important: breaks should have clean in/out points. Identify pre-roll and post-roll positions as well.",

  cable: "This is for Cable TV delivery. Place commercial breaks every 8-12 minutes following standard cable pod timing (14-16 minutes of ads per hour total). Align breaks with scene transitions and act-outs. Each break should feel like a natural 'going to commercial' moment. The first break should come earlier (6-8 minutes) to establish the hook. Commercial pods are typically 2-4 minutes each. Ensure break points have clean audio fade-outs.",

  cable_vod: "This is for Cable VOD / On-Demand delivery. Place Dynamic Ad Insertion (DAI) markers every 10-12 minutes. VOD has approximately 50% fewer ad minutes than linear cable. Ad pods should be shorter (30-60 seconds). Also generate chapter markers for viewer scrubbing/navigation. Consider binge-watching transitions — identify natural episode-end-like moments. DAI markers need frame-accurate in/out points.",

  broadcast: (durationSec: number) => {
    if (durationSec <= 1800) {
      return "This is for Broadcast TV delivery (30-minute format). Follow strict network act structure: Teaser/Cold Open, then breaks at approximately 7, 14, and 19 minutes. Total commercial time: 8 minutes per half-hour. Breaks MUST align with fade-to-black, act-out dialogue beats, or established act-break patterns. FCC compliance is critical. Each act should have a mini-cliffhanger or dramatic beat before the break.";
    }
    if (durationSec <= 3600) {
      return "This is for Broadcast TV delivery (60-minute format). Follow strict network act structure with 5-6 act breaks at approximately 11, 22, 33, 40, and 48 minutes. Total commercial time: 16 minutes per hour. Breaks MUST align with fade-to-black, act-out dialogue beats, or established act-break patterns. FCC compliance is critical. Each act should end with a dramatic beat, revelation, or cliffhanger to retain viewers through the commercial pod.";
    }
    return "This is for Broadcast/Master delivery of long-form content. Place breaks at natural act boundaries and intermission points, approximately every 15-20 minutes. Breaks must align with fade-to-black or established act-out patterns. For theatrical content, identify reel change points. Compliance with broadcast standards is critical.";
  },

  streaming: "This is for Streaming platform delivery (Netflix, Apple TV+, Amazon Prime style). Focus on chapter markers rather than ad breaks — these platforms may not have ads. Identify natural chapter boundaries every 8-12 minutes for viewer navigation. Mark skip-intro and skip-recap candidates. Identify binge-worthy cliffhanger moments at the end. If ad-supported tier is targeted, place minimal non-intrusive mid-roll markers every 10-15 minutes.",
};

function getExpectedCounts(durationSec: number, deliveryTarget: string): {
  bpMin: number; bpMax: number; segMin: number; segMax: number; hlMin: number; hlMax: number;
} {
  const breakIntervals: Record<string, number> = {
    youtube: 240,
    social: 0,
    ott: 450,
    cable: 540,
    cable_vod: 660,
    broadcast: 480,
    streaming: 480,
  };

  const interval = breakIntervals[deliveryTarget] || 450;

  if (deliveryTarget === "social") {
    return {
      bpMin: 0, bpMax: Math.max(1, Math.floor(durationSec / 180)),
      segMin: 2, segMax: Math.max(3, Math.ceil(durationSec / 60)),
      hlMin: 2, hlMax: Math.max(3, Math.ceil(durationSec / 30)),
    };
  }

  if (deliveryTarget === "youtube" && durationSec < 480) {
    return {
      bpMin: 0, bpMax: 1,
      segMin: 2, segMax: 4,
      hlMin: 2, hlMax: 5,
    };
  }

  if (deliveryTarget === "broadcast") {
    if (durationSec <= 1800) {
      return { bpMin: 2, bpMax: 4, segMin: 3, segMax: 5, hlMin: 3, hlMax: 6 };
    } else if (durationSec <= 3600) {
      return { bpMin: 4, bpMax: 6, segMin: 4, segMax: 8, hlMin: 5, hlMax: 10 };
    } else {
      const estBp = Math.max(2, Math.floor(durationSec / 1200));
      return { bpMin: estBp, bpMax: estBp + 2, segMin: 5, segMax: 12, hlMin: 5, hlMax: 10 };
    }
  }

  const estBp = Math.max(1, Math.round(durationSec / interval));
  const bpMin = Math.max(1, estBp - 1);
  const bpMax = estBp + 2;

  const estSeg = Math.max(2, Math.ceil(durationSec / 150));
  const segMin = Math.max(2, Math.min(estSeg, 5));
  const segMax = Math.max(segMin + 2, Math.min(estSeg + 4, 15));

  const estHl = Math.max(2, Math.ceil(durationSec / 120));
  const hlMin = Math.max(2, Math.min(estHl, 5));
  const hlMax = Math.max(hlMin + 3, Math.min(estHl + 5, 15));

  return { bpMin, bpMax, segMin, segMax, hlMin, hlMax };
}

function buildPrompt(opts: {
  s3Uri: string; deliveryLabel: string; deliveryTarget: string; contentType?: string; durationSec: number;
  chunkContext?: { index: number; total: number; startMin: number; endMin: number; totalMin: number };
}): string {
  const { s3Uri, deliveryLabel, deliveryTarget, contentType, durationSec, chunkContext } = opts;

  const contentTypeRule = contentType ? CONTENT_TYPE_PROMPTS[contentType] : undefined;
  const contentTypeExtra = contentTypeRule
    ? ` ${typeof contentTypeRule === "function" ? contentTypeRule(durationSec) : contentTypeRule}`
    : "";

  const deliveryRule = DELIVERY_PROMPT_RULES[deliveryTarget] || DELIVERY_PROMPT_RULES.ott;
  const deliveryRules = typeof deliveryRule === "function" ? deliveryRule(durationSec) : deliveryRule;

  const counts = getExpectedCounts(durationSec, deliveryTarget);

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

BREAKPOINT DETECTION — Identify ${counts.bpMin}-${counts.bpMax} Semantic Narrative Valleys:
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

SEGMENTS — Return ${counts.segMin}-${counts.segMax} narrative segments:
Each with start_sec, end_sec, type (opening/story_unit/transition/climax/resolution), summary (1-2 sentence description), confidence (0.0-1.0).

HIGHLIGHTS — Return top ${counts.hlMin}-${counts.hlMax} most engaging moments:
Score each by: semantic_importance (plot significance) + emotional_intensity (performance energy) + transition_strength (visual dynamism) + pacing_shift (rhythm change) + usability (standalone clip potential).
Each with start_sec, end_sec, score (0-100), reason (why this moment stands out), rank_order (1 = best).

All timestamps in seconds. Return ONLY valid JSON with keys: segments, breakpoints, highlights.`;
}

// ─── Bedrock call with response parsing ──────────────────────────────────────

let cachedAwsAccountId: string | null = null;

async function getAwsAccountId(accessKeyId: string, secretAccessKey: string, region: string): Promise<string> {
  if (cachedAwsAccountId) return cachedAwsAccountId;

  const stsClient = new STSClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  if (!identity.Account) {
    throw new Error("Unable to resolve AWS account ID for Bedrock mediaSource.s3Location.bucketOwner");
  }

  cachedAwsAccountId = identity.Account;
  return cachedAwsAccountId;
}

async function callPegasus(
  prompt: string,
  projectId: string,
  s3Uri: string,
): Promise<{ result: AnalysisResult; logs: AnalysisLog[] }> {
  const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY")!;
  const awsSecretKey = Deno.env.get("AWS_SECRET_KEY")!;
  const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

  if (!s3Uri.startsWith("s3://")) {
    throw new Error(`Pegasus requires an s3:// video URI, received: ${s3Uri.slice(0, 120)}`);
  }

  // Parse bucket and key from s3:// URI
  const s3Parts = s3Uri.replace("s3://", "").split("/");
  const checkBucket = s3Parts[0];
  const checkKey = s3Parts.slice(1).join("/");
  const s3Region = Deno.env.get("S3_REGION") || bedrockRegion;

  // Pre-flight: verify file exists in S3 before sending to Bedrock
  const s3Client = new S3Client({
    region: s3Region,
    credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
  });
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: checkBucket, Key: checkKey }));
    console.log(`[analyze-video] S3 pre-flight OK: ${s3Uri}`);
  } catch (headErr: any) {
    console.error(`[analyze-video] S3 pre-flight FAILED for ${s3Uri}:`, headErr?.message || headErr);
    throw new Error(`Video file not found in storage (${s3Uri}). The upload may have failed or the file was deleted. Please re-upload and try again.`);
  }

  const awsAccountId = await getAwsAccountId(awsAccessKey, awsSecretKey, bedrockRegion);

  const bedrockClient = new BedrockRuntimeClient({
    region: bedrockRegion,
    credentials: {
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
    },
  });

  let bedrockData: any;

  const command = new InvokeModelCommand({
    modelId: "twelvelabs.pegasus-1-2-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputPrompt: prompt,
      mediaSource: {
        s3Location: {
          uri: s3Uri,
          bucketOwner: awsAccountId,
        },
      },
    }),
  });

  const sendWithTimeout = async (isRetry = false): Promise<any> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min timeout
    try {
      const response = await bedrockClient.send(command, { abortSignal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (err: any) {
      clearTimeout(timeout);
      const errMsg = err?.message || String(err);

      // Check for non-retryable Bedrock errors
      if (errMsg.includes("Unprocessable video") || errMsg.includes("error_code\":400")) {
        throw new Error(`Video format not supported by AI model. The video may use an unsupported codec (try H.264/MP4) or exceed the maximum duration per analysis pass. Original error: ${errMsg}`);
      }
      if (errMsg.includes("S3Location not found") || errMsg.includes("Provided S3Location")) {
        throw new Error(`S3Location not found — the video file could not be accessed by the AI model. Please re-upload the video and try again.`);
      }

      if (!isRetry) {
        console.warn(`[analyze-video] Bedrock call failed (${errMsg}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        return sendWithTimeout(true);
      }
      throw err;
    }
  };

  try {
    const response = await sendWithTimeout();

    // Decode Uint8Array response body
    let rawBodyString: string;
    if (response.body instanceof Uint8Array) {
      rawBodyString = new TextDecoder().decode(response.body);
    } else if (response.body && typeof (response.body as any).transformToString === "function") {
      rawBodyString = await (response.body as any).transformToString();
    } else {
      rawBodyString = String(response.body);
    }

    console.log(`[analyze-video] Raw Bedrock response body (first 2000 chars): ${rawBodyString.slice(0, 2000)}`);

    try {
      bedrockData = JSON.parse(rawBodyString);
      console.log(`[analyze-video] Parsed Bedrock envelope JSON keys: ${Object.keys(bedrockData)}`);
    } catch (parseErr: any) {
      console.error(`[analyze-video] Failed to parse Bedrock envelope as JSON: ${parseErr.message}`);
      console.log(`[analyze-video] Full raw body: ${rawBodyString}`);
      throw new Error(`Bedrock response is not valid JSON: ${parseErr.message}`);
    }
  } catch (err: any) {
    throw new Error(`Bedrock SDK invoke failed after retry: ${err?.message || "Unknown Bedrock error"}`);
  }

  let responseText: string;
  if (typeof bedrockData?.message === "string") {
    responseText = bedrockData.message;
    console.log(`[analyze-video] Extracted text from message field`);
  } else if (bedrockData?.results?.[0]?.outputText) {
    responseText = bedrockData.results[0].outputText;
    console.log(`[analyze-video] Extracted text from results[0].outputText`);
  } else if (bedrockData?.output?.text) {
    responseText = bedrockData.output.text;
    console.log(`[analyze-video] Extracted text from output.text`);
  } else if (typeof bedrockData?.outputText === "string") {
    responseText = bedrockData.outputText;
    console.log(`[analyze-video] Extracted text from outputText`);
  } else if (typeof bedrockData?.body === "string") {
    responseText = bedrockData.body;
    console.log(`[analyze-video] Extracted text from body`);
  } else {
    responseText = JSON.stringify(bedrockData);
    console.log(`[analyze-video] No known text field found, using full JSON as responseText`);
  }

  console.log(`[analyze-video] Raw response length: ${responseText.length}`);
  console.log(`[analyze-video] Raw response text (first 3000 chars): ${responseText.slice(0, 3000)}`);

  console.log(`[analyze-video] Extracting JSON...`);
  const rawJSON = extractJSON(responseText);
  console.log(`[analyze-video] Parsed JSON keys: ${Object.keys(rawJSON as Record<string, unknown>)}`);

  const { result, logs } = validateAndClean(rawJSON, projectId);
  console.log(`[analyze-video] Validated: ${result.segments.length} segments, ${result.breakpoints.length} breakpoints, ${result.highlights.length} highlights`);

  // Store the raw Pegasus response for auditability — truncate to 50KB to stay within column limits
  logs.push({
    project_id: projectId,
    log_type: "pegasus_raw_response",
    message: `Raw Pegasus response (${responseText.length} chars)`,
    raw_data: { response_text: responseText.slice(0, 50000), response_length: responseText.length },
  });

  return { result, logs };
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
    if (end <= start) break;
    const overlapStart = start > 0 ? start : null;
    const overlapEnd = start > 0 ? Math.min(start + OVERLAP_DURATION, end) : null;
    chunks.push({ start_sec: start, end_sec: end, overlap_start_sec: overlapStart, overlap_end_sec: overlapEnd });
    if (end >= durationSec) break;
    start = end - OVERLAP_DURATION;
    if (start >= durationSec) break;
  }
  return chunks;
}

// ─── Ensure video is in S3 ───────────────────────────────────────────────────

async function ensureS3Uri(
  currentUri: string,
  projectId: string,
  supabase: any,
): Promise<string> {
  // Already an S3 URI — use directly
  if (currentUri.startsWith("s3://")) {
    console.log(`[analyze-video] Video already in S3: ${currentUri}`);
    return currentUri;
  }

  // External URL — download and re-upload to S3
  if (!currentUri.startsWith("http://") && !currentUri.startsWith("https://")) {
    throw new Error(`Unsupported video URI scheme: ${currentUri.slice(0, 80)}`);
  }

  const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY")!;
  const awsSecretKey = Deno.env.get("AWS_SECRET_KEY")!;
  const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";
  const s3Region = Deno.env.get("S3_REGION") || bedrockRegion;
  const s3BucketEnv = Deno.env.get("S3_BUCKET");
  if (!s3BucketEnv) console.warn("[analyze-video] S3_BUCKET env var not set, falling back to 'storybreak-ai-videos'");
  const s3Bucket = s3BucketEnv || "storybreak-ai-videos";

  // Derive a filename from the URL
  const urlPath = new URL(currentUri).pathname;
  const originalFilename = decodeURIComponent(urlPath.split("/").pop() || "video.mp4")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `uploads/${projectId}/${originalFilename}`;
  const s3Uri = `s3://${s3Bucket}/${s3Key}`;

  console.log(`[analyze-video] Downloading video from URL to re-upload to S3: ${currentUri.slice(0, 200)}`);
  const MAX_DOWNLOAD_SIZE = 5_368_709_120; // 5 GB
  const dlResp = await fetch(currentUri);
  if (!dlResp.ok) {
    throw new Error(`Failed to download video (${dlResp.status}): ${currentUri.slice(0, 200)}`);
  }
  const contentLength = dlResp.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_DOWNLOAD_SIZE) {
      throw new Error(`Video file too large (${(size / 1_073_741_824).toFixed(1)} GB). Maximum allowed is 5 GB.`);
    }
  } else {
    console.warn(`[analyze-video] No Content-Length header for video URL, proceeding without size check`);
  }
  if (!dlResp.body) {
    throw new Error(`No response body from video URL`);
  }

  const contentType = dlResp.headers.get("content-type") || "video/mp4";

  // Buffer the download into memory so we have a known Content-Length for the S3 PUT.
  // Streaming a ReadableStream body via fetch() uses chunked transfer encoding,
  // which S3 presigned PUTs do not support — they require Content-Length.
  console.log(`[analyze-video] Buffering video download into memory...`);
  const videoBuffer = new Uint8Array(await dlResp.arrayBuffer());
  console.log(`[analyze-video] Buffered ${(videoBuffer.byteLength / 1_048_576).toFixed(1)} MB`);

  if (videoBuffer.byteLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`Video file too large (${(videoBuffer.byteLength / 1_073_741_824).toFixed(1)} GB). Maximum allowed is 5 GB.`);
  }

  const s3Client = new S3Client({
    region: s3Region,
    credentials: {
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
    },
  });

  // Use presigned URL with the buffered body so Content-Length is sent correctly
  const presignedUrl = await getSignedUrl(s3Client, new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
    ContentType: contentType,
  }), { expiresIn: 3600 });

  console.log(`[analyze-video] Generated presigned URL, uploading ${(videoBuffer.byteLength / 1_048_576).toFixed(1)} MB...`);

  const uploadResp = await fetch(presignedUrl, {
    method: "PUT",
    body: videoBuffer,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(videoBuffer.byteLength),
    },
  });

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`S3 presigned upload failed (${uploadResp.status}): ${errText.slice(0, 500)}`);
  }

  console.log(`[analyze-video] Uploaded to S3 via presigned URL: ${s3Uri}`);

  // Update the video record with the new S3 URI
  const { error: updateErr } = await supabase
    .from("videos")
    .update({ s3_uri: s3Uri })
    .eq("project_id", projectId);
  if (updateErr) {
    console.error(`[analyze-video] Warning: failed to update video s3_uri:`, updateErr.message);
  }

  return s3Uri;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.project_id;
    if (!projectId || typeof projectId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return new Response(JSON.stringify({ error: "Invalid project ID format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch video + project
    const { data: video, error: vidErr } = await supabase.from("videos").select("s3_uri, duration_sec, original_filename").eq("project_id", projectId).single();
    if (vidErr || !video?.s3_uri) {
      return new Response(JSON.stringify({ error: "Video not found for project" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: project } = await supabase.from("projects").select("delivery_target, content_type, duration_sec").eq("id", projectId).single();
    const deliveryTarget = project?.delivery_target || "ott";
    const deliveryLabel = DELIVERY_LABELS[deliveryTarget] || DELIVERY_LABELS.ott;
    const contentType = project?.content_type || "short_form";
    let durationSec = project?.duration_sec || video.duration_sec || 0;
    const durationUnknown = !durationSec || durationSec <= 0;
    if (durationUnknown) {
      console.warn(`[analyze-video] duration_sec is 0 or missing for project ${projectId}, defaulting to single-pass safe value`);
      // Default to MAX_SINGLE_PASS so unknown-duration videos use single-pass analysis.
      // Single-pass handles up to 60 minutes, which covers most submitted videos.
      // The duration is auto-corrected from Pegasus response timestamps afterward.
      // Previously this was MAX_SINGLE_PASS + 1, which forced multi-pass unnecessarily
      // and caused issues with URL-submitted videos that have no duration metadata.
      durationSec = MAX_SINGLE_PASS;
    }

    if (!Deno.env.get("AWS_ACCESS_KEY") || !Deno.env.get("AWS_SECRET_KEY")) throw new Error("AWS credentials not configured");

    // Ensure video is in S3 (download + re-upload if external URL)
    const s3Uri = await ensureS3Uri(video.s3_uri, projectId, supabase);

    // Reset status to 'analyzing' (important for retries where status may be 'failed')
    await supabase.from("projects").update({ status: "analyzing" }).eq("id", projectId);
    console.log(`[analyze-video] Status reset to 'analyzing' for project ${projectId}`);

    // ─── Strategy router ─────────────────────────────────────────────
    const useMultiPass = durationSec > MAX_SINGLE_PASS;

    if (!useMultiPass) {
      // ── SINGLE-PASS ──────────────────────────────────────────────
      console.log(`[analyze-video] SINGLE-PASS for project ${projectId} (${durationSec}s, ${contentType})`);
      console.log(`[analyze-video] Starting Pegasus analysis...`);
      const prompt = buildPrompt({ s3Uri, deliveryLabel, deliveryTarget, contentType, durationSec });
      const { result: analysis, logs } = await callPegasus(prompt, projectId, s3Uri);
      await flushLogs(supabase, logs);

      if (analysis.segments.length === 0) {
        await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
        return new Response(JSON.stringify({ error: "AI returned no valid segments after normalization" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Auto-detect real duration from analysis output
      const maxTimestamp = Math.max(
        ...analysis.segments.map(s => s.end_sec || 0),
        ...analysis.breakpoints.map(b => b.timestamp_sec || 0),
        ...analysis.highlights.map(h => h.end_sec || 0),
        0
      );

      if (durationUnknown && maxTimestamp > 0) {
        // Add 5% buffer to account for content beyond last detected timestamp
        const correctedDuration = Math.ceil(maxTimestamp * 1.05);
        durationSec = correctedDuration;
        console.log(`[analyze-video] Auto-detected duration: ${correctedDuration}s (from max timestamp ${maxTimestamp}s + 5% buffer)`);
        await supabase.from("projects").update({ duration_sec: correctedDuration }).eq("id", projectId);
        await supabase.from("videos").update({ duration_sec: correctedDuration }).eq("project_id", projectId);
      } else if (durationSec === 3600 && maxTimestamp > 0 && maxTimestamp < 3600) {
        // Duration was set to 3600 default but actual content is shorter — correct it
        const correctedDuration = Math.ceil(maxTimestamp * 1.05);
        durationSec = correctedDuration;
        console.log(`[analyze-video] Corrected fallback duration from 3600s to ${correctedDuration}s`);
        await supabase.from("projects").update({ duration_sec: correctedDuration }).eq("id", projectId);
        await supabase.from("videos").update({ duration_sec: correctedDuration }).eq("project_id", projectId);
      } else if (durationUnknown) {
        console.warn(`[analyze-video] Could not detect duration from analysis, keeping default`);
        await supabase.from("projects").update({ duration_sec: durationSec }).eq("id", projectId);
      }

      console.log(`[analyze-video] Inserting ${analysis.segments.length} segments...`);
      console.log(`[analyze-video] Inserting ${analysis.breakpoints.length} breakpoints...`);
      console.log(`[analyze-video] Inserting ${analysis.highlights.length} highlights...`);
      await insertResults(supabase, projectId, analysis);
      console.log(`[analyze-video] All inserts complete.`);
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
        // A chunk failed previously — reset ALL failed chunks to pending so we can retry
        console.log(`[analyze-video] Resetting failed chunks to pending for retry (project ${projectId})`);
        await supabase
          .from("analysis_chunks")
          .update({ status: "pending" })
          .eq("project_id", projectId)
          .eq("status", "failed");

        // Re-fetch to pick up the newly pending chunk
        const { data: retriedChunks } = await supabase
          .from("analysis_chunks")
          .select("chunk_index, start_sec, end_sec, overlap_start_sec, overlap_end_sec, status")
          .eq("project_id", projectId)
          .order("chunk_index");

        const retryPending = retriedChunks?.find((c: any) => c.status === "pending");
        if (!retryPending) {
          throw new Error(`Could not reset failed chunks for retry`);
        }
        // Replace allChunks reference for the rest of the flow
        allChunks.length = 0;
        retriedChunks!.forEach((c: any) => allChunks.push(c));
      }

      // Re-derive nextPending from (potentially updated) allChunks
      const currentPending = allChunks.find((c: any) => c.status === "pending" || c.status === "analyzing");

      if (!currentPending) {
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
      const chunk = currentPending;
      const chunkNum = chunk.chunk_index;
      const totalMin = Math.round(durationSec / 60);

      console.log(`[analyze-video] CHUNK START ${chunkNum}/${totalChunks} (${chunk.start_sec}s-${chunk.end_sec}s) for project ${projectId}`);
      await supabase.from("analysis_chunks").update({ status: "analyzing" }).eq("project_id", projectId).eq("chunk_index", chunkNum);

      try {
        const prompt = buildPrompt({
          s3Uri,
          deliveryLabel,
          deliveryTarget,
          contentType,
          durationSec,
          chunkContext: {
            index: chunkNum,
            total: totalChunks,
            startMin: Math.round(chunk.start_sec / 60),
            endMin: Math.round(chunk.end_sec / 60),
            totalMin,
          },
        });

        const { result: analysis, logs: chunkLogs } = await callPegasus(prompt, projectId, s3Uri);
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
    const rawError = err?.message || "Analysis failed";
    const knownInputError = isKnownAnalysisInputError(rawError);
    const userError = normalizeKnownAnalysisError(rawError);

    console.error(`[analyze-video] Error for project ${projectId}:`, userError);

    if (projectId) {
      const { error: failErr } = await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
      if (failErr) console.error("[analyze-video] Failed to set project failed status:", failErr.message);

      const { error: logErr } = await supabase.from("analysis_logs").insert({
        project_id: projectId,
        log_type: "parse_error",
        message: userError,
        raw_data: { raw_error: rawError },
      });
      if (logErr) console.error("[analyze-video] Failed to write analysis error log:", logErr.message);
    }

    return new Response(JSON.stringify({ error: userError }), {
      status: knownInputError ? 422 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
