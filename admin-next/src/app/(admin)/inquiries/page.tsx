"use client";
import React, { useEffect, useState } from "react";

interface Inquiry { id: number; name: string; email: string; company: string | null; message: string; status: string; created_time: string; }

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function InquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filtered, setFiltered] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    fetch("/api/v1/admin/inquiries?page_size=100", { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      .then(r => r.json()).then(j => { const list = j.data?.list || j.data?.items || []; setItems(list); setFiltered(list); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 本地搜索过滤
  useEffect(() => {
    if (!search.trim()) { setFiltered(items); return; }
    const q = search.toLowerCase();
    setFiltered(items.filter(i =>
      i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q) ||
      i.company?.toLowerCase().includes(q) || i.message.toLowerCase().includes(q)
    ));
  }, [search, items]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Inquiries</h2>
        <span className="text-sm text-gray-400">{filtered.length} of {items.length}</span>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, company, or message..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500 lg:w-96"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" style={{ width: "60%", animationDelay: `${i * 0.1}s` }} /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{search ? "No matching inquiries" : "No inquiries yet"}</td></tr>
            ) : filtered.map(i => (
              <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{i.name}</td>
                <td className="px-4 py-3 text-gray-500">{i.email}</td>
                <td className="px-4 py-3 text-gray-500">{i.company || "-"}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[280px]">
                  {/* 可展开的消息 */}
                  <button
                    onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
                    className="text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span className={expandedId === i.id ? "" : "line-clamp-2"}>
                      {i.message}
                    </span>
                    {i.message.length > 60 && (
                      <span className="ml-1 text-xs text-brand-500">
                        {expandedId === i.id ? "▲ Less" : "▼ More"}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${i.status === "NEW" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                    {i.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
