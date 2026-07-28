/*
 * 共享 TypeScript 类型定义（issue #6）。
 *
 * 集中定义各页面此前散落在本地的接口，统一命名与字段，方便跨页面复用，
 * 并尽量与后端（FastAPI）的 VO / 响应信封保持一致。
 *
 * 后端统一响应信封：{ code: "0", msg, data, ... }
 * 分页响应：{ list: T[], total: number, page: number, page_size: number }
 */

import type { ApiError } from "@/lib/api-client";

/** 重新导出统一错误类型，方便页面 `import type { ApiError } from "@/types"`。 */
export type { ApiError };

/** 后端统一分页响应结构（PageResponse）。 */
export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

/** 产品分类（对应后端 CategoryVO / product-categories）。 */
export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
}

/** 新闻分类（对应后端 news-categories VO，字段与产品分类对齐）。 */
export interface NewsCategory {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
}

/** 产品（对应后台产品列表/详情中的字段子集）。 */
export interface Product {
  id: number;
  title: string;
  slug: string;
  sku: string | null;
  stock_status: string;
  status: string;
  sort_order: number;
  cover_image: string | null;
  category: { id: number; name: string } | null;
}

/** 新闻（对应后台新闻列表/详情中的字段子集）。 */
export interface NewsItem {
  id: number;
  title: string;
  slug: string;
  status: string;
  sort_order: number;
  author: string | null;
  published_at: string | null;
  created_time: string | null;
}

/** 询盘状态：后端枚举 NEW / REPLIED / ARCHIVED（inquiry/models.py）。 */
export type InquiryStatus = "NEW" | "REPLIED" | "ARCHIVED";

/** 询盘（对应 InquiryVO / InquiryDetailVO）。 */
export interface Inquiry {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  country: string | null;
  product_interest: string | null;
  message: string;
  source_page: string | null;
  biz_req_no: string;
  status: InquiryStatus;
  smtp_status: string;
  reply_note: string | null;
  created_time: string | null;
  updated_time: string | null;
}

/** 后台管理员用户（对应 account 页面的 Profile）。 */
export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  role_name: string | null;
}

/** 后台角色（用于角色下拉等场景，字段从后端 AdminRole 简化而来）。 */
export interface AdminRole {
  id: number;
  name: string;
  description: string | null;
}

/** 媒体资源记录（对应后端 upload 返回的数据；目前后端仅返回上传结果，列表接口待补充）。 */
export interface MediaItem {
  url: string;
  name: string;
  createdAt: string;
}
