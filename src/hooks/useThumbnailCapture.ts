import { useEffect, useRef, useState, useCallback } from "react";

interface UseThumbnailCaptureResult {
  thumbnails: Record<number, string>;
  loading: boolean;
  retry: () => void;
}

/**
 * Captures video frame thumbnails at specified timestamps.
 * Uses an offscreen canvas to draw video frames.
 * Falls back to gradient placeholders if canvas is tainted (cross-origin).
 *
 * Key fixes over original implementation:
 * - Waits for video readyState >= 2 before attempting capture
 * - Uses a dedicated offscreen video element to avoid disrupting playback
 * - Properly waits for seeked events with cleanup
 * - Falls back to styled placeholders on CORS/tainted-canvas errors
 */
export function useThumbnailCapture(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  timestamps: number[]
): UseThumbnailCaptureResult {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const capturedRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef(0);
  const timestampKey = timestamps.join(",");

  const capture = useCallback(() => {
    const sourceVideo = videoRef.current;
    if (!sourceVideo || timestamps.length === 0) return;
    if (capturedRef.current.has(timestampKey)) return;

    let cancelled = false;

    const captureAll = async () => {
      setLoading(true);

      // Wait for source video to have enough data to read its src
      if (sourceVideo.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            sourceVideo.removeEventListener("loadedmetadata", onLoaded);
            sourceVideo.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            sourceVideo.removeEventListener("loadedmetadata", onLoaded);
            sourceVideo.removeEventListener("error", onError);
            reject(new Error("Video failed to load"));
          };
          sourceVideo.addEventListener("loadedmetadata", onLoaded);
          sourceVideo.addEventListener("error", onError);
        });
      }

      if (cancelled) return;

      // Create a dedicated offscreen video for seeking — avoids disrupting playback
      const offscreenVideo = document.createElement("video");
      offscreenVideo.crossOrigin = "anonymous";
      offscreenVideo.preload = "auto";
      offscreenVideo.muted = true;
      offscreenVideo.playsInline = true;
      offscreenVideo.src = sourceVideo.src;

      // Wait for offscreen video to be ready
      try {
        await new Promise<void>((resolve, reject) => {
          if (offscreenVideo.readyState >= 2) {
            resolve();
            return;
          }
          const onCanPlay = () => {
            offscreenVideo.removeEventListener("canplay", onCanPlay);
            offscreenVideo.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            offscreenVideo.removeEventListener("canplay", onCanPlay);
            offscreenVideo.removeEventListener("error", onErr);
            reject(new Error("Offscreen video failed to load"));
          };
          offscreenVideo.addEventListener("canplay", onCanPlay);
          offscreenVideo.addEventListener("error", onErr);
          // Timeout after 10s
          setTimeout(() => {
            offscreenVideo.removeEventListener("canplay", onCanPlay);
            offscreenVideo.removeEventListener("error", onErr);
            reject(new Error("Offscreen video load timeout"));
          }, 10000);
        });
      } catch {
        // Offscreen video couldn't load (likely CORS) — generate all placeholders
        if (!cancelled) {
          const placeholders: Record<number, string> = {};
          for (const ts of timestamps) {
            placeholders[ts] = generatePlaceholder(ts, 320, 180);
          }
          setThumbnails(placeholders);
          capturedRef.current.add(timestampKey);
          setLoading(false);
        }
        offscreenVideo.src = "";
        return;
      }

      if (cancelled) {
        offscreenVideo.src = "";
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setLoading(false);
        offscreenVideo.src = "";
        return;
      }

      let usePlaceholders = false;

      for (const ts of timestamps) {
        if (cancelled) break;

        if (usePlaceholders) {
          const placeholder = generatePlaceholder(ts, 320, 180);
          setThumbnails((prev) => ({ ...prev, [ts]: placeholder }));
          continue;
        }

        try {
          const dataUrl = await captureFrame(offscreenVideo, canvas, ctx, ts);
          if (cancelled) break;
          setThumbnails((prev) => ({ ...prev, [ts]: dataUrl }));
        } catch {
          // Canvas tainted or seek failed — switch to placeholders for remaining
          usePlaceholders = true;
          const placeholder = generatePlaceholder(ts, 320, 180);
          setThumbnails((prev) => ({ ...prev, [ts]: placeholder }));
        }
      }

      // Clean up offscreen video
      offscreenVideo.src = "";

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

  // Run capture when video src becomes available
  useEffect(() => {
    const video = videoRef.current;
    if (!video || timestamps.length === 0) return;
    if (capturedRef.current.has(timestampKey)) return;

    // If video already has a src and data, capture immediately
    if (video.src && video.readyState >= 1) {
      return capture();
    }

    // Otherwise wait for the video to get a src / load metadata
    const onLoadedMetadata = () => {
      capture();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [videoRef, timestampKey, timestamps, capture]);

  const retry = useCallback(() => {
    capturedRef.current.delete(timestampKey);
    setThumbnails({});
    retryCountRef.current += 1;
    capture();
  }, [timestampKey, capture]);

  return { thumbnails, loading, retry };
}

function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timestamp: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        if (!dataUrl || dataUrl === "data:,") {
          reject(new Error("Empty capture"));
          return;
        }
        resolve(dataUrl);
      } catch {
        reject(new Error("Canvas tainted"));
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = timestamp;

    const timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("Seek timeout"));
    }, 5000);
  });
}

function generatePlaceholder(
  timestamp: number,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Dark cinematic gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#1a1a2e");
  grad.addColorStop(1, "#16213e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle diagonal lines for film-frame texture
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let i = -height; i < width; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }

  // "Frame at" label
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Frame at", width / 2, height / 2 - 18);

  // Timestamp text
  const mins = Math.floor(timestamp / 60);
  const secs = Math.floor(timestamp % 60);
  const timeStr = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(timeStr, width / 2, height / 2 + 6);

  // Small film icon indicator
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("\u25B6", width / 2, height / 2 + 28);

  return canvas.toDataURL("image/jpeg", 0.8);
}
