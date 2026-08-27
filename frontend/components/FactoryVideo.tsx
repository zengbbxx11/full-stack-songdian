"use client";

// 客户端组件：管理播放状态与视频内联播放（点击后展示 controls）
import { useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Play, Video } from "lucide-react";

interface FactoryVideoProps {
  /** 视频地址（MP4 / H.264，兼容性兜底格式） */
  src: string;
  /** 可选 WebM（VP9/AV1）地址。提供时作为首选源，MP4 自动兜底 */
  webmSrc?: string;
  /** 封面图。不传则用品牌渐变占位。 */
  poster?: string;
  /** 播放按钮的无障碍标签 */
  label?: string;
  className?: string;
}

/**
 * FactoryVideo — 点击播放的工厂视频卡片
 * ------------------------------------------------------------------
 * 封面为品牌渐变 + 居中播放按钮（无封面图时）；点击后内联播放并露出控制条。
 * 不自动播放：性能友好、不打扰用户、且避免移动端自动播放限制。
 */
export default function FactoryVideo({
  src,
  webmSrc,
  poster,
  label = "Play the factory tour video",
  className = "",
}: FactoryVideoProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    // video 始终挂载，因此 play() 直接发生在用户手势内，不会丢失播放授权。
    void video.play().catch(() => setStatus("error"));
  };

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[var(--foreground)] to-[var(--graphite)] ${className}`}
      style={{
        borderRadius: "16px",
        boxShadow: "0 18px 50px -20px rgba(23,26,32,0.45)",
      }}
    >
      <video
        ref={videoRef}
        poster={poster}
        controls={status === "playing"}
        playsInline
        preload="none"
        onPlaying={() => setStatus("playing")}
        onError={() => setStatus("error")}
        className="absolute inset-0 h-full w-full bg-black object-cover"
      >
        {webmSrc && <source src={webmSrc} type="video/webm" />}
        <source src={src} type="video/mp4" />
      </video>

      {status === "idle" && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label={label}
          className="group absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          {/* 左下角标签 */}
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm sm:left-5 sm:top-5">
            <Video className="h-3.5 w-3.5" />
            Factory Tour
          </span>
          {/* 暗化遮罩，hover 略减 */}
          <span
            className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15"
            aria-hidden
          />
          {/* 播放按钮 */}
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white text-[var(--foreground)] shadow-xl transition-transform duration-300 group-hover:scale-110">
            <Play className="h-8 w-8 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {status === "loading" && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            Loading video…
          </span>
        </div>
      )}

      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--foreground)] px-6 text-center text-white"
          role="alert"
        >
          <CircleAlert className="h-8 w-8" aria-hidden />
          <p className="text-sm font-medium">The factory video is temporarily unavailable.</p>
          <button
            type="button"
            onClick={handlePlay}
            className="rounded-full border border-white/50 px-4 py-2 text-xs font-semibold transition-colors hover:bg-white hover:text-[var(--foreground)]"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
