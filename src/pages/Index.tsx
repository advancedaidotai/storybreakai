import { useNavigate } from "react-router-dom";
import { useState, useRef, useCallback } from "react";
import { CloudUpload, Film, AlertCircle, X, Loader2, Tv, Clapperboard, XCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime"];
const ACCEPTED_EXT = [".mp4", ".mov"];

const CONTENT_CONFIGS = {
  tv_episode: { maxDuration: 60 * 60, maxSize: 4 * 1024 ** 3, durationLabel: "60 min", sizeLabel: "4 GB" },
  feature_film: { maxDuration: 180 * 60, maxSize: 10 * 1024 ** 3, durationLabel: "180 min", sizeLabel: "10 GB" },
} as const;

type ContentType = keyof typeof CONTENT_CONFIGS;

const CHUNK_SIZE = 10 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

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
  const [contentType, setContentType] = useState<ContentType>("feature_film");

  // Feature Film fields
  const [filmTitle, setFilmTitle] = useState("");
  const [studio, setStudio] = useState("");

  // TV Episode fields
  const [showTitle, setShowTitle] = useState("");
  const [season, setSeason] = useState("1");
  const [episodeNum, setEpisodeNum] = useState("1");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [tvStudio, setTvStudio] = useState("");

  const [touched, setTouched] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({ totalParts: 0, completedParts: 0, bytesUploaded: 0, totalBytes: 0, startTime: 0 });

  const config = CONTENT_CONFIGS[contentType];

  const pct = progress.totalBytes > 0 ? Math.round((progress.bytesUploaded / progress.totalBytes) * 100) : 0;
  const elapsed = (Date.now() - progress.startTime) / 1000;
  const speed = elapsed > 0 ? progress.bytesUploaded / elapsed : 0;
  const remaining = speed > 0 ? (progress.totalBytes - progress.bytesUploaded) / speed : 0;

  const titleValid = contentType === "feature_film" ? filmTitle.trim().length > 0 : showTitle.trim().length > 0;
  const formValid = titleValid && selectedFile !== null;

  const buildMetadata = () => {
    const meta: Record<string, any> = {};
    if (contentType === "feature_film") {
      meta.title = filmTitle;
      if (studio) meta.network = studio;
    } else {
      meta.title = showTitle;
      if (season) meta.season = Number(season);
      if (episodeNum) meta.episode = Number(episodeNum);
      if (episodeTitle) meta.episode_title = episodeTitle;
      if (tvStudio) meta.network = tvStudio;
    }
    return meta;
  };

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    setUploadState("idle");
    setError("Upload cancelled.");
  }, []);

  const uploadMultipart = useCallback(async (file: File, projectId: string) => {
    abortRef.current = false;
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    setProgress({ totalParts, completedParts: 0, bytesUploaded: 0, totalBytes: file.size, startTime: Date.now() });

    const { data: initData, error: initErr } = await supabase.functions.invoke("multipart-upload", {
      body: { action: "initiate", project_id: projectId, filename: file.name, content_type: file.type || "video/mp4" },
    });
    if (initErr || !initData?.upload_id) throw new Error(initData?.error || "Failed to initiate multipart upload");

    const { upload_id, s3_key, s3_uri } = initData;
    const completedParts: { part_number: number; etag: string }[] = [];
    let bytesUploaded = 0;

    const queue = Array.from({ length: totalParts }, (_, i) => i + 1);
    const uploadPart = async (partNum: number) => {
      if (abortRef.current) throw new Error("Cancelled");
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

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !formValid) return;
    setTouched(true);
    setError(null);
    setUploadState("validating");
    setFileName(selectedFile.name);
    setFileSize(selectedFile.size);

    const ext = "." + selectedFile.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) { setError(`Invalid format "${ext}". Only MP4 and MOV files are accepted.`); setUploadState("idle"); return; }
    if (selectedFile.type && !ACCEPTED_TYPES.includes(selectedFile.type)) { setError("Invalid file type. Only MP4 and MOV videos are accepted."); setUploadState("idle"); return; }
    if (selectedFile.size > config.maxSize) { setError(`File is ${formatSize(selectedFile.size)} — maximum allowed is ${config.sizeLabel}.`); setUploadState("idle"); return; }

    let duration = 0;
    try {
      duration = await getVideoDuration(selectedFile);
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
          filename: selectedFile.name,
          content_type: selectedFile.type || "video/mp4",
          file_size: selectedFile.size,
          duration_sec: Math.round(duration),
          content_type_enum: contentType,
          content_metadata: buildMetadata(),
        },
      });

      if (fnError || !data?.project_id) { setError(data?.error || fnError?.message || "Failed to prepare upload."); setUploadState("idle"); return; }

      setUploadState("uploading");
      const useMultipart = selectedFile.size > MULTIPART_THRESHOLD;

      if (useMultipart) {
        await uploadMultipart(selectedFile, data.project_id);
      } else {
        if (!data.presigned_url) { setError("No upload URL received."); setUploadState("idle"); return; }
        await uploadSinglePut(selectedFile, data.presigned_url);
      }

      setUploadState("done");
      navigate(`/processing/${data.project_id}`);
    } catch (err: any) {
      if (err?.message === "Cancelled") { setUploadState("idle"); return; }
      setError(err?.message || "Upload failed. Please try again.");
      setUploadState("idle");
    }
  }, [selectedFile, formValid, config, contentType, filmTitle, studio, showTitle, season, episodeNum, episodeTitle, tvStudio, navigate, uploadMultipart, uploadSinglePut]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFile(files[0]);
    setFileName(files[0].name);
    setFileSize(files[0].size);
    setError(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); handleFileSelect(e.dataTransfer.files); }, [handleFileSelect]);

  const isBusy = uploadState !== "idle";

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] px-6 py-12">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
          <Film className="h-4.5 w-4.5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Story<span className="text-primary">Break</span>
          <span className="text-muted-foreground font-normal ml-1.5">AI</span>
        </h1>
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-md leading-relaxed mb-10">
        AI-powered ad-break intelligence for video content
      </p>

      <div className="w-full max-w-lg space-y-6">
        {/* Content Type Cards */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { type: "feature_film" as ContentType, icon: Clapperboard, label: "Feature Film", sub: "60–180 min" },
            { type: "tv_episode" as ContentType, icon: Tv, label: "TV Episode", sub: "15–60 min" },
          ]).map(({ type, icon: Icon, label, sub }) => {
            const selected = contentType === type;
            return (
              <button
                key={type}
                onClick={() => { setContentType(type); setTouched(false); }}
                disabled={isBusy}
                className={`relative flex flex-col items-center gap-2.5 py-6 px-4 rounded-2xl border transition-all duration-300 cursor-pointer group ${
                  selected
                    ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_24px_-6px_hsl(217_91%_60%/0.25)]"
                    : "border-border/30 bg-surface-1/40 hover:border-border/50 hover:bg-surface-1/60"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {selected && (
                  <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                  selected ? "bg-primary/20" : "bg-surface-2/80 group-hover:bg-surface-3/80"
                }`}>
                  <Icon className={`h-5.5 w-5.5 transition-colors duration-300 ${selected ? "text-primary" : "text-muted-foreground/70"}`} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-semibold transition-colors duration-300 ${selected ? "text-foreground" : "text-foreground/80"}`}>{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Metadata Fields */}
        <div className="rounded-2xl bg-surface-1/50 border border-border/20 p-5 space-y-4">
          {contentType === "feature_film" ? (
            <div className="space-y-4 animate-[fade-in_300ms_ease-out]" key="film-fields">
              <div>
                <Input
                  value={filmTitle}
                  onChange={(e) => setFilmTitle(e.target.value)}
                  placeholder="Film Title *"
                  className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
                />
                {touched && !filmTitle.trim() && (
                  <p className="text-[11px] text-destructive mt-1.5">Film title is required</p>
                )}
              </div>
              <Input
                value={studio}
                onChange={(e) => setStudio(e.target.value)}
                placeholder="Studio — e.g. Warner Bros, A24, Netflix"
                className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
              />
            </div>
          ) : (
            <div className="space-y-4 animate-[fade-in_300ms_ease-out]" key="tv-fields">
              <div>
                <Input
                  value={showTitle}
                  onChange={(e) => setShowTitle(e.target.value)}
                  placeholder="Show Title *"
                  className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
                />
                {touched && !showTitle.trim() && (
                  <p className="text-[11px] text-destructive mt-1.5">Show title is required</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  min={1}
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="Season"
                  className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
                />
                <Input
                  type="number"
                  min={1}
                  value={episodeNum}
                  onChange={(e) => setEpisodeNum(e.target.value)}
                  placeholder="Episode #"
                  className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
                />
              </div>
              <Input
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="Episode Title — e.g. Ozymandias"
                className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
              />
              <Input
                value={tvStudio}
                onChange={(e) => setTvStudio(e.target.value)}
                placeholder="Studio — e.g. HBO, Netflix, AMC"
                className="bg-transparent border-0 border-b border-border/30 rounded-none px-0 h-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary/60 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Drop Zone — compact */}
        <div
          className={`relative w-full rounded-2xl overflow-hidden cursor-pointer glass-panel-elevated cinematic-shadow transition-all duration-500 ${
            isDragOver ? "border-primary/60 glow-blue scale-[1.01]" : "border-border/30 hover:border-primary/30"
          } ${isBusy ? "pointer-events-none" : ""}`}
          style={{ height: selectedFile && !isBusy ? "auto" : undefined }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isBusy && fileInputRef.current?.click()}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(217_91%_60%/0.04),transparent_70%)]" />

          <div className="relative flex flex-col items-center justify-center gap-3 z-10 py-8 px-6">
            {uploadState === "uploading" ? (
              <div className="text-center w-full max-w-xs space-y-4">
                <div className="relative mx-auto w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="35" fill="none" stroke="hsl(var(--surface-2))" strokeWidth="3.5" />
                    <circle cx="40" cy="40" r="35" fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 35}`}
                      strokeDashoffset={`${2 * Math.PI * 35 * (1 - pct / 100)}`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-primary font-mono">{pct}%</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground truncate">{fileName}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatSize(fileSize)}</p>
                </div>
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
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
              </div>
            ) : uploadState === "requesting" || uploadState === "validating" ? (
              <>
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
                <p className="font-medium text-sm text-primary">{uploadState === "validating" ? "Validating video…" : "Preparing upload…"}</p>
              </>
            ) : selectedFile ? (
              <div className="flex items-center gap-3 w-full">
                <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Film className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setFileName(""); setFileSize(0); }}
                  className="shrink-0 h-8 w-8 rounded-lg bg-surface-2/60 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-500 ${isDragOver ? "bg-primary/20 glow-blue scale-110" : "bg-surface-2/80"}`}>
                  <CloudUpload className={`h-6 w-6 transition-colors duration-300 ${isDragOver ? "text-primary" : "text-muted-foreground/60"}`} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium transition-colors duration-300 ${isDragOver ? "text-primary" : "text-foreground"}`}>
                    {isDragOver ? "Release to select" : "Drop your video here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP4 or MOV · Max {config.durationLabel} · Up to {config.sizeLabel}
                  </p>
                </div>
              </>
            )}
          </div>

          <input ref={fileInputRef} type="file" className="hidden" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={(e) => handleFileSelect(e.target.files)} />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed flex-1">{error}</p>
            <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70 transition-opacity"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Upload Button */}
        <Button
          size="lg"
          className="w-full rounded-xl h-12 text-sm font-semibold glow-blue btn-hover disabled:opacity-40 disabled:shadow-none"
          disabled={!formValid || isBusy}
          onClick={() => { setTouched(true); if (formValid) handleUpload(); }}
        >
          {isBusy ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 mr-2" /> Upload & Analyze
            </>
          )}
        </Button>
      </div>

      <footer className="absolute bottom-6 text-center text-[10px] text-muted-foreground/40">
        StoryBreak AI v0.1 · Powered by <span className="text-primary/50">MineYourMedia</span>
      </footer>
    </div>
  );
};

export default Index;
