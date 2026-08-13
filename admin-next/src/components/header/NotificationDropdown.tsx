"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { apiFetch, swrFetcher } from "@/lib/api-client";

interface BusinessNotification {
  key: string;
  type: "NEW_INQUIRY" | "FOLLOW_UP_OVERDUE" | "SMTP_FAILED";
  title: string;
  message: string;
  inquiry_id: number;
  created_time: string | null;
  read: boolean;
}

interface NotificationData {
  list: BusinessNotification[];
  unread_count: number;
}

const TYPE_DOT: Record<BusinessNotification["type"], string> = {
  NEW_INQUIRY: "bg-blue-500",
  FOLLOW_UP_OVERDUE: "bg-amber-500",
  SMTP_FAILED: "bg-red-500",
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data, mutate } = useSWR<NotificationData>(
    "/admin/notifications",
    swrFetcher,
    { refreshInterval: 30_000 }
  );

  async function openNotification(item: BusinessNotification) {
    try {
      if (!item.read) {
        await apiFetch("/admin/notifications/read", {
          method: "POST",
          body: { notification_keys: [item.key] },
        });
        await mutate();
      }
    } finally {
      setIsOpen(false);
      router.push(`/inquiries#inquiry-${item.inquiry_id}`);
    }
  }

  async function markAllRead() {
    await apiFetch("/admin/notifications/read", {
      method: "POST",
      body: { mark_all: true },
    });
    await mutate();
  }

  return (
    <div className="relative">
      <button
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`通知${data?.unread_count ? `，${data.unread_count} 条未读` : ""}`}
      >
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z" fill="currentColor" />
        </svg>
        {!!data?.unread_count && (
          <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {data.unread_count > 99 ? "99+" : data.unread_count}
          </span>
        )}
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] w-[320px] rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[380px] lg:right-0"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h5 className="text-base font-semibold text-gray-800 dark:text-gray-200">业务通知</h5>
          {!!data?.unread_count && (
            <button onClick={markAllRead} className="text-xs text-brand-500 hover:text-brand-600">全部已读</button>
          )}
        </div>
        {!data?.list.length ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">暂无通知</div>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {data.list.map((item) => (
              <button
                key={item.key}
                onClick={() => openNotification(item)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${item.read ? "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900" : "border-brand-100 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-900/10"}`}
              >
                <span className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_DOT[item.type]}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{item.message}</span>
                    {item.created_time && <span className="mt-1 block text-[11px] text-gray-400">{new Date(item.created_time).toLocaleString("zh-CN")}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Dropdown>
    </div>
  );
}
