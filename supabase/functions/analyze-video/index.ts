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
    "", // no query string
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

// ─── JSON validation ─────────────────────────────────────────────────────────

const SEGMENT_TYPES = ["opening", "climax", "story_unit", "transition", "resolution"];
const BREAKPOINT_TYPES = ["natural_pause", "ad_break", "story_boundary"];

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
      type: BREAKPOINT_TYPES.includes(b.type) ? b.type : b.type || "natural_pause",
      reason: typeof b.reason === "string" ? b.reason : null,
      confidence: typeof b.confidence === "number" ? b.confidence : null,
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
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // Try to find first { ... } block
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

    // 2) Update status to analyzing
    await supabase.from("projects").update({ status: "analyzing" }).eq("id", projectId);

    // 3) Call Bedrock
    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY");
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY");
    const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

    if (!awsAccessKey || !awsSecretKey) {
      throw new Error("AWS credentials not configured");
    }

    const prompt = `You are an expert video editor AI. Analyze the video at this URI: ${video.s3_uri}. Return ONLY valid JSON with: segments (4-8, types: opening/story_unit/transition/climax/resolution, never cut mid-sentence), breakpoints (3-7, types: natural_pause/ad_break/story_boundary), highlights (top 5-10 scored by semantic_importance + emotional_intensity + transition_strength + pacing_shift + usability). All times in seconds. Return ONLY the JSON object.`;

    const bedrockBody = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 4096,
        temperature: 0.2,
        topP: 0.9,
      },
    };

    console.log(`[analyze-video] Calling Bedrock for project ${projectId}`);

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

    // Extract text from Bedrock response (format varies by model)
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

    // 6) Update status to ready
    await supabase.from("projects").update({ status: "ready" }).eq("id", projectId);

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

    // Mark project as failed
    if (projectId) {
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId).catch(() => {});
    }

    return new Response(
      JSON.stringify({ error: err.message || "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
