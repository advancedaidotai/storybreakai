import { S3Client, CreateMultipartUploadCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, UploadPartCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getS3Client() {
  const accessKey = Deno.env.get("AWS_ACCESS_KEY");
  const secretKey = Deno.env.get("AWS_SECRET_KEY");
  const region = Deno.env.get("BEDROCK_REGION") || "us-east-1";
  const bucket = Deno.env.get("S3_BUCKET") || "storybreak-ai-videos";

  if (!accessKey || !secretKey) throw new Error("AWS credentials not configured");

  const client = new S3Client({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  return { client, bucket, region };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { action, ...body } = await req.json();
    const { client, bucket } = getS3Client();

    if (action === "initiate") {
      const { project_id, filename, content_type } = body;
      if (!project_id || !filename) {
        return new Response(JSON.stringify({ error: "project_id and filename required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const s3Key = `uploads/${project_id}/${filename}`;
      const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: content_type || "video/mp4",
      });

      const result = await client.send(command);
      if (!result.UploadId) {
        return new Response(JSON.stringify({ error: "Failed to initiate multipart upload" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        upload_id: result.UploadId,
        s3_key: s3Key,
        s3_uri: `s3://${bucket}/${s3Key}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-part-url") {
      const { s3_key, upload_id, part_number } = body;
      if (!s3_key || !upload_id || !part_number) {
        return new Response(JSON.stringify({ error: "s3_key, upload_id, part_number required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: s3_key,
        UploadId: upload_id,
        PartNumber: part_number,
      });

      const url = await getSignedUrl(client, command, { expiresIn: 3600 });

      return new Response(JSON.stringify({ url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "complete") {
      const { s3_key, upload_id, parts } = body;
      if (!s3_key || !upload_id || !parts || !Array.isArray(parts)) {
        return new Response(JSON.stringify({ error: "s3_key, upload_id, parts[] required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: s3_key,
        UploadId: upload_id,
        MultipartUpload: {
          Parts: parts
            .sort((a: any, b: any) => a.part_number - b.part_number)
            .map((p: any) => ({ PartNumber: p.part_number, ETag: p.etag })),
        },
      });

      await client.send(command);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "abort") {
      const { s3_key, upload_id } = body;
      if (s3_key && upload_id) {
        const command = new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: s3_key,
          UploadId: upload_id,
        });
        await client.send(command).catch(() => {});
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: initiate, get-part-url, complete, abort" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("multipart-upload error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
