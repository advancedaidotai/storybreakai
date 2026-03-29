import { useNavigate } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import { CloudUpload, Play, Film, AlertCircle, X, Loader2, Tv, Radio, Clapperboard, MonitorPlay, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime"];
const ACCEPTED_EXT = [".mp4", ".mov"];

const CONTENT_CONFIGS = {
  short_form: { label: "Short-Form (up to 15 min)", maxDuration: 15 * 60, maxSize: 2 * 1024 ** 3, durationLabel: "15 min", sizeLabel: "2 GB", icon: Film },
  tv_episode: { label: "TV Episode (15–60 min)", maxDuration: 60 * 60, maxSize: 4 * 1024 ** 3, durationLabel: "60 min", sizeLabel: "4 GB", icon: Tv },
  feature_film: { label: "Feature Film (60–180 min)", maxDuration: 180 * 60, maxSize: 10 * 1024 ** 3, durationLabel: "180 min", sizeLabel: "10 GB", icon: Clapperboard },
} as const;

type ContentType = keyof typeof CONTENT_CONFIGS;

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT = 3;
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function formatSpeed(bytesPerSec: number) {
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
}

function formatEta(seconds: number) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(video.src); reject(new Error("Could not read video metadata")); };
    video.src = URL.createObjectURL(file);
  });
}

type UploadState = "idle" | "validating" | "requesting" | "uploading" | "done" | "error";

interface UploadProgress {
  totalParts: number;
  completedParts: number;
  bytesUploaded: number;
  totalBytes: number;
  startTime: number;
}

const Index = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [loadingSample, setLoadingSample] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState("youtube");
  const [contentType, setContentType] = useState<ContentType>("short_form");
  const [showTitle, setShowTitle] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [network, setNetwork] = useState("");
  const [progress, setProgress] = useState<UploadProgress>({ totalParts: 0, completedParts: 0, bytesUploaded: 0, totalBytes: 0, startTime: 0 });

  const config = CONTENT_CONFIGS[contentType];
  const needsMeta = contentType === "tv_episode" || contentType === "feature_film";

  const pct = progress.totalBytes > 0 ? Math.round((progress.bytesUploaded / progress.totalBytes) * 100) : 0;
  const elapsed = (Date.now() - progress.startTime) / 1000;
  const speed = elapsed > 0 ? progress.bytesUploaded / elapsed : 0;
  const remaining = speed > 0 ? (progress.totalBytes - progress.bytesUploaded) / speed : 0;

  const buildMetadata = () => {
    if (!needsMeta) return null;
    const meta: Record<string, any> = {};
    if (showTitle) meta.title = showTitle;
    if (network) meta.network = network;
    if (contentType === "tv_episode") {
      if (season) meta.season = Number(season);
      if (episode) meta.episode = Number(episode);
    }
    return Object.keys(meta).length > 0 ? meta : null;
  };

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    setUploadState("idle");
    setError("Upload cancelled.");
  }, []);

  const handleTrySample = useCallback(async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("upload-video", {
        body: {
          filename: "sample-video.mp4",
          content_type: "video/mp4",
          file_size: 0,
          duration_sec: 600,
          is_sample: true,
          s3_uri_override: "s3://storybreak-ai-videos/samples/sample-video.mp4",
          delivery_target: deliveryTarget,
          content_type_enum: contentType,
          content_metadata: buildMetadata(),
        },
      });
      if (fnError || !data?.project_id) {
        setError("Failed to load sample video. Please try again.");
        setLoadingSample(false);
        return;
      }
      navigate(`/processing/${data.project_id}`);
    } catch {
      setError("Failed to load sample video.");
      setLoadingSample(false);
    }
  }, [navigate, deliveryTarget, contentType, showTitle, season, episode, network]);

  const uploadMultipart = useCallback(async (file: File, projectId: string) => {
    abortRef.current = false;
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    setProgress({ totalParts, completedParts: 0, bytesUploaded: 0, totalBytes: file.size, startTime: Date.now() });

    // 1. Initiate
    const { data: initData, error: initErr } = await supabase.functions.invoke("multipart-upload", {
      body: { action: "initiate", project_id: projectId, filename: file.name, content_type: file.type || "video/mp4" },
    });
    if (initErr || !initData?.upload_id) throw new Error(initData?.error || "Failed to initiate multipart upload");

    const { upload_id, s3_key, s3_uri } = initData;
    const completedParts: { part_number: number; etag: string }[] = [];
    let bytesUploaded = 0;

    // 2. Upload parts with concurrency
    const queue = Array.from({ length: totalParts }, (_, i) => i + 1);
    const uploadPart = async (partNum: number) => {
      if (abortRef.current) throw new Error("Cancelled");

      // Get presigned URL for this part
      const { data: urlData, error: urlErr } = await supabase.functions.invoke("multipart-upload", {
        body: { action: "get-part-url", s3_key, upload_id, part_number: partNum },
      });
      if (urlErr || !urlData?.url) throw new Error("Failed to get part URL");

      const start = (partNum - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const resp = await fetch(urlData.url, { method: "PUT", body: chunk });
      if (!resp.ok) throw new Error(`Part ${partNum} upload failed: ${resp.status}`);

      const etag = resp.headers.get("ETag") || `"part-${partNum}"`;
      completedParts.push({ part_number: partNum, etag });
      bytesUploaded += (end - start);
      setProgress((p) => ({ ...p, completedParts: completedParts.length, bytesUploaded }));
    };

    // Process queue with max concurrency
    let idx = 0;
    const runNext = async (): Promise<void> => {
      while (idx < queue.length) {
        if (abortRef.current) throw new Error("Cancelled");
        const partNum = queue[idx++];
        await uploadPart(partNum);
      }
    };
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, totalParts) }, () => runNext());
    await Promise.all(workers);

    if (abortRef.current) {
      await supabase.functions.invoke("multipart-upload", { body: { action: "abort", s3_key, upload_id } });
      throw new Error("Cancelled");
    }

    // 3. Complete
    const { data: completeData, error: completeErr } = await supabase.functions.invoke("multipart-upload", {
      body: { action: "complete", s3_key, upload_id, parts: completedParts },
    });
    if (completeErr || !completeData?.success) throw new Error("Failed to complete multipart upload");

    return s3_uri;
  }, []);

  const uploadSinglePut = useCallback(async (file: File, presignedUrl: string) => {
    abortRef.current = false;
    setProgress({ totalParts: 1, completedParts: 0, bytesUploaded: 0, totalBytes: file.size, startTime: Date.now() });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl, true);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress((p) => ({ ...p, bytesUploaded: e.loaded, completedParts: e.loaded === e.total ? 1 : 0 }));
        }
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });
  }, []);

  const validateAndUpload = useCallback(async (file: File) => {
    setError(null);
    setUploadState("validating");
    setFileName(file.name);
    setFileSize(file.size);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) { setError(`Invalid format "${ext}". Only MP4 and MOV files are accepted.`); setUploadState("idle"); return; }
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) { setError("Invalid file type. Only MP4 and MOV videos are accepted."); setUploadState("idle"); return; }
    if (file.size > config.maxSize) { setError(`File is ${formatSize(file.size)} — maximum allowed is ${config.sizeLabel}.`); setUploadState("idle"); return; }

    let duration = 0;
    try {
      duration = await getVideoDuration(file);
      if (duration > config.maxDuration) {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        setError(`Video is ${mins}:${secs.toString().padStart(2, "0")} long — maximum is ${config.durationLabel}.`);
        setUploadState("idle");
        return;
      }
    } catch { setError("Could not read video duration. Please try a different file."); setUploadState("idle"); return; }

    setUploadState("requesting");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("upload-video", {
        body: {
          filename: file.name,
          content_type: file.type || "video/mp4",
          file_size: file.size,
          duration_sec: Math.round(duration),
          delivery_target: deliveryTarget,
          content_type_enum: contentType,
          content_metadata: buildMetadata(),
        },
      });

      if (fnError || !data?.project_id) { setError(data?.error || fnError?.message || "Failed to prepare upload."); setUploadState("idle"); return; }

      setUploadState("uploading");
      const useMultipart = file.size > MULTIPART_THRESHOLD;

      if (useMultipart) {
        await uploadMultipart(file, data.project_id);
      } else {
        if (!data.presigned_url) { setError("No upload URL received."); setUploadState("idle"); return; }
        await uploadSinglePut(file, data.presigned_url);
      }

      setUploadState("done");
      navigate(`/processing/${data.project_id}`);
    } catch (err: any) {
      if (err?.message === "Cancelled") { setUploadState("idle"); return; }
      setError(err?.message || "Upload failed. Please try again.");
      setUploadState("idle");
    }
  }, [navigate, deliveryTarget, contentType, config, uploadMultipart, uploadSinglePut, showTitle, season, episode, network]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    validateAndUpload(files[0]);
  }, [validateAndUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);

  const isBusy = uploadState !== "idle";

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] px-6 py-12">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
          <Film className="h-4.5 w-4.5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Story<span className="text-primary">Break</span>
          <span className="text-muted-foreground font-normal ml-1.5">AI</span>
        </h1>
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-md leading-relaxed mb-6">
        AI-powered ad-break intelligence for video content
      </p>

      {/* Content Type Selector */}
      <div className="w-full max-w-sm mb-4">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block text-center">
          Content Type
        </label>
        <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
          <SelectTrigger className="glass-panel-elevated border-border/30 h-12 rounded-xl text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel-elevated border-border/30 rounded-xl">
            <SelectItem value="short_form" className="rounded-lg">
              <span className="flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" />
                Short-Form · up to 15 min
              </span>
            </SelectItem>
            <SelectItem value="tv_episode" className="rounded-lg">
              <span className="flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-emerald-400" />
                TV Episode · 15–60 min
              </span>
            </SelectItem>
            <SelectItem value="feature_film" className="rounded-lg">
              <span className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-amber-400" />
                Feature Film · 60–180 min
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metadata Fields for TV Episode / Feature Film */}
      {needsMeta && (
        <div className="w-full max-w-sm mb-4 space-y-3 p-4 glass-panel rounded-xl fade-in-600">
          <div>
            <Label className="text-xs text-muted-foreground">{contentType === "tv_episode" ? "Show Title" : "Film Title"}</Label>
            <Input value={showTitle} onChange={(e) => setShowTitle(e.target.value)} placeholder={contentType === "tv_episode" ? "e.g. Breaking Bad" : "e.g. Inception"} className="mt-1 bg-surface-0/50 border-border/30 rounded-lg h-9 text-sm" />
          </div>
          {contentType === "tv_episode" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Season</Label>
                <Input type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="1" className="mt-1 bg-surface-0/50 border-border/30 rounded-lg h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Episode</Label>
                <Input type="number" min={1} value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="1" className="mt-1 bg-surface-0/50 border-border/30 rounded-lg h-9 text-sm" />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Network / Platform</Label>
            <Input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="e.g. Netflix, HBO, YouTube" className="mt-1 bg-surface-0/50 border-border/30 rounded-lg h-9 text-sm" />
          </div>
        </div>
      )}

      {/* Delivery Target */}
      <div className="w-full max-w-sm mb-8">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block text-center">
          Delivery Target
        </label>
        <Select value={deliveryTarget} onValueChange={setDeliveryTarget}>
          <SelectTrigger className="glass-panel-elevated border-border/30 h-12 rounded-xl text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel-elevated border-border/30 rounded-xl">
            <SelectItem value="youtube" className="rounded-lg">
              <span className="flex items-center gap-2"><Tv className="h-4 w-4 text-red-400" />YouTube · 3-5 min intervals</span>
            </SelectItem>
            <SelectItem value="cable_vod" className="rounded-lg">
              <span className="flex items-center gap-2"><Radio className="h-4 w-4 text-blue-400" />Cable / VOD · 8-12 min intervals</span>
            </SelectItem>
            <SelectItem value="broadcast" className="rounded-lg">
              <span className="flex items-center gap-2"><Clapperboard className="h-4 w-4 text-amber-400" />Broadcast / Master · Act structures</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Upload Zone */}
      <div
        className={`relative w-full max-w-2xl aspect-[16/9] rounded-2xl overflow-hidden cursor-pointer glass-panel-elevated cinematic-shadow transition-all duration-500 ${isDragOver ? "border-primary/60 glow-blue scale-[1.01]" : "border-border/30 hover:border-primary/30"} ${isBusy ? "pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isBusy && fileInputRef.current?.click()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(217_91%_60%/0.04),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-[size:40px_40px]" />

        <div className={`absolute inset-8 rounded-2xl border border-dashed transition-all duration-700 ${isDragOver ? "border-primary/50 animate-pulse" : "border-border/20"}`} />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10">
          {uploadState === "uploading" ? (
            <div className="text-center w-full max-w-xs space-y-4">
              {/* Progress Ring */}
              <div className="relative mx-auto w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="42" fill="none" stroke="hsl(var(--surface-2))" strokeWidth="4" />
                  <circle cx="48" cy="48" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-primary font-mono">{pct}%</span>
              </div>

              <div>
                <p className="text-xs text-muted-foreground truncate">{fileName}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatSize(fileSize)}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Speed</p>
                  <p className="text-xs font-mono text-foreground">{formatSpeed(speed)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Parts</p>
                  <p className="text-xs font-mono text-foreground">{progress.completedParts} / {progress.totalParts}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">ETA</p>
                  <p className="text-xs font-mono text-foreground">{remaining > 0 ? formatEta(remaining) : "—"}</p>
                </div>
              </div>

              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive pointer-events-auto" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel Upload
              </Button>
            </div>
          ) : uploadState === "requesting" || uploadState === "validating" ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <p className="font-semibold text-primary">{uploadState === "validating" ? "Validating video…" : "Preparing upload…"}</p>
            </>
          ) : (
            <>
              <div className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${isDragOver ? "bg-primary/20 glow-blue scale-110" : "bg-surface-2/80"}`}>
                <CloudUpload className={`h-8 w-8 transition-colors duration-300 ${isDragOver ? "text-primary" : "text-muted-foreground/60"}`} />
              </div>
              <div className="text-center">
                <p className={`font-semibold transition-colors duration-300 ${isDragOver ? "text-primary" : "text-foreground"}`}>
                  {isDragOver ? "Release to upload" : "Drop your video here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  MP4 or MOV · Max {config.durationLabel} · Up to {config.sizeLabel}
                </p>
              </div>
              <Button size="lg" className="rounded-xl px-8 glow-blue mt-1" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Upload Video
              </Button>
            </>
          )}
        </div>

        <input ref={fileInputRef} type="file" className="hidden" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 w-full max-w-2xl flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed flex-1">{error}</p>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70 transition-opacity"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Try Sample */}
      <button className="mt-6 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-all duration-200 btn-hover disabled:opacity-50" onClick={handleTrySample} disabled={loadingSample || isBusy}>
        {loadingSample ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        <span>{loadingSample ? "Loading sample…" : "Try Sample Video"}</span>
      </button>

      <footer className="absolute bottom-6 text-center text-[10px] text-muted-foreground/40">
        StoryBreak AI v0.1 · Powered by <span className="text-primary/50">MineYourMedia</span>
      </footer>
    </div>
  );
};

export default Index;
