import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generate an AWS Signature V4 presigned PUT URL without any SDK.
 */
function hmacSHA256(key: Uint8Array, message: string): Promise<ArrayBuffer> {
  return crypto.subtle
    .importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((k) => crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

function sha256Hex(data: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(data))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  let k = new Uint8Array(await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp));
  k = new Uint8Array(await hmacSHA256(k, region));
  k = new Uint8Array(await hmacSHA256(k, service));
  k = new Uint8Array(await hmacSHA256(k, "aws4_request"));
  return k;
}

async function presignedPutUrl(params: {
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretKey: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const { bucket, key, region, accessKey, secretKey, contentType, expiresIn = 3600 } = params;
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
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "content-type;host",
  });

  // Sort query string
  const sortedQS = [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  const canonicalRequest = [
    "PUT",
    "/" + key,
    sortedQS,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, "s3");
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `https://${host}/${key}?${sortedQS}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filename, content_type, file_size, duration_sec } = await req.json();

    // Validate input
    if (!filename || typeof filename !== "string") {
      return new Response(JSON.stringify({ error: "filename is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!content_type || !["video/mp4", "video/quicktime"].includes(content_type)) {
      return new Response(JSON.stringify({ error: "Invalid content_type. Only video/mp4 and video/quicktime allowed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read secrets
    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY");
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY");
    const s3Bucket = Deno.env.get("S3_BUCKET") || "storybreak-ai-videos";
    const bedrockRegion = Deno.env.get("BEDROCK_REGION") || "us-east-1";

    if (!awsAccessKey || !awsSecretKey) {
      return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Derive title from filename
    const title = filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Create project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({ title, status: "uploaded" })
      .select("id")
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Failed to create project", details: projErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const s3Key = `uploads/${project.id}/${filename}`;
    const s3Uri = `s3://${s3Bucket}/${s3Key}`;

    // Create video record
    const { error: vidErr } = await supabase.from("videos").insert({
      project_id: project.id,
      original_filename: filename,
      s3_uri: s3Uri,
      duration_sec: duration_sec ?? null,
    });

    if (vidErr) {
      return new Response(JSON.stringify({ error: "Failed to create video record", details: vidErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate presigned URL
    const presignedUrl = await presignedPutUrl({
      bucket: s3Bucket,
      key: s3Key,
      region: bedrockRegion,
      accessKey: awsAccessKey,
      secretKey: awsSecretKey,
      contentType: content_type,
    });

    return new Response(
      JSON.stringify({
        presigned_url: presignedUrl,
        project_id: project.id,
        s3_uri: s3Uri,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
