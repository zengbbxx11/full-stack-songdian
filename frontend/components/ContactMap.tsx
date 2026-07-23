/*
 * 文件：components/ContactMap.tsx
 * 职责：联系页地图（Leaflet + Esri 卫星影像），零 API key、国内外均可访问。
 * 用精确经纬度钉点，避免 Google 文本地址 geocode 漂移；卫星影像能显示地面真实状态
 * （含在建/规划区），比 OSM 街道图更及时。坐标由 content-data.ts 提供（已校准）。
 *
 * 注意：Leaflet 在模块加载时会访问 `window`，若顶层静态 import 会在 SSR/预渲染阶段
 * 抛 `window is not defined`。因此 Leaflet 的 JS 必须在 useEffect 内动态 import，
 * 仅在浏览器环境求值。CSS 导入对 SSR 安全，可保留在顶层。
 */

"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type ContactMapProps = {
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 弹窗中显示的地址文本 */
  address: string;
  /** 初始缩放级别，默认 17（建筑级） */
  zoom?: number;
};

// 品牌红 (#d4343e) 水滴形图钉，纯内联 SVG，无需外部图片
const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="38" height="50" viewBox="0 0 38 50" aria-hidden="true">
  <path d="M19 0C8.5 0 0 8.5 0 19c0 13.7 19 31 19 31s19-17.3 19-31C38 8.5 29.5 0 19 0z" fill="#d4343e"/>
  <circle cx="19" cy="19" r="7" fill="#ffffff"/>
</svg>`;

export default function ContactMap({ lat, lng, address, zoom = 17 }: ContactMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: LeafletMap | null = null;
    let cancelled = false;
    let raf = 0;
    let timer: number | undefined;

    // 动态导入 Leaflet —— 仅在浏览器环境求值，避免 SSR 时 window 未定义
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(el, { scrollWheelZoom: false }).setView([lat, lng], zoom);

      // 卫星影像底图（Esri World Imagery，更新及时、大陆可访问）
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
        }
      ).addTo(map);

      // 路名/边界标注图层（叠加在影像上，便于辨认方位）
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "" }
      ).addTo(map);

      const icon = L.divIcon({
        className: "sonida-map-pin",
        html: PIN_SVG,
        iconSize: [38, 50],
        iconAnchor: [19, 50],
        popupAnchor: [0, -46],
      });

      L.marker([lat, lng], { icon, title: "Songdian Technology" })
        .addTo(map)
        .bindPopup(`<strong>Songdian Technology</strong><br>${address}`);

      // 外层用 aspect-ratio，初始化瞬间高度可能尚未算好，修正一次避免灰块
      const fix = () => map?.invalidateSize();
      raf = requestAnimationFrame(fix);
      timer = window.setTimeout(fix, 200);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
      if (map) map.remove();
    };
  }, [lat, lng, zoom, address]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="img"
      aria-label={`Map showing Songdian Technology location: ${address}`}
    />
  );
}
