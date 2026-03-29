import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  let k = new Uint8Array(await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp));
  k = new Uint8Array(await hmacSHA256(k, region));
  k = new Uint8Array(await hmacSHA256(k, service));
  k = new Uint8Array(await hmacSHA256(k, "aws4_request"));
  return k;
}

function getAwsConfig() {
  const accessKey = Deno.env.get("AWS_ACCESS_KEY");
  const secretKey = Deno.env.get("AWS_SECRET_KEY");
  const bucket = Deno.env.get("S3_BUCKET") || "storybreak-ai-videos";
  const region = Deno.env.get("BEDROCK_REGION") || "us-east-1";
  if (!accessKey || !secretKey) throw new Error("AWS credentials not configured");
  return { accessKey, secretKey, bucket, region };
}

async function signedS3Request(params: {
  method: string;
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretKey: string;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  payloadHash?: string;
}): Promise<Response> {
  const { method, bucket, key, region, accessKey, secretKey, queryParams = {}, headers = {}, body, payloadHash } = params;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const allHeaders: Record<string, string> = { host, "x-amz-date": amzDate, ...headers };
  const signedHeaderKeys = Object.keys(allHeaders).sort();
  const signedHeadersStr = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${allHeaders[k]}\n`).join("");

  const sortedQS = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const contentHash = payloadHash || (body ? await sha256Hex(body) : await sha256Hex(""));

  const canonicalRequest = [method, "/" + key, sortedQS, canonicalHeaders, signedHeadersStr, contentHash].join("\n");
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalRequestHash].join("\n");

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, "s3");
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = { ...allHeaders, Authorization: authorization, "x-amz-content-sha256": contentHash };
  delete fetchHeaders["host"];

  const url = `https://${host}/${key}${sortedQS ? "?" + sortedQS : ""}`;
  return fetch(url, { method, headers: fetchHeaders, body: body || undefined });
}

async function presignedPartUrl(params: {
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretKey: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}): Promise<string> {
  const { bucket, key, region, accessKey, secretKey, uploadId, partNumber, expiresIn = 3600 } = params;
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
    "X-Amz-SignedHeaders": "host",
    partNumber: String(partNumber),
    uploadId,
  });

  const sortedQS = [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = ["PUT", "/" + key, sortedQS, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalRequestHash].join("\n");
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, "s3");
  const signatureBuf = await hmacSHA256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return `https://${host}/${key}?${sortedQS}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...body } = await req.json();
    const aws = getAwsConfig();

    if (action === "initiate") {
      const { project_id, filename, content_type } = body;
      if (!project_id || !filename) {
        return new Response(JSON.stringify({ error: "project_id and filename required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const s3Key = `uploads/${project_id}/${filename}`;
      const resp = await signedS3Request({
        method: "POST",
        bucket: aws.bucket,
        key: s3Key,
        region: aws.region,
        accessKey: aws.accessKey,
        secretKey: aws.secretKey,
        queryParams: { uploads: "" },
        headers: { "content-type": content_type || "video/mp4" },
        payloadHash: await sha256Hex(""),
      });

      const xml = await resp.text();
      const uploadIdMatch = xml.match(/<UploadId>(.+?)<\/UploadId>/);
      if (!uploadIdMatch) {
        return new Response(JSON.stringify({ error: "Failed to initiate multipart upload", details: xml }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ upload_id: uploadIdMatch[1], s3_key: s3Key, s3_uri: `s3://${aws.bucket}/${s3Key}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-part-url") {
      const { s3_key, upload_id, part_number } = body;
      if (!s3_key || !upload_id || !part_number) {
        return new Response(JSON.stringify({ error: "s3_key, upload_id, part_number required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const url = await presignedPartUrl({
        bucket: aws.bucket,
        key: s3_key,
        region: aws.region,
        accessKey: aws.accessKey,
        secretKey: aws.secretKey,
        uploadId: upload_id,
        partNumber: part_number,
      });

      return new Response(JSON.stringify({ url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "complete") {
      const { s3_key, upload_id, parts } = body;
      if (!s3_key || !upload_id || !parts || !Array.isArray(parts)) {
        return new Response(JSON.stringify({ error: "s3_key, upload_id, parts[] required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Build CompleteMultipartUpload XML
      const partsXml = parts
        .sort((a: any, b: any) => a.part_number - b.part_number)
        .map((p: any) => `<Part><PartNumber>${p.part_number}</PartNumber><ETag>${p.etag}</ETag></Part>`)
        .join("");
      const xmlBody = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

      const resp = await signedS3Request({
        method: "POST",
        bucket: aws.bucket,
        key: s3_key,
        region: aws.region,
        accessKey: aws.accessKey,
        secretKey: aws.secretKey,
        queryParams: { uploadId: upload_id },
        headers: { "content-type": "application/xml" },
        body: xmlBody,
      });

      const respText = await resp.text();
      if (!resp.ok || respText.includes("<Error>")) {
        return new Response(JSON.stringify({ error: "Failed to complete multipart upload", details: respText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "abort") {
      const { s3_key, upload_id } = body;
      if (s3_key && upload_id) {
        await signedS3Request({
          method: "DELETE",
          bucket: aws.bucket,
          key: s3_key,
          region: aws.region,
          accessKey: aws.accessKey,
          secretKey: aws.secretKey,
          queryParams: { uploadId: upload_id },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: initiate, get-part-url, complete, abort" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
