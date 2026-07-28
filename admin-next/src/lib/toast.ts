/*
 * 统一错误提示工具（issue #16）。
 *
 * 页面已通过 ToastContext 的 useToast() 在组件内展示通知。本模块提供：
 * 1) 一个与 React 解耦的桥接层 —— ToastProvider 挂载时把真实实现注册进来，
 *    非组件代码（或希望统一兜底的逻辑）也能唤起 toast；
 * 2) withErrorToast() 包装器 —— 自动捕获异常并以 error toast 呈现，
 *    取代各处散落的 .catch(() => {}) 静默吞错，保证错误可见、可排查。
 */

type ToastType = "success" | "error" | "info" | "warning";

/** 底层 toast 实现签名（与 ToastContext 的 addToast 对齐）。 */
type ToastFn = (message: string, type?: ToastType) => void;

/** 运行时注册的真实实现，初始为 null（SSR / Provider 挂载前无副作用）。 */
let impl: ToastFn | null = null;

/** 由 ToastProvider 在挂载时调用，注册真实 toast 实现。 */
export function registerToast(fn: ToastFn): void {
  impl = fn;
}

/** 显示一条 toast（类型缺省为 info）。 */
export function toast(message: string, type: ToastType = "info"): void {
  impl?.(message, type);
}

export function toastSuccess(message: string): void {
  toast(message, "success");
}

export function toastError(message: string): void {
  toast(message, "error");
}

export function toastInfo(message: string): void {
  toast(message, "info");
}

export function toastWarning(message: string): void {
  toast(message, "warning");
}

/**
 * 包装 Promise：成功返回原值；异常时展示 error toast 并返回 undefined，
 * 避免调用处再写一遍 .catch。绝不静默吞错。
 */
export async function withErrorToast<T>(
  promise: Promise<T>,
  fallbackMsg = "操作失败，请稍后重试"
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    toastError(err instanceof Error ? err.message : fallbackMsg);
    return undefined;
  }
}

/** 从未知异常中安全提取可读消息。 */
export function errorMessage(err: unknown, fallback = "操作失败"): string {
  if (err instanceof Error) return err.message;
  return fallback;
}
