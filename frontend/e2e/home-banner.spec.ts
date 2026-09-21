import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  adminBase,
  adminRequest,
  cleanup,
  frontendBase,
  removeUploads,
  uploadFixtureImage,
} from "./fixtures";
import { gotoHydrated } from "./hydration";

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

/**
 * 首页轮播（后台设置 home_banners → 官网 Hero）端到端用例。
 *
 * 前置：本地/CI 的后端需配置 NEXT_REVALIDATE_URL + REVALIDATE_SECRET，
 * 否则官网 ISR 不即时刷新，下面的 waitForHomepageHtml 会等到超时。
 * 三条用例 serial：夹具图片在第一条上传、面板用例复用、afterAll 统一恢复设置并清理。
 */
test.describe.configure({ mode: "serial" });

const CAROUSEL_NAV = "Homepage banner carousel";

async function readBannerSetting(admin: APIRequestContext): Promise<string | undefined> {
  const res = await admin.get("/api/v1/admin/settings");
  const body = (await res.json()) as { data?: Record<string, { value?: string }> };
  return body?.data?.home_banners?.value;
}

async function writeBannerSetting(admin: APIRequestContext, value: string): Promise<void> {
  const res = await admin.put("/api/v1/admin/settings", { data: { home_banners: value } });
  const body = (await res.json()) as { code?: string };
  expect(body.code).toBe("0");
}

/** 等官网 HTML 再生到目标状态（后台保存触发 revalidate 推送，通常 1–2s）。 */
async function waitForHomepageHtml(page: Page, probe: (html: string) => boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${frontendBase}/`);
        return probe(await res.text());
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000, 5_000] },
    )
    .toBe(true);
}

/**
 * 接受 Cookie 提示。
 * 指示点在 cookie 提示条可见时会整体隐藏（避免被压住），因此断言/点击指示点前必须先关掉提示，
 * 否则断言会因为「提示条还在」而失真（无指示点 ≠ 轮播有问题）。
 */
async function acceptCookies(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: "Accept all" });
  if (await accept.count()) {
    await accept.click();
    await expect(page.getByRole("region", { name: "Cookie consent" })).toHaveCount(0);
  }
}

/** Hero 叠加层（文字/按钮容器）的显隐状态：opacity 0 + inert 表示「轮到纯图页」。 */
function overlayState(page: Page) {
  return page.evaluate(() => {
    // h1 的祖先里第一个 absolute inset-0 层即 HeroCarousel 的叠加层包装（文字容器是 relative/静态）
    const overlay = document.querySelector("h1")?.closest("div.absolute.inset-0");
    if (!overlay) return null;
    return { opacity: getComputedStyle(overlay).opacity, inert: overlay.hasAttribute("inert") };
  });
}

test.describe.serial("admin home banner carousel", () => {
  let admin: APIRequestContext;
  let original: string | undefined;
  const uploaded: string[] = [];

  // 关闭自动轮播（reduced-motion 分支不建定时器）：断言/点击不必与 6s 计时赛跑，顺带覆盖降级分支
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test.beforeAll(async () => {
    admin = await adminRequest();
    // GET 同时触发设置行的惰性创建（PUT 只更新已存在的行）
    original = await readBannerSetting(admin);
  });

  test.afterAll(async () => {
    await cleanup([
      () => writeBannerSetting(admin, original ?? "[]"),
      () => removeUploads(admin, uploaded),
    ]);
  });

  test("hero rotates through admin-configured banners", async ({ page }) => {
    test.setTimeout(120_000);
    const urlA = await uploadFixtureImage(admin, "banner-a.png");
    const urlB = await uploadFixtureImage(admin, "banner-b.png");
    uploaded.push(urlA, urlB);
    await writeBannerSetting(
      admin,
      JSON.stringify([
        { url: urlA, enabled: true, href: "" },
        { url: urlB, enabled: true, href: "/products" },
        { url: "", enabled: false, href: "" },
      ]),
    );
    await waitForHomepageHtml(page, (html) => html.includes(urlB) && html.includes(CAROUSEL_NAV));

    await gotoHydrated(page, `${frontendBase}/`);
    // cookie 提示条可见时指示点整体不渲染（避免被提示条压住）。
    // 不强断言「提示条必然出现」：若运行环境已存 consent，提示条本就不显示，此时指示点应正常可见。
    const cookieShown = await page.getByRole("region", { name: "Cookie consent" }).count();
    if (cookieShown > 0) {
      await expect(page.getByRole("navigation", { name: CAROUSEL_NAV })).toHaveCount(0);
    }
    await acceptCookies(page);

    const nav = page.getByRole("navigation", { name: CAROUSEL_NAV });
    await expect(nav).toBeVisible();
    // 只渲染启用的张数（第 3 张未启用 → 不存在）
    await expect(nav.getByRole("button", { name: "Go to banner 3" })).toHaveCount(0);
    // 初始：第 1 张 + 完整悬浮文案
    expect(await overlayState(page)).toEqual({ opacity: "1", inert: false });

    // 切到第 2 张：文案淡出（opacity 0 + inert），纯图 + 整图链接
    await nav.getByRole("button", { name: "Go to banner 2" }).click();
    await expect.poll(() => overlayState(page), { timeout: 3_000 }).toEqual({ opacity: "0", inert: true });
    const bannerLink = page.locator('a[aria-label="View more — banner 2"]');
    await expect(bannerLink).toBeAttached();
    // 图片 src 已绝对化到后端 origin（parseHomeBanners 的关键修复点）。
    // 注意：本地生产构建下图片优化器拒绝 loopback 后端图（dangerouslyAllowLocalIP=false，
    // 有意的 SSRF 防护，见 next.config.ts），后端图与产品图一样显示为空白 —— 生产环境正常。
    const imgSrc = await bannerLink.locator("img").getAttribute("src");
    expect(imgSrc).toContain("/_next/image?url=");
    // 后端 origin 可能是 127.0.0.1 或 localhost（跟随构建期 NEXT_PUBLIC_API_URL）
    expect(imgSrc).toContain("%2Fuploads");
    await bannerLink.click();
    await expect(page).toHaveURL(/\/products$/);

    // 手机宽度：轮播与指示点不引起横向溢出
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, `${frontendBase}/`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps the built-in banner as the first slide until an operator replaces it", async ({ page }) => {
    test.setTimeout(120_000);
    // (a) 完全未配置：与改版前一致 —— 无指示点、悬浮文案完整、默认 Banner 图
    await writeBannerSetting(admin, "[]");
    await waitForHomepageHtml(page, (html) => !html.includes(CAROUSEL_NAV) && html.includes("banner.webp"));
    await gotoHydrated(page, `${frontendBase}/`);
    await acceptCookies(page); // 先关提示条，避免「无指示点」是因为 cookie 遮挡而非单张
    await expect(page.getByRole("navigation", { name: CAROUSEL_NAV })).toHaveCount(0);
    expect(await overlayState(page)).toEqual({ opacity: "1", inert: false });

    // (b) 第 1 槽留空 + 第 2 槽启用：首张仍是官网默认 Banner（原有首屏保持原样），第 2 张才是运营的图
    const extraUrl = uploaded[1];
    expect(extraUrl).toBeTruthy();
    await writeBannerSetting(
      admin,
      JSON.stringify([
        { url: "", enabled: true, href: "" },
        { url: extraUrl, enabled: true, href: "" },
        { url: "", enabled: false, href: "" },
      ]),
    );
    await waitForHomepageHtml(page, (html) => html.includes(CAROUSEL_NAV) && html.includes("banner.webp"));
    await gotoHydrated(page, `${frontendBase}/`);
    await acceptCookies(page);
    const nav = page.getByRole("navigation", { name: CAROUSEL_NAV });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button")).toHaveCount(2);
    const leadSrc = await page.locator("section img").first().getAttribute("src");
    expect(leadSrc).toContain("banner.webp");
    // 切到第 2 张：文案淡出（默认首图之外的图都是纯图展示）
    await nav.getByRole("button", { name: "Go to banner 2" }).click();
    await expect.poll(() => overlayState(page), { timeout: 3_000 }).toEqual({ opacity: "0", inert: true });
  });

  test("art direction: mobile viewport loads the portrait image", async ({ page }) => {
    test.setTimeout(120_000);
    const wideUrl = uploaded[0];
    const portraitUrl = await uploadFixtureImage(admin, "banner-portrait.png");
    uploaded.push(portraitUrl);
    await writeBannerSetting(
      admin,
      JSON.stringify([
        { url: wideUrl, mobileUrl: portraitUrl, enabled: true, href: "" },
        { url: "", enabled: false, href: "" },
        { url: "", enabled: false, href: "" },
      ]),
    );
    // 上传落盘名是 uuid（无内容去重），用 URL 最后一段来区分两张图
    const seg = (url: string) => decodeURIComponent(url).split("/").pop() ?? "";
    // SSR HTML 里应带 <picture> 的移动端 source（配了竖版图就不走 next/image 优化器）
    await waitForHomepageHtml(page, (html) => html.includes(seg(portraitUrl)));

    const currentSrc = () =>
      page.evaluate(() => {
        const img = document.querySelector("section picture img");
        return img instanceof HTMLImageElement ? img.currentSrc : "";
      });

    await gotoHydrated(page, `${frontendBase}/`);
    // 桌面：用宽图
    await expect.poll(currentSrc, { timeout: 5_000 }).toContain(seg(wideUrl));
    // 手机：只加载竖版图（浏览器按 media 重新选源）
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(currentSrc, { timeout: 5_000 }).toContain(seg(portraitUrl));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("admin settings panel edits and saves the banner slots", async ({ page }) => {
    // 复用夹具会话 Cookie（登录限流 10 次/分钟，勿逐用例登录）
    const state = await admin.storageState();
    await page.context().addCookies(state.cookies);
    await gotoHydrated(page, `${adminBase}/settings`);

    const panel = page.locator("section").filter({ hasText: "首页轮播" });
    await expect(panel).toBeVisible();
    // 第 1 张是首屏主图（留空=官网默认 Banner），因此没有启用开关
    await expect(panel.getByText("第 1 张（首屏主图 · 保留官网悬浮文字与按钮）")).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "启用第 1 张轮播图" })).toHaveCount(0);

    // 槽位 2：从媒体库选图 → 选后自动启用 → 填跳转链接
    const slot2 = panel.locator("div.rounded-xl").filter({ hasText: "第 2 张" });
    // 上一条用例可能已给第 2 槽留了图，先清空以保证从「未选择」走完整流程（顺带覆盖「移除」）
    const clearSlot2 = slot2.getByRole("button", { name: "移除" });
    if (await clearSlot2.count()) await clearSlot2.click();
    await slot2.getByRole("button", { name: "从媒体库选择" }).click();
    await expect(page.getByRole("heading", { name: /从媒体库选择图片/ })).toBeVisible();
    await page.getByRole("button", { name: /^选择 / }).first().click();
    await page.getByRole("button", { name: /^确定（1）$/ }).click();
    await expect(slot2.getByRole("button", { name: "更换图片" })).toBeVisible();
    await expect(slot2.getByRole("checkbox", { name: "启用第 2 张轮播图" })).toBeChecked();
    await slot2.getByRole("textbox", { name: "第 2 张轮播图跳转链接" }).fill("/products");

    await panel.getByRole("button", { name: "保存首页轮播" }).click();
    await expect(page.getByText("首页轮播已保存")).toBeVisible();

    // 服务端值校验（管理端 GET 直读库，无缓存）
    const raw = await readBannerSetting(admin);
    const slots = JSON.parse(raw ?? "[]") as { url: string; enabled: boolean; href: string }[];
    expect(slots[1].enabled).toBe(true);
    expect(slots[1].href).toBe("/products");
    expect(slots[1].url.startsWith("/uploads/")).toBe(true);

    // 面板在 390px 下无横向溢出（沿用后台移动端约定）。
    // 注意：从桌面视口缩到 390 的瞬间，侧边栏正处于 transition-all（300ms）滑向抽屉外的动画中，
    // 此刻测 scrollWidth 会把动画中的侧栏计入（瞬态 +168px），等过渡结束再测。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
