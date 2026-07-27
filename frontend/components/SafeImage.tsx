"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";

// 带失败占位的 next/image 封装：
// - 图片加载失败（远程 404 等）时切换为 fallback 占位，而非裂图
// - 只有本组件是客户端组件，因此卡片/列表等父组件可保持为服务端组件（RSC），
//   不必因一处 onError 状态而整体客户端化，减少 hydration 体积。
interface SafeImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  // 加载失败时渲染的占位内容（由父组件以 ReactNode 传入）
  fallback: ReactNode;
}

export default function SafeImage({ src, alt, fill, sizes, className, style, fallback }: SafeImageProps) {
  const [error, setError] = useState(false);

  if (error) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      style={style}
      onError={() => setError(true)}
    />
  );
}
