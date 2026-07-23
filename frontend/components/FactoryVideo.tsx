"use client";

// 客户端组件：管理播放状态与视频内联播放（点击后展示 controls）
import { useRef, useState } from "react";
import { Play, Video } from "lucide-react";

interface FactoryVideoProps {
  /** 视频地址（通常来自 WordPress 媒体库） */
  src: string;
  /** 可选封面图（WordPress 媒体 URL）。不传则用品牌渐变占位。 */
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
  poster,
  label = "Play the factory tour video",
  className = "",
}: FactoryVideoProps) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setPlaying(true);
    // 自动播放可能被浏览器策略拦截；此时控制条已可用，用户可手动点击播放
    videoRef.current?.play().catch(() => {});
  };

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#171A20] to-[#393C41] ${className}`}
      style={{
        borderRadius: "16px",
        boxShadow: "0 18px 50px -20px rgba(23,26,32,0.45)",
      }}
    >
      {playing ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full bg-black object-cover"
        />
      ) : (
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
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white text-[#171A20] shadow-xl transition-transform duration-300 group-hover:scale-110">
            <Play className="h-8 w-8 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}
