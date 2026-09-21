"use client";
/*
 * 相册树节点（从媒体页抽出，供媒体库页与媒体选择器共用）。
 * - 折叠/展开子相册；点击相册名选中（onSelect）
 * - 编辑/删除按钮：桌面 hover 显示，触摸端常显（max-md）
 * - 相册计数右侧常显操作，移动端用 mr-16 给操作条让位
 */
import React, { useState } from "react";

import { FolderIcon, TrashBinIcon } from "@/icons";
import type { Album, TreeAlbum } from "./types";

export default function AlbumNode({
  album, selectedAlbumId, onSelect, onEdit, onDelete,
}: {
  album: TreeAlbum; selectedAlbumId: number | null; onSelect: (id: number) => void;
  /** 编辑/删除（可选）：不传则不渲染操作条（媒体选择器只做浏览选择） */
  onEdit?: (a: Album) => void; onDelete?: (a: Album) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSelected = selectedAlbumId === album.id;
  const hasChildren = album.children.length > 0;
  const padLeft = 12 + album.depth * 16;

  return (
    <>
      <li className="group relative">
        <button
          onClick={() => onSelect(album.id)}
          className={`w-full text-left rounded-lg text-sm flex items-center justify-between gap-1 transition-colors py-1.5 ${
            isSelected
              ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
          style={{ paddingLeft: `${padLeft}px`, paddingRight: "4px" }}
        >
          <span className="truncate flex items-center gap-1 min-w-0">
            {hasChildren ? (
              <span
                role="button" tabIndex={0}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setOpen(!open); } }}
              >
                <svg width={10} height={10} viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-90" : ""} text-gray-400`}>
                  <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <FolderIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{album.name}</span>
          </span>
          <span className="text-[10px] tabular-nums shrink-0 mr-1 max-md:mr-16" title={`含子相册共 ${album.total_count ?? album.count} 个素材（直系 ${album.count} 个）`}>
            {album.total_count ?? album.count}
          </span>
        </button>
        {/* 编辑/删除：桌面端 hover 才显示，触摸端没有 hover，移动端改为常显；未提供时不渲染 */}
        {onEdit && onDelete && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white dark:bg-gray-900 rounded px-1 mr-4 max-md:border max-md:border-gray-200 max-md:shadow-sm max-md:dark:border-gray-700 md:hidden md:group-hover:flex">
          <button onClick={(e) => { e.stopPropagation(); onEdit(album); }} aria-label={`编辑相册 ${album.name}`} className="rounded p-1.5 hover:bg-gray-100 md:p-0.5 dark:hover:bg-gray-800">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(album); }} aria-label={`删除相册 ${album.name}`} className="rounded p-1.5 hover:bg-red-50 md:p-0.5 dark:hover:bg-red-900/20">
            <TrashBinIcon className="w-2.5 h-2.5 text-red-400" />
          </button>
        </div>
        )}
      </li>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {album.children.map((child) => (
            <AlbumNode key={child.id} album={child} selectedAlbumId={selectedAlbumId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </>
  );
}
