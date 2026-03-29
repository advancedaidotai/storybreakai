import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  region: string;
  accessKey: string;
  secretKey: string;
  modelId: string;
  body: object;
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

  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const canonicalRequestHash = await sha256(new TextEncoder().encode(canonicalRequest));

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Date": amzDate,
      Authorization: authorization,
      Accept: "application/json",
    },
    body: payload,
  });
}

// ─── Delivery target labels ─────────────────────────────────────────────────

const DELIVERY_LABELS: Record<string, string> = {
  youtube: "YouTube (3-5 minute ad-break intervals)",
  cable_vod: "Cable/VOD (8-12 minute ad-break intervals)",
  broadcast: "Broadcast/Master (act structure breaks)",
};

// ─── JSON validation ─────────────────────────────────────────────────────────

const SEGMENT_TYPES = ["opening", "climax", "story_unit", "transition", "resolution"];
const VALLEY_TYPES = ["dialogue_pause", "topic_shift", "emotional_resolution", "scene_transition"];

interface RawSegment {
  start_sec: number;
  end_sec: number;
  type: string;
  summary?: string;
  confidence?: number;
}
interface RawBreakpoint {
  timestamp_sec: number;
  type: string;
  reason?: string;
  confidence?: number;
  lead_in_sec?: number;
  valley_type?: string;
  ad_slot_duration_rec?: number;
  compliance_notes?: string;
}
interface RawHighlight {
  start_sec: number;
  end_sec: number;
  score: number;
  reason?: string;
  rank_order?: number;
}
interface AnalysisResult {
  segments: RawSegment[];
  breakpoints: RawBreakpoint[];
  highlights: RawHighlight[];
}

function validateAndClean(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") throw new Error("Response is not an object");
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.segments) || obj.segments.length === 0) {
    throw new Error("Missing or empty segments array");
  }
  if (!Array.isArray(obj.breakpoints) || obj.breakpoints.length === 0) {
    throw new Error("Missing or empty breakpoints array");
  }
  if (!Array.isArray(obj.highlights) || obj.highlights.length === 0) {
    throw new Error("Missing or empty highlights array");
  }

  const segments: RawSegment[] = obj.segments.map((s: any, i: number) => {
    if (typeof s.start_sec !== "number" || typeof s.end_sec !== "number") {
      throw new Error(`Segment ${i}: missing start_sec/end_sec`);
    }
    return {
      start_sec: s.start_sec,
      end_sec: s.end_sec,
      type: SEGMENT_TYPES.includes(s.type) ? s.type : "story_unit",
      summary: typeof s.summary === "string" ? s.summary : null,
      confidence: typeof s.confidence === "number" ? s.confidence : null,
    };
  });

  const breakpoints: RawBreakpoint[] = obj.breakpoints.map((b: any, i: number) => {
    if (typeof b.timestamp_sec !== "number") {
      throw new Error(`Breakpoint ${i}: missing timestamp_sec`);
    }
    return {
      timestamp_sec: b.timestamp_sec,
      type: typeof b.type === "string" ? b.type : "natural_pause",
      reason: typeof b.reason === "string" ? b.reason : null,
      confidence: typeof b.confidence === "number" ? b.confidence : null,
      lead_in_sec: typeof b.lead_in_sec === "number" ? b.lead_in_sec : null,
      valley_type: VALLEY_TYPES.includes(b.valley_type) ? b.valley_type : null,
      ad_slot_duration_rec: typeof b.ad_slot_duration_rec === "number" ? b.ad_slot_duration_rec : null,
      compliance_notes: typeof b.compliance_notes === "string" ? b.compliance_notes : null,
    };
  });

  const highlights: RawHighlight[] = obj.highlights.map((h: any, i: number) => {
    if (typeof h.start_sec !== "number" || typeof h.end_sec !== "number") {
      throw new Error(`Highlight ${i}: missing start_sec/end_sec`);
    }
    return {
      start_sec: h.start_sec,
      end_sec: h.end_sec,
      score: typeof h.score === "number" ? h.score : 0,
      reason: typeof h.reason === "string" ? h.reason : null,
      rank_order: typeof h.rank_order === "number" ? h.rank_order : i + 1,
    };
  });

  return { segments, breakpoints, highlights };
}

// ─── Extract JSON from possibly-wrapped response ────────────────────────────

function extractJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    return JSON.parse(braceMatch[0]);
  }

  throw new Error("Could not extract JSON from AI response");
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

    // 1) Fetch video record
    const { data: video, error: vidErr } = await supabase
      .from("videos")
      .select("s3_uri")
      .eq("project_id", projectId)
      .single();

    if (vidErr || !video?.s3_uri) {
      return new Response(JSON.stringify({ error: "Video not found for project" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project to get delivery_target
    const { data: project } = await supabase
      .from("projects")
      .select("delivery_target")
      .eq("id", projectId)
      .single();

    const deliveryTarget = project?.delivery_target || "youtube";
    const deliveryLabel = DELIVERY_LABELS[deliveryTarget] || DELIVERY_LABELS.youtube;

    // 2) Update status to analyzing
    await supabase.from("projects").update({ status: "analyzing" }).eq("id", projectId);

    // 3) Call Bedrock with ad-break intelligence prompt
    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY");
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY");
    const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

    if (!awsAccessKey || !awsSecretKey) {
      throw new Error("AWS credentials not configured");
    }

    const prompt = `You are an expert video editor AI specializing in ad-break placement. Analyze the video at ${video.s3_uri} for ${deliveryLabel} format. Identify 5-7 optimal ad-break positions by finding Semantic Narrative Valleys - natural pauses in dialogue/action, topic shifts, or emotional resolutions where an ad break feels organic. Rule: Never cut mid-sentence or mid-action. For each breakpoint return: timestamp_sec, lead_in_sec (frame before break), valley_type (dialogue_pause/topic_shift/emotional_resolution/scene_transition), reason, confidence, ad_slot_duration_rec (seconds), compliance_notes. Also return segments (4-8, types: opening/story_unit/transition/climax/resolution with start_sec, end_sec, type, summary, confidence) and highlights (top 5-10 scored by semantic_importance + emotional_intensity + transition_strength + pacing_shift + usability with start_sec, end_sec, score, reason, rank_order). All times in seconds. Return ONLY valid JSON.`;

    const bedrockBody = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 4096,
        temperature: 0.2,
        topP: 0.9,
      },
    };

    console.log(`[analyze-video] Calling Bedrock for project ${projectId} (target: ${deliveryTarget})`);

    const bedrockResp = await signedBedrockRequest({
      region: bedrockRegion,
      accessKey: awsAccessKey,
      secretKey: awsSecretKey,
      modelId: "twelvelabs.pegasus-1-2-v1:0",
      body: bedrockBody,
    });

    if (!bedrockResp.ok) {
      const errText = await bedrockResp.text();
      console.error(`[analyze-video] Bedrock error ${bedrockResp.status}: ${errText}`);
      throw new Error(`Bedrock API error (${bedrockResp.status}): ${errText.slice(0, 500)}`);
    }

    const bedrockData = await bedrockResp.json();

    let responseText: string;
    if (bedrockData?.results?.[0]?.outputText) {
      responseText = bedrockData.results[0].outputText;
    } else if (bedrockData?.output?.text) {
      responseText = bedrockData.output.text;
    } else if (typeof bedrockData?.body === "string") {
      responseText = bedrockData.body;
    } else {
      responseText = JSON.stringify(bedrockData);
    }

    console.log(`[analyze-video] Raw response length: ${responseText.length}`);

    // 4) Parse and validate
    const rawJSON = extractJSON(responseText);
    const analysis = validateAndClean(rawJSON);

    console.log(
      `[analyze-video] Parsed: ${analysis.segments.length} segments, ${analysis.breakpoints.length} breakpoints, ${analysis.highlights.length} highlights`
    );

    // 5) Bulk insert
    const { error: segErr } = await supabase.from("segments").insert(
      analysis.segments.map((s) => ({
        project_id: projectId!,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        type: s.type,
        summary: s.summary,
        confidence: s.confidence,
      }))
    );
    if (segErr) {
      console.error("[analyze-video] Segments insert error:", segErr.message);
      throw new Error(`Failed to insert segments: ${segErr.message}`);
    }

    const { error: bpErr } = await supabase.from("breakpoints").insert(
      analysis.breakpoints.map((b) => ({
        project_id: projectId!,
        timestamp_sec: b.timestamp_sec,
        type: b.type,
        reason: b.reason,
        confidence: b.confidence,
        lead_in_sec: b.lead_in_sec,
        valley_type: b.valley_type,
        ad_slot_duration_rec: b.ad_slot_duration_rec,
        compliance_notes: b.compliance_notes,
      }))
    );
    if (bpErr) {
      console.error("[analyze-video] Breakpoints insert error:", bpErr.message);
      throw new Error(`Failed to insert breakpoints: ${bpErr.message}`);
    }

    const { error: hlErr } = await supabase.from("highlights").insert(
      analysis.highlights.map((h) => ({
        project_id: projectId!,
        start_sec: h.start_sec,
        end_sec: h.end_sec,
        score: h.score,
        reason: h.reason,
        rank_order: h.rank_order,
      }))
    );
    if (hlErr) {
      console.error("[analyze-video] Highlights insert error:", hlErr.message);
      throw new Error(`Failed to insert highlights: ${hlErr.message}`);
    }

    // 6) Update status progression
    await supabase.from("projects").update({ status: "segments_done" }).eq("id", projectId);
    await supabase.from("projects").update({ status: "highlights_done" }).eq("id", projectId);

    console.log(`[analyze-video] Project ${projectId} analysis complete`);

    return new Response(
      JSON.stringify({
        success: true,
        project_id: projectId,
        segments: analysis.segments.length,
        breakpoints: analysis.breakpoints.length,
        highlights: analysis.highlights.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[analyze-video] Error for project ${projectId}:`, err.message);

    if (projectId) {
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId).catch(() => {});
    }

    return new Response(
      JSON.stringify({ error: err.message || "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
