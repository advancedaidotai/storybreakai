import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok", function: "get-video-url" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { project_id } = await req.json();
    if (!project_id || typeof project_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project_id)) {
      return new Response(JSON.stringify({ error: "Invalid project ID format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: video, error: vidErr } = await supabase.from("videos").select("s3_uri").eq("project_id", project_id).single();
    if (vidErr || !video?.s3_uri) {
      return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const s3Uri = video.s3_uri;

    // If it's already an HTTP(S) URL (from URL mode), return it directly
    if (s3Uri.startsWith("http://") || s3Uri.startsWith("https://")) {
      return new Response(JSON.stringify({ url: s3Uri }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // S3 URI — generate presigned URL
    if (!s3Uri.startsWith("s3://")) {
      return new Response(JSON.stringify({ error: "Unsupported URI scheme" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY")!;
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY")!;
    const region = Deno.env.get("BEDROCK_REGION") || "us-east-1";

    const rest = s3Uri.slice(5);
    const slashIdx = rest.indexOf("/");
    const bucket = rest.slice(0, slashIdx);
    const key = rest.slice(slashIdx + 1);

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
    });

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return new Response(JSON.stringify({ url: presignedUrl }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to generate video URL" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
