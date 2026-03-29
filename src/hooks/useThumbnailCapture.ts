import { useEffect, useRef, useState } from "react";

interface UseThumbnailCaptureResult {
  thumbnails: Record<number, string>;
  loading: boolean;
}

/**
 * Captures video frame thumbnails at specified timestamps.
 * Uses an offscreen canvas to draw video frames.
 * Falls back to gradient placeholders if canvas is tainted (cross-origin).
 */
export function useThumbnailCapture(
  videoRef: React.RefObject<HTMLVideoElement>,
  timestamps: number[]
): UseThumbnailCaptureResult {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const capturedRef = useRef<Set<string>>(new Set());
  const timestampKey = timestamps.join(",");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || timestamps.length === 0) return;
    if (capturedRef.current.has(timestampKey)) return;

    let cancelled = false;

    const captureAll = async () => {
      setLoading(true);

      // Wait for video to have enough data
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            resolve();
          };
          video.addEventListener("loadeddata", onLoaded);
        });
      }

      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setLoading(false);
        return;
      }

      const results: Record<number, string> = {};

      // Process sequentially to avoid race conditions
      for (const ts of timestamps) {
        if (cancelled) break;

        try {
          const dataUrl = await captureFrame(video, canvas, ctx, ts);
          results[ts] = dataUrl;
          // Update state incrementally so thumbnails appear as they're captured
          setThumbnails((prev) => ({ ...prev, [ts]: dataUrl }));
        } catch {
          // Generate gradient placeholder on failure
          results[ts] = generatePlaceholder(ctx, canvas, ts);
          setThumbnails((prev) => ({ ...prev, [ts]: results[ts] }));
        }
      }

      if (!cancelled) {
        capturedRef.current.add(timestampKey);
        setLoading(false);
      }
    };

    captureAll();

    return () => {
      cancelled = true;
    };
  }, [videoRef, timestampKey, timestamps]);

  return { thumbnails, loading };
}

function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timestamp: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const previousTime = video.currentTime;

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        // Restore previous time
        video.currentTime = previousTime;
        resolve(dataUrl);
      } catch {
        // Canvas tainted by cross-origin video
        video.currentTime = previousTime;
        reject(new Error("Canvas tainted"));
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = timestamp;

    // Timeout safety
    setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("Seek timeout"));
    }, 5000);
  });
}

function generatePlaceholder(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  timestamp: number
): string {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#1F2937");
  gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw timestamp text
  ctx.fillStyle = "#6B7280";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const m = Math.floor(timestamp / 60);
  const s = Math.floor(timestamp % 60);
  ctx.fillText(
    `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
    canvas.width / 2,
    canvas.height / 2
  );

  return canvas.toDataURL("image/jpeg", 0.7);
}
