import { useNavigate } from "react-router-dom";
import { useState, useRef, useCallback } from "react";
import { CloudUpload, Play, Film, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime"];
const ACCEPTED_EXT = [".mp4", ".mov"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_DURATION_SEC = 15 * 60; // 15 min

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Could not read video metadata"));
    };
    video.src = URL.createObjectURL(file);
  });
}

const Index = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateAndProceed = useCallback(async (file: File) => {
    setError(null);
    setIsValidating(true);

    // Check file extension
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) {
      setError(`Invalid format "${ext}". Only MP4 and MOV files are accepted.`);
      setIsValidating(false);
      return;
    }

    // Check MIME type
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      setError(`Invalid file type. Only MP4 and MOV videos are accepted.`);
      setIsValidating(false);
      return;
    }

    // Check file size
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File is ${formatSize(file.size)} — maximum allowed is 2 GB.`);
      setIsValidating(false);
      return;
    }

    // Check duration
    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_DURATION_SEC) {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        setError(`Video is ${mins}:${secs.toString().padStart(2, "0")} long — maximum is 15 minutes.`);
        setIsValidating(false);
        return;
      }
    } catch {
      setError("Could not read video duration. Please try a different file.");
      setIsValidating(false);
      return;
    }

    setIsValidating(false);
    navigate("/processing");
  }, [navigate]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    validateAndProceed(files[0]);
  }, [validateAndProceed]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] px-6 py-12">
      {/* Brand + Title */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
          <Film className="h-4.5 w-4.5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Story<span className="text-primary">Break</span>
          <span className="text-muted-foreground font-normal ml-1.5">AI</span>
        </h1>
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-md leading-relaxed mb-10">
        Turn long-form video into structured moments and highlights instantly
      </p>

      {/* Cinematic Upload Zone */}
      <div
        className={`
          relative w-full max-w-2xl aspect-[16/9] rounded-2xl overflow-hidden cursor-pointer
          glass-panel-elevated cinematic-shadow transition-all duration-500
          ${isDragOver
            ? "border-primary/60 glow-blue scale-[1.01]"
            : "border-border/30 hover:border-primary/30"
          }
          ${isValidating ? "pointer-events-none opacity-70" : ""}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {/* Subtle animated grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(217_91%_60%/0.04),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-[size:40px_40px]" />

        {/* Pulse ring on hover/drag */}
        <div className={`absolute inset-8 rounded-2xl border border-dashed transition-all duration-700 ${
          isDragOver
            ? "border-primary/50 animate-pulse"
            : "border-border/20 group-hover:border-border/40"
        }`} />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10">
          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
            isDragOver
              ? "bg-primary/20 glow-blue scale-110"
              : "bg-surface-2/80"
          }`}>
            <CloudUpload className={`h-8 w-8 transition-colors duration-300 ${
              isDragOver ? "text-primary" : "text-muted-foreground/60"
            }`} />
          </div>

          <div className="text-center">
            <p className={`font-semibold transition-colors duration-300 ${
              isDragOver ? "text-primary" : "text-foreground"
            }`}>
              {isValidating ? "Validating video…" : isDragOver ? "Release to upload" : "Drop your video here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              MP4 or MOV · Max 15 min · Up to 2 GB
            </p>
          </div>

          <Button
            size="lg"
            className="rounded-xl px-8 glow-blue mt-1"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            Upload Video
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".mp4,.mov,video/mp4,video/quicktime"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 w-full max-w-2xl flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed flex-1">{error}</p>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70 transition-opacity">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Try Sample */}
      <button
        className="mt-6 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors duration-200"
        onClick={() => navigate("/processing")}
      >
        <Play className="h-3.5 w-3.5" />
        <span>Try Sample Video</span>
      </button>

      {/* Footer */}
      <footer className="absolute bottom-6 text-center text-[10px] text-muted-foreground/40">
        StoryBreak AI v0.1 · Powered by <span className="text-primary/50">MineYourMedia</span>
      </footer>
    </div>
  );
};

export default Index;
