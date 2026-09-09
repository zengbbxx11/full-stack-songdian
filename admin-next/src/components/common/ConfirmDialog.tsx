"use client";
import React, { useEffect, useId, useRef, useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  confirmText?: string;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmText = "删除",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const pending = Boolean(loading || confirming);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  if (!open) return null;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={messageId}
      onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-black/40 open:flex open:items-center open:justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0" onClick={() => { if (!pending) onCancel(); }} />
      {/* 对话框 */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-6 w-full max-w-md mx-4">
        <h3 id={titleId} className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-2">{title}</h3>
        <p id={messageId} className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={pending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (pending) return;
              setConfirming(true);
              try { await onConfirm(); } finally { setConfirming(false); }
            }}
            disabled={pending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {pending ? "处理中..." : confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
