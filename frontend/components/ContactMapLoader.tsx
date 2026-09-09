"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";

// 地图加载占位：Leaflet 下载/初始化期间显示的灰块
const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-400">
    Loading map…
  </div>
);

// 挂载动态组件之前先等待视口，避免只分包却仍在首屏请求地图资源。
const ContactMap = dynamic(() => import("./ContactMap"), {
  ssr: false,
  loading: () => mapFallback,
});

export default function ContactMapLoader(props: ComponentProps<typeof ContactMap>) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="h-full w-full" data-map-state={visible ? "active" : "deferred"}>
      {visible ? <ContactMap {...props} /> : (
        <div className="flex h-full items-center justify-center bg-gray-100">
          <button type="button" onClick={() => setVisible(true)} className="min-h-11 rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-white">
            Load map
          </button>
        </div>
      )}
    </div>
  );
}
