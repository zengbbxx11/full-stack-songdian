import type { Page } from "@playwright/test";

/**
 * 等待 React 完成注水。
 *
 * 背景：`page.goto()` / `page.reload()` 默认在 window load 时返回。此时 SSR 产出的
 * DOM 已经可以读写（`fill()` 能成功、元素能点到），但 React 还没接管事件。若紧接着
 * 就 `fill()` / `click()` / `check()`，在 dev 首次编译较慢或多进程并发跑用例
 * （workers: 2）时，操作会打在"没有事件处理器"的 DOM 上，表现为：
 *   - 登录按钮 `<button type="submit">` 触发浏览器原生表单 GET 提交，用户名密码
 *     被拼进 URL（`/signin?username=...&password=...`），登录后不跳转；
 *   - checkbox 只改了 DOM 不更新 React 状态，"发布选中"按钮永远不出现；
 *   - 侧边栏 class 不变、移动端抽屉不收起、下拉菜单不弹出；防抖搜索不发请求。
 * 这些都是"操作无效、无请求、无报错"的假失败，极易被误判成服务端 BUG。
 *
 * 判定依据（本机实测）：load 时 `document.body` 上没有任何 React 内部属性，
 * 注水完成后（本机约 350ms）会出现 `__reactFiber$` / `__reactProps$`。
 * 注意不能用 `waitUntil: "networkidle"` 代替：dev 下网络静默会早于注水完成。
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Object.keys(document.body).some((key) => key.startsWith("__reactProps")),
  );
}

/** 打开页面并等待 React 完成注水后再返回，之后再交互才是安全的。 */
export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "load" });
  await waitForHydration(page);
}
