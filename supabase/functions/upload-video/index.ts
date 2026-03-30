import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok", function: "upload-video" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { filename, content_type, file_size, duration_sec, is_sample, s3_uri_override, delivery_target, content_type_enum, content_metadata } = await req.json();

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract authenticated user from JWT
    const authHeader = req.headers.get("authorization") || "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        title,
        status: "uploaded",
        user_id: user.id,
        delivery_target: delivery_target || null,
        content_type: content_type_enum || "short_form",
        content_metadata: content_metadata || null,
        duration_sec: duration_sec ?? null,
        file_size_bytes: file_size ?? null,
      })
      .select("id")
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Failed to create project", details: projErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sample video: use override URI, skip presigned URL
    if (is_sample && s3_uri_override) {
      const { error: vidErr } = await supabase.from("videos").insert({
        project_id: project.id,
        original_filename: filename,
        s3_uri: s3_uri_override,
        duration_sec: duration_sec ?? null,
      });

      if (vidErr) {
        return new Response(JSON.stringify({ error: "Failed to create video record", details: vidErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ project_id: project.id, s3_uri: s3_uri_override, is_sample: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // URL mode: user provided a direct video URL, skip file upload
    if (s3_uri_override && !is_sample) {
      const { error: vidErr } = await supabase.from("videos").insert({
        project_id: project.id,
        original_filename: filename,
        s3_uri: s3_uri_override,
        duration_sec: duration_sec ?? null,
      });

      if (vidErr) {
        return new Response(JSON.stringify({ error: "Failed to create video record", details: vidErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ project_id: project.id, s3_uri: s3_uri_override }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regular upload flow — use official AWS SDK for presigning
    const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY");
    const awsSecretKey = Deno.env.get("AWS_SECRET_KEY");
    const s3Bucket = Deno.env.get("S3_BUCKET");
    if (!s3Bucket) console.warn("[upload-video] S3_BUCKET env var not set, falling back to 'storybreak-ai-videos'");
    const effectiveBucket = s3Bucket || "storybreak-ai-videos";
    const region = Deno.env.get("S3_REGION") || Deno.env.get("BEDROCK_REGION") || "us-east-1";

    if (!awsAccessKey || !awsSecretKey) {
      return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
    });

    const safeFilename = filename.replace(/[\/\\]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
    const s3Key = `uploads/${project.id}/${safeFilename}`;
    const s3Uri = `s3://${effectiveBucket}/${s3Key}`;

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

    const command = new PutObjectCommand({
      Bucket: effectiveBucket,
      Key: s3Key,
      ContentType: content_type,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return new Response(
      JSON.stringify({ presigned_url: presignedUrl, project_id: project.id, s3_uri: s3Uri }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
