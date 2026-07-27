"use client";

import dynamic from "next/dynamic";

// 地图加载占位：Leaflet 下载/初始化期间显示的灰块
const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-400">
    Loading map…
  </div>
);

// 按需加载 Leaflet 地图：仅在浏览器渲染（ssr:false），
// 使 Leaflet JS/CSS 不进入 contact 页首屏 bundle，滚动到地图区才加载。
const ContactMap = dynamic(() => import("./ContactMap"), {
  ssr: false,
  loading: () => mapFallback,
});

export default ContactMap;
