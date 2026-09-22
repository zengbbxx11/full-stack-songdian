"use client";
/*
 * 相册树节点（从媒体页抽出，供媒体库页与媒体选择器共用）。
 * - 折叠/展开子相册；点击相册名选中（onSelect）
 * - 展开态默认由节点自己管；父组件传 openIds 即改为受控（媒体库「新建后定位到新相册」需要）
 * - 同级排序（可选）：传 sortable 后行可拖动，并出现「上移 / 下移」按钮（触摸端不触发 HTML5 拖拽）
 * - 操作按钮（上移 / 下移 / 编辑 / 删除）在行内**右侧独占一列**（flex 分栏，不是浮层）：
 *   桌面 hover 才出现（不占位时名字完整），触摸端常显；任何情况下都不会盖住相册名

 * - 行模板（缩进/箭头槽/图标/行内间距）与媒体页「全部 / 未分类」虚拟行共用 types.ts 常量，
 *   否则根级相册的文字会看起来比「全部」低一级
 */
import React, { useState } from "react";

import { FolderIcon, TrashBinIcon } from "@/icons";

import {
  ALBUM_ARROW_SLOT,
  ALBUM_ICON_CLASS,
  ALBUM_INDENT,
  ALBUM_ROW_GAP_CLASS,
  ALBUM_ROW_PAD,
  type Album,
  type TreeAlbum,
} from "./types";

/** 同级拖动排序的回调集合（不传则不渲染拖拽与上移/下移）。 */
export interface AlbumSortable {
  busy?: boolean;
  draggingId: number | null;
  overId: number | null;
  onDragStart: (id: number) => void;
  onDragOver: (id: number) => void;
  onDrop: (id: number) => void;
  onDragEnd: () => void;
  onMove: (id: number, delta: number) => void;
}

export default function AlbumNode({
  album, selectedAlbumId, onSelect, onEdit, onDelete, openIds, onToggleOpen, index = 0, siblingCount = 1, sortable,
}: {
  album: TreeAlbum; selectedAlbumId: number | null; onSelect: (id: number) => void;
  /** 编辑/删除（可选）：不传则不渲染操作条（媒体选择器只做浏览选择） */
  onEdit?: (a: Album) => void; onDelete?: (a: Album) => void;
  /** 受控展开（可选）：传入后展开态由父组件管理；不传则回退节点内部 state（媒体选择器行为不变） */
  openIds?: Set<number>; onToggleOpen?: (id: number) => void;
  /** 同级下标与总数（可选）：用于「上移 / 下移」的首末置灰 */
  index?: number; siblingCount?: number;
  /** 同级拖动排序（可选）：不传则与旧行为完全一致 */
  sortable?: AlbumSortable;
}) {
  const [openState, setOpenState] = useState(false);
  // 只有「展开集合 + 切换回调」成对给出时才走受控：只传 openIds 时回退内部 state，
  // 避免出现「开关点了没反应」（受控但没人接收切换事件）。
  const controlled = openIds !== undefined && onToggleOpen !== undefined;
  const open = controlled ? openIds.has(album.id) : openState;
  const toggleOpen = () => {
    if (controlled) onToggleOpen(album.id);
    else setOpenState((prev) => !prev);
  };
  const isSelected = selectedAlbumId === album.id;
  const hasChildren = album.children.length > 0;
  const padLeft = ALBUM_ROW_PAD + album.depth * ALBUM_INDENT;
  const isDragging = sortable?.draggingId === album.id;
  const isDropTarget = Boolean(sortable) && sortable?.overId === album.id && sortable?.draggingId !== null;
  const showActions = Boolean(sortable) || Boolean(onEdit && onDelete);

  return (
    <>
      <li
        className={`group flex items-center gap-1 rounded-lg ${sortable ? "cursor-grab active:cursor-grabbing" : ""} ${
          isDragging ? "opacity-50" : ""
        } ${isDropTarget ? "bg-brand-50/70 dark:bg-brand-900/10" : ""}`}
        draggable={sortable !== undefined && !sortable.busy}
        onDragStart={sortable ? (e) => { e.dataTransfer.effectAllowed = "move"; sortable.onDragStart(album.id); } : undefined}
        onDragEnd={sortable ? () => sortable.onDragEnd() : undefined}
        onDragOver={sortable ? (e) => { e.preventDefault(); sortable.onDragOver(album.id); } : undefined}
        onDrop={sortable ? (e) => { e.preventDefault(); sortable.onDrop(album.id); } : undefined}
      >
        <button
          onClick={() => onSelect(album.id)}
          aria-current={isSelected ? "true" : undefined}
          // 计数提示挂在主按钮上而不是计数徽标上：桌面悬停时徽标会被隐藏腾空间，
          // 挂在徽标上等于「想悬停看数字时它反而消失」。
          title={`含子相册共 ${album.total_count ?? album.count} 个素材（直系 ${album.count} 个）`}
          className={`flex-1 min-w-0 text-left rounded-lg text-sm flex items-center justify-between gap-1 transition-colors py-1.5 ${
            isSelected
              ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
          style={{ paddingLeft: `${padLeft}px`, paddingRight: "4px" }}
        >
          <span className={`truncate flex items-center ${ALBUM_ROW_GAP_CLASS} min-w-0`}>
            {hasChildren ? (
              <span
                role="button" tabIndex={0}
                aria-expanded={open} aria-label={`${open ? "折叠" : "展开"} ${album.name}`}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 cursor-pointer flex items-center justify-center"
                style={{ width: ALBUM_ARROW_SLOT }}
                onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleOpen(); } }}
              >
                <svg width={10} height={10} viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-90" : ""} text-gray-400`}>
                  <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            ) : (
              // 无子相册也占同样的箭头槽位，保证同级（含「全部 / 未分类」）文字左缘对齐
              <span className="shrink-0" style={{ width: ALBUM_ARROW_SLOT }} />
            )}
            <FolderIcon className={ALBUM_ICON_CLASS} />
            {/* 名字过长时截断，title 提供原生提示看全名（与计数徽标的做法一致） */}
            <span className="truncate" title={album.name}>{album.name}</span>
          </span>
          {/* 桌面端悬停时把计数让给名字（此时操作按钮出现，横向最紧张）。
              注意：本行的 `md:group-hover:hidden md:group-focus-within:hidden` 与操作组的 `md:hidden md:group-hover:flex md:group-focus-within:flex [@media(hover:none)]:flex`
              共用同一个 group-hover 触发条件，靠 Tailwind 的变体层叠（md: 变体排在基础工具类之后）
              保证同时生效——只改其中一条会让「计数已让位但按钮没出现」这类不同步问题出现。 */}
          <span className="text-[10px] tabular-nums shrink-0 mr-1 md:group-hover:hidden md:group-focus-within:hidden">
            {album.total_count ?? album.count}
          </span>
        </button>
        {/* 排序与编辑/删除：行内右侧独占一列（不覆盖名字）。桌面端 hover 才显示，
            此时主按钮收窄、名字最多被截断；触摸端没有 hover，改为常显；未提供时不渲染 */}
        {showActions && (
        <div className="shrink-0 flex items-center gap-0.5 md:hidden md:group-hover:flex md:group-focus-within:flex [@media(hover:none)]:flex">
          {sortable && (
            <>
              <button onClick={(e) => { e.stopPropagation(); sortable.onMove(album.id, -1); }} disabled={sortable.busy || index === 0} aria-label={`上移 ${album.name}`} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30 md:p-0.5 dark:hover:bg-gray-800">
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400"><path d="m5 15 7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); sortable.onMove(album.id, 1); }} disabled={sortable.busy || index >= siblingCount - 1} aria-label={`下移 ${album.name}`} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30 md:p-0.5 dark:hover:bg-gray-800">
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400"><path d="m5 9 7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </>
          )}
          {onEdit && onDelete && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onEdit(album); }} aria-label={`编辑相册 ${album.name}`} className="rounded p-1.5 hover:bg-gray-100 md:p-0.5 dark:hover:bg-gray-800">
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(album); }} aria-label={`删除相册 ${album.name}`} className="rounded p-1.5 hover:bg-red-50 md:p-0.5 dark:hover:bg-red-900/20">
                <TrashBinIcon className="w-2.5 h-2.5 text-red-400" />
              </button>
            </>
          )}
        </div>
        )}
      </li>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {album.children.map((child, childIndex) => (
            <AlbumNode key={child.id} album={child} selectedAlbumId={selectedAlbumId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} openIds={openIds} onToggleOpen={onToggleOpen} index={childIndex} siblingCount={album.children.length} sortable={sortable} />
          ))}
        </ul>
      )}
    </>
  );
}
