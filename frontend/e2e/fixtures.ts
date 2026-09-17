import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/**
 * e2e 夹具工厂：通过后台 API 自建内容，避免用例依赖某台机器上的真实数据。
 *
 * 约定（与 public-quality / content-lifecycle 一致）：
 * - 每个用例自己创建分类 + 内容，并在 `finally` 里删除，逐条容错；
 * - 分类 slug 带随机后缀，避免与真实内容或其他并行用例冲突；
 * - 只在 localhost / 127.0.0.1 目标上运行，绝不写到外部环境。
 */

export const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
export const frontendBase = process.env.E2E_FRONTEND_URL || "http://127.0.0.1:3000";
export const apiBase = process.env.E2E_API_URL || "http://127.0.0.1:8000";

const adminPassword = () => process.env.E2E_ADMIN_PASSWORD || "Songdian@2026";

/** 仅用于建立媒体记录的 1×1 PNG；页面图片断言会拦截 `_next/image` 请求。 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=",
  "base64",
);

type ResultBody = { code?: unknown; data?: unknown; msg?: unknown };
type JsonResponse = { json: () => Promise<unknown>; status: () => number };

export function assertLocalTarget(): void {
  for (const base of [adminBase, frontendBase, apiBase]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw Error("Local fixture only");
  }
}

export function fixtureSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function expectOk(response: JsonResponse, what: string): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as ResultBody | null;
  const data = body?.data;
  if (!body || body.code !== "0" || typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${what} failed: ${response.status()} ${JSON.stringify(body)}`);
  }
  return data as Record<string, unknown>;
}

/** 登录后的后台 API 上下文（Cookie 由 request context 自动携带）。 */
async function loginAdmin(): Promise<APIRequestContext> {
  assertLocalTarget();
  const admin = await playwrightRequest.newContext({ baseURL: adminBase });
  const login = await admin.post("/api/v1/admin/login", { data: { username: "admin", password: adminPassword() } });
  const body = (await login.json().catch(() => null)) as ResultBody | null;
  if (body?.code !== "0") {
    await admin.dispose();
    throw new Error(`admin login failed: ${login.status()} ${JSON.stringify(body)}`);
  }
  return admin;
}

let adminSession: Promise<APIRequestContext> | undefined;

/**
 * 每个 worker 复用一个后台会话。
 * 登录限流为 10 次/分钟（后端 `RATE_LOGIN_PER_MIN`），逐用例登录会在连续用例里触发 429，
 * 因此这里缓存会话（worker 进程结束时随进程回收），用例内不要再 dispose。
 */
export function adminRequest(): Promise<APIRequestContext> {
  adminSession ??= loginAdmin().catch((error: unknown) => {
    adminSession = undefined;
    throw error;
  });
  return adminSession;
}

/** 上传一张夹具图片，返回 `/uploads/...` 地址（同一夹具复用同一张图，减少媒体残留）。 */
export async function uploadFixtureImage(admin: APIRequestContext, name = "fixture.png"): Promise<string> {
  const data = await expectOk(
    await admin.post("/api/v1/admin/upload", { multipart: { file: { name, mimeType: "image/png", buffer: PNG } } }),
    "fixture upload",
  );
  return String(data.url);
}

export async function createProductCategory(admin: APIRequestContext, label: string) {
  const slug = `fixture-products-${fixtureSuffix()}`;
  const data = await expectOk(
    await admin.post("/api/v1/admin/categories", { data: { name: `${label} ${slug}`, slug } }),
    "fixture product category",
  );
  return { id: Number(data.id), slug: String(data.slug), name: String(data.name) };
}

export async function createNewsCategory(admin: APIRequestContext, label: string) {
  const slug = `fixture-news-${fixtureSuffix()}`;
  const data = await expectOk(
    await admin.post("/api/v1/admin/news-categories", { data: { name: `${label} ${slug}`, slug } }),
    "fixture news category",
  );
  return { id: Number(data.id), slug: String(data.slug), name: String(data.name) };
}

export type ProductFixture = { id: number; slug: string; categorySlug: string; mediaUrl?: string; galleryUrl?: string };

/**
 * 创建已发布产品。
 *
 * - `media: true` 时上传一张图片，同时用作封面与图库图（官网图库需要封面才会渲染）；
 * - `gallery`：额外图库图数量（与封面共用同一 URL，仅用于让缩略图数量满足断言）；
 * - `attributes`：规格（`slug` 由名称推导，`zoom` / `sensor` / `screen` / `video-resolution`
 *   会进入产品页的 key facts）。
 */
export async function createProduct(
  admin: APIRequestContext,
  options: {
    categoryId: number;
    index?: number;
    media?: boolean;
    gallery?: number;
    attributes?: { name: string; value: string }[];
    detailImages?: number;
    summary?: string;
  },
): Promise<ProductFixture> {
  const suffix = fixtureSuffix();
  const slug = `fixture-product-${suffix}`;
  const title = `Fixture camera ${suffix}${options.index ? " " + options.index : ""}`;
  const mediaUrl = options.media || options.detailImages ? await uploadFixtureImage(admin) : undefined;
  // 图库图必须是独立的上传地址：ProductGallery 以 src 判断当前主图，
  // 复用封面地址会让「切换到图库图」被当成仍选中封面。
  const galleryUrl = options.gallery ? await uploadFixtureImage(admin, "gallery.png") : undefined;

  let contentHtml = "<p>Fixture product body.</p>";
  for (let i = 0; i < (options.detailImages ?? 0); i += 1) {
    contentHtml += `<img src="${mediaUrl}" alt="Fixture detail ${i + 1}" width="1200" height="800">`;
  }

  const data = await expectOk(
    await admin.post("/api/v1/admin/products", {
      data: {
        title,
        slug,
        summary: options.summary ?? "Fixture product summary.",
        content_html: contentHtml,
        category_id: options.categoryId,
        status: "PUBLISHED",
        cover_image: options.media ? mediaUrl : null,
      },
    }),
    "fixture product",
  );
  const id = Number(data.id);

  for (let i = 0; i < (options.gallery ?? 0); i += 1) {
    await expectOk(
      await admin.post(`/api/v1/admin/products/${id}/gallery`, {
        data: { image_url: galleryUrl, alt: `Fixture gallery ${i + 1}`, sort_order: i },
      }),
      "fixture product gallery",
    );
  }
  for (const attribute of options.attributes ?? []) {
    await expectOk(
      await admin.post(`/api/v1/admin/products/${id}/attributes`, {
        data: { name: attribute.name, slug: attribute.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), value: attribute.value },
      }),
      "fixture product attribute",
    );
  }
  const category = data.category as { slug?: unknown } | undefined;
  return { id, slug, categorySlug: String(category?.slug ?? ""), mediaUrl, galleryUrl };
}

export type NewsFixture = { ids: number[]; slugs: string[]; coverUrls: string[] };

/**
 * 批量创建已发布新闻（用于分页、首页卡片与相关文章）。
 *
 * `cover: true` 时**每篇各用一张独立上传图**：文章页会对封面图做 preload（720px），
 * 若相关卡片复用同一 URL，Chrome 会复用该预加载结果，使相关卡片按封面尺寸选图，
 * 导致「相关卡片用更窄容器」的断言失真。
 */
export async function createNews(
  admin: APIRequestContext,
  options: { categoryId: number; count: number; cover?: boolean; body?: string },
): Promise<NewsFixture> {
  const suffix = fixtureSuffix();
  const ids: number[] = [];
  const slugs: string[] = [];
  const coverUrls: string[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const slug = `fixture-news-${suffix}-${i + 1}`;
    const cover = options.cover ? await uploadFixtureImage(admin, `news-cover-${i + 1}.png`) : null;
    if (cover) coverUrls.push(cover);
    const data = await expectOk(
      await admin.post("/api/v1/admin/news", {
        data: {
          title: `Fixture article ${suffix} ${i + 1}`,
          slug,
          summary: `Fixture article summary ${i + 1}.`,
          content_html: options.body ?? `<p>Fixture article body ${i + 1}.</p>`,
          category_id: options.categoryId,
          status: "PUBLISHED",
          published_at: new Date().toISOString(),
          cover_image: cover,
        },
      }),
      "fixture news",
    );
    ids.push(Number(data.id));
    slugs.push(slug);
  }
  return { ids, slugs, coverUrls };
}

/** 逐条容错清理，避免清理失败掩盖原始失败原因。 */
export async function cleanup(steps: (() => Promise<unknown>)[]): Promise<void> {
  for (const step of steps) {
    try {
      await step();
    } catch {
      /* 清理失败不影响用例结论 */
    }
  }
}

export async function removeProducts(admin: APIRequestContext, ids: number[]): Promise<void> {
  for (const id of ids) await admin.delete(`/api/v1/admin/products/${id}`);
}

export async function removeNews(admin: APIRequestContext, ids: number[]): Promise<void> {
  for (const id of ids) await admin.delete(`/api/v1/admin/news/${id}`);
}

/**
 * 尽力删除夹具上传的媒体记录（内容删除后就不再被引用）。
 * 只扫描最近若干页记录，失败不影响用例结论；本地未被清理的图片不影响后续运行。
 */
export async function removeUploads(admin: APIRequestContext, urls: (string | undefined)[]): Promise<void> {
  const wanted = new Set(urls.filter((url): url is string => Boolean(url)));
  if (wanted.size === 0) return;
  for (const page of [1, 2, 3]) {
    const list = await (await admin.get(`/api/v1/admin/upload/records?page=${page}&page_size=100`)).json();
    const records = (list?.data?.list ?? []) as { id: number; url: string }[];
    for (const record of records) {
      if (wanted.has(record.url)) {
        await admin.delete(`/api/v1/admin/upload/${record.id}?force=true`);
        wanted.delete(record.url);
      }
    }
    if (wanted.size === 0 || records.length === 0) return;
  }
}
