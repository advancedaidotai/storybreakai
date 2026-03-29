import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import RecentProjects from "@/components/RecentProjects";
import { CloudUpload, Film, AlertCircle, X, Loader2, Tv, Clapperboard, XCircle, Check, Sparkles, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Known-good sample video for demo verification
const SAMPLE_VIDEO = {
  filename: "BigBuckBunny-sample.mp4",
  s3_uri: "s3://storybreak-ai-videos/samples/big-buck-bunny-trailer.mp4",
  duration_sec: 596,
  content_type_enum: "feature_film" as const,
  title: "Big Buck Bunny",
  delivery_target: "broadcast",
};

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

/* ── Step badge ─────────────────────────────────── */
function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold text-primary-foreground shrink-0" style={{ background: "hsl(217 91% 55%)" }}>
      {n}
    </span>
  );
}

/* ── Labelled input ─────────────────────────────── */
function LabelledInput({ label, required, ...props }: { label: string; required?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        {...props}
        className="bg-[hsl(220_25%_8%)] border border-border/20 rounded-lg px-3 h-10 text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/40 transition-colors"
      />
    </div>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(() => searchParams.get("demo") === "1");
  const [demoLoading, setDemoLoading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [contentType, setContentType] = useState<ContentType>("feature_film");

  const [filmTitle, setFilmTitle] = useState("");
  const [studio, setStudio] = useState("");

  const [showTitle, setShowTitle] = useState("");
  const [season, setSeason] = useState("1");
  const [episodeNum, setEpisodeNum] = useState("1");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [tvStudio, setTvStudio] = useState("");

  const [deliveryTarget, setDeliveryTarget] = useState("broadcast");
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
          delivery_target: deliveryTarget,
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
  }, [selectedFile, formValid, config, contentType, filmTitle, studio, showTitle, season, episodeNum, episodeTitle, tvStudio, deliveryTarget, navigate, uploadMultipart, uploadSinglePut]);

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

  // Hidden keyboard shortcut: Ctrl+Shift+D toggles demo mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setDemoMode((prev) => {
          const next = !prev;
          toast({ title: next ? "Demo mode activated" : "Demo mode deactivated", description: next ? "Sample video trigger is now visible." : "Hidden again." });
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleRunDemo = useCallback(async () => {
    setDemoLoading(true);
    setError(null);
    try {
      console.log("[Demo] Starting sample project pipeline…");
      const { data, error: fnErr } = await supabase.functions.invoke("upload-video", {
        body: {
          filename: SAMPLE_VIDEO.filename,
          content_type: "video/mp4",
          file_size: 0,
          duration_sec: SAMPLE_VIDEO.duration_sec,
          is_sample: true,
          s3_uri_override: SAMPLE_VIDEO.s3_uri,
          content_type_enum: SAMPLE_VIDEO.content_type_enum,
          content_metadata: { title: SAMPLE_VIDEO.title },
          delivery_target: SAMPLE_VIDEO.delivery_target,
        },
      });

      if (fnErr || !data?.project_id) {
        throw new Error(data?.error || fnErr?.message || "Failed to create sample project");
      }

      console.log("[Demo] Sample project created:", data.project_id);
      toast({ title: "Demo project created", description: `Project ${data.project_id.slice(0, 8)}… — navigating to processing.` });
      navigate(`/processing/${data.project_id}`);
    } catch (err: any) {
      console.error("[Demo] Failed:", err);
      setError(`Demo failed: ${err.message}`);
      toast({ title: "Demo failed", description: err.message, variant: "destructive" });
    } finally {
      setDemoLoading(false);
    }
  }, [navigate]);

  const isBusy = uploadState !== "idle" || demoLoading;

  const panelStyle = "rounded-xl border border-border/15";
  const panelBg = "hsl(222 25% 11%)";

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">New Intelligence Analysis</h2>
          <p className="text-sm text-muted-foreground mt-1">Configure your video parameters for deep act-structure detection.</p>
        </div>

        {/* Demo mode trigger — only visible with ?demo=1 or Ctrl+Shift+D */}
        {demoMode && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs h-9 rounded-xl border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all animate-fade-in"
            onClick={handleRunDemo}
            disabled={isBusy}
          >
            {demoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
            {demoLoading ? "Creating demo…" : "Run Sample Analysis"}
          </Button>
        )}
      </div>

      <div className="flex gap-8">
        {/* ═══════════════════════════════════════════ LEFT COLUMN ═══ */}
        <div className="flex-[3] min-w-0 space-y-6">

          {/* Step 1 — Content Type */}
          <div className={`${panelStyle} p-5`} style={{ backgroundColor: panelBg }}>
            <div className="flex items-center gap-2.5 mb-4">
              <StepBadge n={1} />
              <h3 className="text-sm font-semibold text-foreground">Content Type Selection</h3>
            </div>
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
                    className={`relative flex flex-col items-center gap-2.5 py-5 px-4 rounded-xl border transition-all duration-300 cursor-pointer group ${
                      selected
                        ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_24px_-6px_hsl(217_91%_60%/0.25)]"
                        : "border-border/20 bg-surface-1/30 hover:border-border/40 hover:bg-surface-1/50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {selected && (
                      <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                      selected ? "bg-primary/20" : "bg-surface-2/80 group-hover:bg-surface-3/80"
                    }`}>
                      <Icon className={`h-5 w-5 transition-colors duration-300 ${selected ? "text-primary" : "text-muted-foreground/70"}`} />
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-semibold transition-colors ${selected ? "text-foreground" : "text-foreground/80"}`}>{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Metadata */}
          <div className={`${panelStyle} p-5`} style={{ backgroundColor: panelBg }}>
            <div className="flex items-center gap-2.5 mb-4">
              <StepBadge n={2} />
              <h3 className="text-sm font-semibold text-foreground">Metadata Intelligence</h3>
            </div>

            {contentType === "feature_film" ? (
              <div className="space-y-4 animate-[fade-in_300ms_ease-out]" key="film">
                <LabelledInput label="Film Title" required value={filmTitle} onChange={(e) => setFilmTitle(e.target.value)} placeholder="e.g. Inception" />
                {touched && !filmTitle.trim() && <p className="text-[11px] text-destructive -mt-2">Film title is required</p>}
                <LabelledInput label="Studio / Network" value={studio} onChange={(e) => setStudio(e.target.value)} placeholder="e.g. Warner Bros, A24, Netflix" />
              </div>
            ) : (
              <div className="space-y-4 animate-[fade-in_300ms_ease-out]" key="tv">
                <LabelledInput label="Show Title" required value={showTitle} onChange={(e) => setShowTitle(e.target.value)} placeholder="e.g. Breaking Bad" />
                {touched && !showTitle.trim() && <p className="text-[11px] text-destructive -mt-2">Show title is required</p>}
                <div className="grid grid-cols-2 gap-4">
                  <LabelledInput label="Season" type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="01" />
                  <LabelledInput label="Episode" type="number" min={1} value={episodeNum} onChange={(e) => setEpisodeNum(e.target.value)} placeholder="12" />
                </div>
                <LabelledInput label="Episode Title" value={episodeTitle} onChange={(e) => setEpisodeTitle(e.target.value)} placeholder="Chapter 4: The Revelation" />
                <LabelledInput label="Studio / Network" value={tvStudio} onChange={(e) => setTvStudio(e.target.value)} placeholder="Lumina Productions" />
              </div>
            )}
          </div>

          {/* Step 3 — Delivery Target */}
          <div className={`${panelStyle} p-5`} style={{ backgroundColor: panelBg }}>
            <div className="flex items-center gap-2.5 mb-4">
              <StepBadge n={3} />
              <h3 className="text-sm font-semibold text-foreground">Analysis Engine Configuration</h3>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-1.5">Delivery Target</label>
              <select
                value={deliveryTarget}
                onChange={(e) => setDeliveryTarget(e.target.value)}
                disabled={isBusy}
                className="w-full bg-[hsl(220_25%_8%)] border border-border/20 rounded-lg px-3 h-10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="broadcast">Broadcast · Act-break structures (22/44 min)</option>
                <option value="cable">Cable · 8-12 min intervals</option>
                <option value="ott">OTT / Streaming · Flexible mid-rolls ⭐ Recommended</option>
                <option value="youtube">YouTube · 3-5 min intervals</option>
              </select>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════ RIGHT COLUMN ═══ */}
        <div className="flex-[2] min-w-0">
          <div className="sticky top-16 space-y-4">

            {/* Step 4 — Video Source */}
            <div className={`${panelStyle} p-5`} style={{ backgroundColor: panelBg }}>
              <div className="flex items-center gap-2.5 mb-4">
                <StepBadge n={4} />
                <h3 className="text-sm font-semibold text-foreground">Video Source</h3>
              </div>

              {/* Drop Zone */}
              <div
                className={`relative w-full rounded-xl overflow-hidden cursor-pointer border transition-all duration-300 ${
                  isDragOver ? "border-primary/60 glow-blue" : "border-border/20 hover:border-primary/30"
                } ${isBusy ? "pointer-events-none" : ""}`}
                style={{ backgroundColor: "hsl(220 25% 8%)" }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isBusy && fileInputRef.current?.click()}
              >
                <div className="relative flex flex-col items-center justify-center gap-3 z-10 py-8 px-5">
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
                      <div className="h-11 w-11 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
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
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all duration-500 ${isDragOver ? "bg-primary/20 scale-110" : "bg-surface-2/80"}`}>
                        <CloudUpload className={`h-5 w-5 transition-colors duration-300 ${isDragOver ? "text-primary" : "text-muted-foreground/60"}`} />
                      </div>
                      <div className="text-center">
                        <p className={`text-sm font-medium transition-colors ${isDragOver ? "text-primary" : "text-foreground"}`}>
                          {isDragOver ? "Release to select" : "Drop your video files here"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Support for MP4, MOV, and ProRES masters up to {config.sizeLabel}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="mt-1 px-4 py-1.5 text-xs font-medium border border-border/30 rounded-lg text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors"
                      >
                        Browse Files
                      </button>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={(e) => handleFileSelect(e.target.files)} />
              </div>
            </div>

            {/* Info card */}
            <div className={`${panelStyle} p-4 flex items-center justify-between`} style={{ backgroundColor: panelBg }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Estimated Analysis Time</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">~14 Minutes</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Credits Required</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">4.2 Units</p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed flex-1">{error}</p>
                <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70 transition-opacity"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            {/* Upload button */}
            <Button
              size="lg"
              className="w-full rounded-xl h-12 text-sm font-semibold btn-hover disabled:opacity-40 disabled:shadow-none"
              style={{ background: formValid && !isBusy ? "linear-gradient(135deg, hsl(187 92% 42%), hsl(217 91% 55%))" : undefined }}
              disabled={!formValid || isBusy}
              onClick={() => { setTouched(true); if (formValid) handleUpload(); }}
            >
              {isBusy ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
              ) : (
                <><CloudUpload className="h-4 w-4 mr-2" /> Upload & Analyze</>
              )}
            </Button>

            <p className="text-[10px] text-muted-foreground/40 text-center leading-relaxed">
              By clicking, you agree to our Content Security Policy for secure media processing.
            </p>

            {/* AI Tip */}
            <div className={`${panelStyle} p-4 border-l-2`} style={{ backgroundColor: panelBg, borderLeftColor: "hsl(263 70% 50%)" }}>
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(263 70% 60%)" }} />
                <div>
                  <p className="text-[11px] font-semibold text-foreground/80 mb-1">AI Tip</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Feature films take longer to analyze as our engine builds a semantic map of every scene to detect character arcs automatically.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Recent Projects */}
      <RecentProjects />
    </div>
  );
};

export default Index;
